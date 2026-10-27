import json
from scripts import ci_run, sonar_report


def test_failed_test_has_individual_report_and_project_summary(tmp_path, monkeypatch):
    monkeypatch.delenv('GITHUB_STEP_SUMMARY', raising=False)
    monkeypatch.setattr(ci_run, 'ROOT', tmp_path)
    suite = tmp_path / 'reports/backend/regression'
    suite.mkdir(parents=True)
    suite.joinpath('junit.xml').write_text('<testsuites><testsuite><testcase name="request" classname="api" time="0.1"><failure>expected 201 &lt;actual 500&gt;</failure></testcase><testcase name="health" classname="api" /></testsuite></testsuites>')
    summary = ci_run.report('backend', {'regression': {'exit_code': 1}})
    assert summary['failed'] == 1
    assert summary['passed'] == 1
    assert len(list((suite.parent / 'cases').glob('*.html'))) == 2
    assert suite.parent.joinpath('index.html').exists()
    assert summary['tests'][0]['status'] == 'failure'


def test_missing_test_execution_is_not_reported_as_success(tmp_path, monkeypatch):
    monkeypatch.delenv('GITHUB_STEP_SUMMARY', raising=False)
    monkeypatch.setattr(ci_run, 'ROOT', tmp_path)
    summary = ci_run.report('frontend', {'pipeline': {'exit_code': 1}})
    assert summary['tests'] == []
    assert summary['stages']['pipeline']['exit_code'] == 1
    page = (tmp_path / 'reports/frontend/index.html').read_text(encoding='utf-8')
    assert page.count('role="tab" ') == 10
    assert 'Des corrections sont nécessaires' in page
    assert 'Aucun résultat exécutable' in page


def test_unconfigured_sonar_generates_explicit_report(tmp_path, monkeypatch):
    monkeypatch.setattr(sonar_report, 'ROOT', tmp_path)
    monkeypatch.setattr('sys.argv', ['sonar_report.py', '--project', 'backend'])
    monkeypatch.delenv('SONAR_TOKEN', raising=False)
    monkeypatch.delenv('GITHUB_STEP_SUMMARY', raising=False)
    assert sonar_report.main() == 1
    report = json.loads((tmp_path / 'reports/backend/sonar.json').read_text(encoding='utf-8'))
    assert report['quality_gate'] == 'NOT_EVALUATED'
    assert 'Aucune analyse' in report['reason']
