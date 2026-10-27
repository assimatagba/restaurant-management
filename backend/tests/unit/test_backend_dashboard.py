import json
from scripts.backend_dashboard import write_dashboard


def summary(tests=None, sonar=None, stages=None):
    return {'project': 'backend', 'workflow_status': 'local', 'stages': stages or {},
            'tests': tests or [], 'sonar': sonar or {}}


def test_missing_measurements_do_not_create_green_quality_scores(tmp_path):
    write_dashboard(tmp_path, summary())
    data = json.loads((tmp_path / 'dashboard-data.json').read_text(encoding='utf-8'))
    assert data['test_success_percent'] is None
    assert data['coverage']['available'] is False
    assert data['sonar_status'] == 'Non évalué'
    page = (tmp_path / 'index.html').read_text(encoding='utf-8')
    assert 'Non mesurée' in page
    assert page.count('role="tab" ') == 9
    assert 'https://cdn.' not in page
    assert any('Activer' in action[1] for action in data['actions'])


def test_failed_test_is_explained_and_escaped(tmp_path):
    (tmp_path / 'cases').mkdir()
    case = {'suite': 'regression', 'name': 'test_healthcheck', 'class': 'api', 'seconds': '0.1',
            'status': 'failure', 'details': '</pre><script>alert(1)</script>', 'report': 'cases/test.html'}
    write_dashboard(tmp_path, summary([case], stages={'regression': {'exit_code': 1}}))
    page = (tmp_path / 'index.html').read_text(encoding='utf-8')
    assert 'L’application répond' in page
    assert 'Piste de correction' in page
    assert '</pre><script>alert(1)</script>' not in page
    assert '&lt;script&gt;alert(1)&lt;/script&gt;' in page
    assert (tmp_path / 'cases/test.html').exists()
    assert json.loads((tmp_path / 'dashboard-data.json').read_text(encoding='utf-8'))['test_success_percent'] == 0


def test_skipped_tests_are_excluded_from_success_denominator(tmp_path):
    (tmp_path / 'cases').mkdir()
    cases = [{'suite': 'unit', 'name': f'test_{index}', 'class': 'rules', 'seconds': '1',
              'status': status, 'details': '', 'report': f'cases/{index}.html'}
             for index, status in enumerate(('passed', 'failure', 'skipped'))]
    write_dashboard(tmp_path, summary(cases))
    data = json.loads((tmp_path / 'dashboard-data.json').read_text(encoding='utf-8'))
    assert data['test_success_percent'] == 50
    assert data['executed'] == 2
    assert data['skipped'] == 1


def test_coverage_and_sonar_metrics_keep_their_real_values(tmp_path):
    (tmp_path / 'coverage.xml').write_text('<coverage lines-valid="10" lines-covered="7" branches-valid="0"><packages><package><classes><class filename="main.py"><lines><line number="1" hits="1"/><line number="2" hits="0"/></lines></class></classes></package></packages></coverage>')
    sonar = {'quality_gate': 'ERROR', 'measures': [{'metric': 'bugs', 'value': '3'}],
             'conditions': [{'metricKey': 'new_coverage', 'actualValue': '65', 'comparator': 'LT', 'errorThreshold': '80', 'status': 'ERROR'}]}
    write_dashboard(tmp_path, summary(sonar=sonar))
    data = json.loads((tmp_path / 'dashboard-data.json').read_text(encoding='utf-8'))
    assert data['coverage']['percent'] == 70
    assert data['coverage']['files'][0]['missing'] == ['2']
    assert data['sonar_status'] == 'Refusé'
    assert 'new_coverage' in (tmp_path / 'index.html').read_text(encoding='utf-8')


def test_malformed_coverage_is_reported_without_crashing(tmp_path):
    (tmp_path / 'coverage.xml').write_text('<broken>')
    write_dashboard(tmp_path, summary())
    data = json.loads((tmp_path / 'dashboard-data.json').read_text(encoding='utf-8'))
    assert data['coverage']['available'] is False
    assert 'illisible' in data['coverage']['reason']


def test_warnings_are_visible_even_when_tests_have_not_failed(tmp_path):
    log = tmp_path / 'regression'
    log.mkdir()
    (log / 'output.log').write_text('ResourceWarning: unclosed database\n1 passed, 2 warnings in 1s')
    write_dashboard(tmp_path, summary())
    data = json.loads((tmp_path / 'dashboard-data.json').read_text(encoding='utf-8'))
    assert data['warnings']['reported_count'] == 2
    assert data['warnings']['categories'][0][0] == 'Connexions à la base laissées ouvertes'


def test_frontend_report_merges_coverage_and_includes_browser_tests(tmp_path):
    for suite, data in [('unit', 'DA:1,1\nDA:2,0'), ('regression', 'DA:1,0\nDA:2,1\nDA:3,0')]:
        (tmp_path / suite).mkdir()
        (tmp_path / suite / 'lcov.info').write_text(f'SF:frontend/public/app.js\n{data}\nend_of_record\n')
    report = summary()
    report['project'] = 'frontend'
    write_dashboard(tmp_path, report)
    data = json.loads((tmp_path / 'dashboard-data.json').read_text(encoding='utf-8'))
    assert data['coverage']['total'] == 3
    assert data['coverage']['covered'] == 2
    assert data['coverage']['percent'] == 66.7
    page = (tmp_path / 'index.html').read_text(encoding='utf-8')
    assert page.count('role="tab" ') == 10
    assert 'Comprendre l’état du frontend' in page
    assert 'Parcours navigateur' in page
    assert 'SONAR_FRONTEND_PROJECT_KEY' in page
    assert 'pytest-cov' not in page
    assert 'Vite compile' in page
    assert 'API simulée' in page


def test_frontend_malformed_lcov_remains_unmeasured(tmp_path):
    (tmp_path / 'unit').mkdir()
    (tmp_path / 'unit/lcov.info').write_text('SF:frontend/public/app.js\nDA:1,invalid\n')
    report = summary()
    report['project'] = 'frontend'
    write_dashboard(tmp_path, report)
    data = json.loads((tmp_path / 'dashboard-data.json').read_text(encoding='utf-8'))
    assert data['coverage']['available'] is False
    assert 'illisible' in data['coverage']['reason']
