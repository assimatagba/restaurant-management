"""Prepare an external server or a disposable SonarQube on a GitHub runner."""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', choices=['backend', 'frontend'], required=True)
    parser.add_argument('--local', action='store_true', help='Docker Desktop validation; do not change host kernel settings')
    args = parser.parse_args()
    values = {key: os.environ.get(key, '') for key in ('SONAR_HOST_URL', 'SONAR_PROJECT_KEY', 'SONAR_TOKEN')}
    temporary = not any(values.values())
    if not temporary and not all(values.values()):
        raise SystemExit('Incomplete external SonarQube configuration: provide URL, project key and token together.')
    if temporary:
        if not args.local:
            subprocess.run(['sudo', 'sysctl', '-w', 'vm.max_map_count=524288'], check=True)
        subprocess.run(['docker', 'run', '-d', '--name', 'ci-sonarqube', '-p', '127.0.0.1:9000:9000',
                        'sonarqube:community'], check=True)
        host = 'http://127.0.0.1:9000'

        def api(endpoint, data=None, password=None):
            headers = {}
            if password:
                headers['Authorization'] = 'Basic ' + base64.b64encode(('admin:' + password).encode()).decode()
            request = urllib.request.Request(host + '/api/' + endpoint,
                data=urllib.parse.urlencode(data).encode() if data is not None else None, headers=headers)
            with urllib.request.urlopen(request, timeout=15) as response:
                body = response.read()
                return json.loads(body) if body else {}

        deadline = time.monotonic() + 420
        while True:
            try:
                if api('system/status').get('status') == 'UP':
                    break
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                pass
            if time.monotonic() >= deadline:
                raise SystemExit('SonarQube did not become ready within 420 seconds.')
            time.sleep(5)
        # Satisfy the server policy independently of random character distribution.
        password = 'Aa1!' + secrets.token_urlsafe(32)
        if not args.local:
            print('::add-mask::' + password)
        api('users/change_password', {'login': 'admin', 'previousPassword': 'admin', 'password': password}, 'admin')
        key = 'restaurant-' + args.project
        api('projects/create', {'project': key, 'name': 'Restaurant ' + args.project}, password)
        token = api('user_tokens/generate', {'name': 'ci-analysis', 'type': 'PROJECT_ANALYSIS_TOKEN', 'projectKey': key}, password)['token']
        values = {'SONAR_HOST_URL': host, 'SONAR_PROJECT_KEY': key, 'SONAR_TOKEN': token}
    if not args.local:
        print('::add-mask::' + values['SONAR_TOKEN'])
    for name, value in values.items():
        if '\n' in value or '\r' in value:
            raise SystemExit('Invalid multiline SonarQube configuration.')
    with Path(os.environ['GITHUB_ENV']).open('a', encoding='utf-8') as stream:
        for name, value in values.items():
            stream.write(f'{name}={value}\n')
        stream.write(f'SONAR_TEMPORARY={str(temporary).lower()}\n')
    with Path(os.environ['GITHUB_OUTPUT']).open('a', encoding='utf-8') as stream:
        stream.write('enabled=true\n')


if __name__ == '__main__':
    main()
