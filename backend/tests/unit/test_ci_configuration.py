import fnmatch
from pathlib import Path
import yaml
import pytest

ROOT = Path(__file__).resolve().parents[3]


def workflow(project):
    return yaml.load((ROOT / '.github/workflows' / f'{project}-ci.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)


def triggers(project, path):
    patterns = workflow(project)['on']['push']['paths']
    return any(fnmatch.fnmatchcase(path, pattern) or fnmatch.fnmatchcase(path, pattern.replace('**/', '')) for pattern in patterns)


@pytest.mark.parametrize('path,backend,frontend', [
    ('frontend/public/app.js', False, True),
    ('frontend/package-lock.json', False, True),
    ('backend/app/main.py', True, False),
    ('tests/test_api.py', True, False),
    ('tests/leave_form.test.cjs', False, True),
    ('scripts/backend_dashboard.py', True, True),
    ('scripts/report_templates/backend.css', True, True),
    ('scripts/validate_frontend.py', False, True),
    ('.coveragerc', True, False),
    ('scripts/ci_run.py', True, True),
])
def test_project_triggers_are_independent(path, backend, frontend):
    assert triggers('backend', path) is backend
    assert triggers('frontend', path) is frontend


@pytest.mark.parametrize('project', ['backend', 'frontend'])
def test_sonar_configuration_is_required(project):
    config = workflow(project)
    assert config['on']['push']['paths'] == config['on']['pull_request']['paths']
    steps = config['jobs']['test-build-analyze']['steps']
    check = next(step for step in steps if step.get('id') == 'sonar-config')
    assert f'prepare_sonar.py --project {project}' in check['run']
    assert 'SONAR_REQUIRED' not in check.get('env', {})
    scan = next(step for step in steps if step.get('id') == 'sonar')
    assert 'sonar.qualitygate.wait=true' in scan['with']['args']
