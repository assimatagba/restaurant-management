"""Cross-platform installation/startup entry point. Run from any working directory."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / '.venv-ci'


def python_path():
    return ENV / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')


def execute(command, **kwargs):
    print('+', ' '.join(map(str, command)), flush=True)
    subprocess.run([str(part) for part in command], cwd=ROOT, check=True, **kwargs)


def setup(project, development):
    if project in ('backend', 'all'):
        if not python_path().exists():
            venv.EnvBuilder(with_pip=True).create(ENV)
        requirements = ROOT / 'backend' / ('requirements-dev.txt' if development else 'requirements.txt')
        execute([python_path(), '-m', 'pip', 'install', '-r', requirements])
    if project in ('frontend', 'all'):
        if not shutil.which('node'):
            raise RuntimeError('Node.js 24 LTS is required for frontend tests/builds. Install it from nodejs.org.')
        execute(['node', '--version'])
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not npm:
            raise RuntimeError('npm is required with Node.js 24 LTS.')
        execute([npm, 'ci', '--prefix', 'frontend'])
        if development:
            execute([npm, 'exec', '--prefix', 'frontend', '--', 'playwright', 'install', 'chromium'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['setup', 'start', 'test', 'build'])
    parser.add_argument('--project', choices=['backend', 'frontend', 'all'], default='all')
    parser.add_argument('--dev', action='store_true', help='Install coverage and HTML-report dependencies')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        parser.error('Python 3.11+ is required (3.13 recommended).')
    try:
        if args.action == 'setup':
            setup(args.project, args.dev)
        elif args.action == 'start':
            if args.project == 'frontend':
                npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
                if not npm:
                    raise RuntimeError('Install Node.js 24 LTS and run setup --project frontend.')
                print('Frontend: http://127.0.0.1:5173 — run the API on port 8000 in another terminal.', flush=True)
                execute([npm, 'run', 'dev', '--prefix', 'frontend'])
                return 0
            if not python_path().exists():
                raise RuntimeError('Run setup --project all first. The frontend requires the API server.')
            if args.project == 'all':
                from ci_run import build
                directory = ROOT / 'reports/frontend'
                directory.mkdir(parents=True, exist_ok=True)
                build('frontend', directory)
            print(f'Portal: http://{args.host}:{args.port}/\nBack office: http://{args.host}:{args.port}/back-office/\nClient menu: http://{args.host}:{args.port}/front-office/', flush=True)
            execute([python_path(), '-m', 'uvicorn', 'backend.app.main:app', '--host', args.host, '--port', str(args.port)])
        else:
            projects = ['backend', 'frontend'] if args.project == 'all' else [args.project]
            failed = False
            for project in projects:
                try:
                    if args.action == 'test':
                        interpreter = python_path() if python_path().exists() else Path(sys.executable)
                        execute([interpreter, ROOT / 'scripts/ci_run.py', '--project', project])
                    else:
                        from ci_run import build
                        directory = ROOT / 'reports' / project
                        directory.mkdir(parents=True, exist_ok=True)
                        build(project, directory)
                except (subprocess.CalledProcessError, RuntimeError, OSError) as error:
                    print(f'{project}: {error}', file=sys.stderr)
                    failed = True
            return int(failed)
    except (subprocess.CalledProcessError, RuntimeError, OSError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('\nServer stopped.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
