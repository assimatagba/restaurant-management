import importlib.util
import io
import http.client
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('prepare_sonar', ROOT / 'scripts/prepare_sonar.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def test_partial_external_configuration_fails_without_starting_docker(monkeypatch):
    monkeypatch.setattr('sys.argv', ['prepare_sonar.py', '--project', 'backend'])
    monkeypatch.setenv('SONAR_HOST_URL', 'https://sonar.example')
    monkeypatch.delenv('SONAR_PROJECT_KEY', raising=False)
    monkeypatch.delenv('SONAR_TOKEN', raising=False)
    monkeypatch.setattr(prepare.subprocess, 'run', lambda *a, **kw: pytest.fail('Docker must not start'))
    with pytest.raises(SystemExit, match='Incomplete'):
        prepare.main()


def test_external_configuration_is_reused_and_token_is_masked(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr('sys.argv', ['prepare_sonar.py', '--project', 'backend'])
    for key, value in {'SONAR_HOST_URL': 'https://sonar.example', 'SONAR_PROJECT_KEY': 'backend',
                       'SONAR_TOKEN': 'test-token', 'GITHUB_ENV': str(tmp_path / 'env'),
                       'GITHUB_OUTPUT': str(tmp_path / 'output')}.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(prepare.subprocess, 'run', lambda *a, **kw: pytest.fail('Docker must not start'))
    prepare.main()
    assert 'SONAR_TEMPORARY=false' in (tmp_path / 'env').read_text()
    assert (tmp_path / 'output').read_text() == 'enabled=true\n'
    assert capsys.readouterr().out.strip() == '::add-mask::test-token'


def test_local_start_retries_early_disconnect_without_printing_credentials(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr('sys.argv', ['prepare_sonar.py', '--project', 'backend', '--local'])
    for key in ('SONAR_HOST_URL', 'SONAR_PROJECT_KEY', 'SONAR_TOKEN'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('GITHUB_ENV', str(tmp_path / 'env'))
    monkeypatch.setenv('GITHUB_OUTPUT', str(tmp_path / 'output'))
    commands = []
    monkeypatch.setattr(prepare.subprocess, 'run', lambda cmd, **kw: commands.append(cmd))
    monkeypatch.setattr(prepare.time, 'sleep', lambda _: None)
    monkeypatch.setattr(prepare.secrets, 'token_urlsafe', lambda _: 'a' * 43)
    responses = iter([http.client.RemoteDisconnected(), b'{"status":"UP"}', b'{}', b'{}', b'{"token":"private-token"}'])

    def urlopen(request, timeout):
        if request.full_url.endswith('users/change_password'):
            password = prepare.urllib.parse.parse_qs(request.data.decode())['password'][0]
            assert password.startswith('Aa1!') and len(password) >= 32
        response = next(responses)
        if isinstance(response, Exception):
            raise response
        return io.BytesIO(response)

    monkeypatch.setattr(prepare.urllib.request, 'urlopen', urlopen)
    prepare.main()
    assert len(commands) == 1 and commands[0][0] == 'docker'
    assert 'SONAR_TEMPORARY=true' in (tmp_path / 'env').read_text()
    assert 'private-token' not in capsys.readouterr().out
