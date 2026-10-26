"""Run independent suites, build packages and publish per-test/project reports."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def run(command, log, env=None):
    try:
        result = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, errors='replace')
        log.write_text(result.stdout, encoding='utf-8')
        print(result.stdout, flush=True)
        return result.returncode
    except OSError as error:
        log.write_text(str(error), encoding='utf-8')
        return 1


def report(project, stages):
    directory = ROOT / 'reports' / project
    directory.mkdir(parents=True, exist_ok=True)
    cases = []
    for junit in sorted(directory.glob('*/junit.xml')):
        suite = junit.parent.name
        try:
            root = ET.parse(junit).getroot()
            for index, case in enumerate(root.iter('testcase')):
                issue = next((child for child in case if child.tag in ('failure', 'error', 'skipped')), None)
                status = issue.tag if issue is not None else 'passed'
                item = {'suite': suite, 'name': case.get('name'), 'class': case.get('classname'),
                        'seconds': case.get('time', '0'), 'status': status,
                        'details': '' if issue is None else ''.join(issue.itertext())}
                identifier = hashlib.sha256(f'{suite}:{index}:{item["class"]}:{item["name"]}'.encode()).hexdigest()[:16]
                target = directory / 'cases' / identifier
                target.parent.mkdir(exist_ok=True)
                target.with_suffix('.json').write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding='utf-8')
                target.with_suffix('.html').write_text('<!doctype html><meta charset="utf-8"><title>Test</title><pre>' + html.escape(json.dumps(item, ensure_ascii=False, indent=2)) + '</pre>', encoding='utf-8')
                item['report'] = f'cases/{identifier}.html'
                cases.append(item)
        except ET.ParseError as error:
            stages[f'{suite}-report'] = {'exit_code': 1, 'error': str(error)}
    sonar_file = directory / 'sonar.json'
    sonar = json.loads(sonar_file.read_text(encoding='utf-8')) if sonar_file.exists() else {'quality_gate': 'NOT_EVALUATED'}
    summary = {'project': project, 'workflow_status': os.environ.get('CI_JOB_STATUS', 'local'), 'sonar': sonar, 'stages': stages, 'tests': cases,
               'passed': sum(c['status'] == 'passed' for c in cases),
               'failed': sum(c['status'] in ('failure', 'error') for c in cases)}
    directory.joinpath('summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    rows = ''.join(f'<tr><td>{html.escape(c["suite"])}</td><td><a href="{c["report"]}">{html.escape(c["name"] or "test")}</a></td><td>{c["status"]}</td></tr>' for c in cases)
    stages_html = html.escape(json.dumps({'workflow_status': summary['workflow_status'], 'stages': stages, 'sonar': sonar}, ensure_ascii=False, indent=2))
    directory.joinpath('index.html').write_text(f'<!doctype html><meta charset="utf-8"><title>CI {project}</title><h1>CI {project}</h1><p>{summary["passed"]} réussis, {summary["failed"]} en échec</p><pre>{stages_html}</pre><table><tr><th>Suite</th><th>Test</th><th>Statut</th></tr>{rows}</table><p><a href="sonar.html">Rapport SonarQube</a></p>', encoding='utf-8')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as stream:
            stream.write(f'### {project}\n\nTests réussis : {summary["passed"]}, échecs : {summary["failed"]}.\n\n')
            for name, result in stages.items():
                stream.write(f'- {name} : code {result["exit_code"]}\n')
            stream.write(f'\nTélécharger l’artefact {project}-reports pour les rapports HTML, JSON, JUnit et la couverture.\n')
    return summary


def build(project, directory):
    sources = ROOT / project / ('app' if project == 'backend' else 'public')
    if project == 'frontend':
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not npm:
            raise RuntimeError('npm is required. Install Node.js 24 LTS.')
        result = subprocess.run([npm, 'run', 'build', '--prefix', 'frontend'], cwd=ROOT, capture_output=True, text=True)
        directory.joinpath('build.log').write_text(result.stdout + result.stderr, encoding='utf-8')
        if result.returncode:
            raise RuntimeError('Vite build failed; see build.log: ' + result.stderr)
        sources = ROOT / 'frontend/dist'
        from validate_frontend import validate
        validation = validate(sources)
        directory.joinpath('build-validation.json').write_text(json.dumps(validation, indent=2), encoding='utf-8')
    else:
        # Compile in memory: no application startup, production DB or generated bytecode.
        for script in sources.rglob('*.py'):
            compile(script.read_text(encoding='utf-8'), str(script), 'exec')
    destination = ROOT / 'dist' / f'{project}.zip'
    destination.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(sources.rglob('*')):
            if file.is_file() and '__pycache__' not in file.parts:
                archive.write(file, file.relative_to(sources) if project == 'frontend' else file.relative_to(ROOT))
        if project == 'backend':
            archive.write(ROOT / 'backend/requirements.txt', 'backend/requirements.txt')
    directory.joinpath('build.json').write_text(json.dumps({'status': 'passed', 'artifact': str(destination.relative_to(ROOT)), 'bytes': destination.stat().st_size}), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', choices=['backend', 'frontend'], required=True)
    parser.add_argument('--suite', choices=['all', 'unit', 'regression'], default='all')
    parser.add_argument('--report-only', action='store_true', help='Rebuild HTML/JSON summaries after an interrupted job')
    args = parser.parse_args()
    directory = ROOT / 'reports' / args.project
    directory.mkdir(parents=True, exist_ok=True)
    stages = {}
    if args.report_only:
        previous = directory / 'summary.json'
        stages = json.loads(previous.read_text(encoding='utf-8'))['stages'] if previous.exists() else {'pipeline': {'exit_code': 1, 'error': 'Tests not completed; inspect workflow logs'}}
        report(args.project, stages)
        return 0
    if args.project == 'backend':
        env = {**os.environ, 'PYTHONPATH': str(ROOT), 'COVERAGE_FILE': str(directory / '.coverage')}
        run([sys.executable, '-m', 'coverage', 'erase'], directory / 'coverage-erase.log', env)
    for suite in (['unit', 'regression'] if args.suite == 'all' else [args.suite]):
        output = directory / suite
        output.mkdir(exist_ok=True)
        if args.project == 'backend':
            targets = ['backend/tests/unit'] if suite == 'unit' else ['tests/test_api.py', 'tests/test_leave_requests.py']
            command = [sys.executable, '-m', 'pytest', *targets, '-q', '--cov=backend/app', '--cov-append', '--cov-report=', f'--junitxml={output / "junit.xml"}', f'--html={output / "tests.html"}', '--self-contained-html']
        else:
            targets = sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'frontend/tests' / suite).glob('*.test.cjs'))
            if suite == 'regression':
                targets.append('tests/leave_form.test.cjs')
            command = ['node', '--test', '--experimental-test-coverage', '--test-coverage-include=**/frontend/public/**', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', f'--test-reporter-destination={output / "junit.xml"}', '--test-reporter=lcov', f'--test-reporter-destination={output / "lcov.info"}', *targets]
        env = {**os.environ, 'PYTHONPATH': str(ROOT), 'COVERAGE_FILE': str(directory / '.coverage')}
        stages[suite] = {'exit_code': run(command, output / 'output.log', env)}
    if args.project == 'backend':
        for kind, target in [('xml', directory / 'coverage.xml'), ('html', directory / 'coverage-html')]:
            command = [sys.executable, '-m', 'coverage', kind, '-o' if kind == 'xml' else '-d', str(target)]
            stages[f'coverage-{kind}'] = {'exit_code': run(command, directory / f'coverage-{kind}.log', env)}
    try:
        build(args.project, directory)
        stages['build'] = {'exit_code': 0}
    except (OSError, RuntimeError, SyntaxError, ValueError) as error:
        stages['build'] = {'exit_code': 1, 'error': str(error)}
        directory.joinpath('build.json').write_text(json.dumps(stages['build']), encoding='utf-8')
    if args.project == 'frontend' and not stages['build']['exit_code']:
        output = directory / 'e2e'
        output.mkdir(exist_ok=True)
        stages['e2e'] = {'exit_code': run(['node', 'frontend/node_modules/@playwright/test/cli.js', 'test', '--config=frontend/playwright.config.js'], output / 'output.log')}
    report(args.project, stages)
    return int(any(value['exit_code'] for value in stages.values()))


if __name__ == '__main__':
    raise SystemExit(main())
