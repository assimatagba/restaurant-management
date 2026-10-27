import io
import json
import pytest
from scripts import sonar_report


@pytest.mark.parametrize('temporary', [False, True])
def test_real_api_responses_are_exported_with_gate_conditions(tmp_path, monkeypatch, temporary):
    monkeypatch.setattr(sonar_report, 'ROOT', tmp_path)
    monkeypatch.setattr('sys.argv', ['sonar_report.py', '--project', 'backend'])
    for name, value in {'SONAR_HOST_URL': 'https://sonar.example', 'SONAR_PROJECT_KEY': 'backend', 'SONAR_TOKEN': 'test-secret-do-not-log', 'SONAR_OUTCOME': 'success', 'GITHUB_REF_NAME': 'main'}.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv('GITHUB_STEP_SUMMARY', raising=False)
    monkeypatch.setenv('SONAR_TEMPORARY', str(temporary).lower())
    metadata = tmp_path / '.scannerwork'
    metadata.mkdir()
    (metadata / 'report-task.txt').write_text('ceTaskId=task-1\n')
    def response(request, timeout):
        assert request.headers['Authorization'] == 'Bearer test-secret-do-not-log'
        if '/ce/task?' in request.full_url:
            payload = {'task': {'status': 'SUCCESS', 'analysisId': 'analysis-1'}}
        elif '/qualitygates/' in request.full_url:
            payload = {'projectStatus': {'status': 'OK', 'conditions': [{'metricKey': 'new_coverage', 'actualValue': '85', 'status': 'OK'}]}}
        else:
            assert ('branch=main' in request.full_url) is (not temporary)
            payload = {'component': {'measures': [{'metric': 'coverage', 'value': '85'}]}}
        return io.BytesIO(json.dumps(payload).encode())
    monkeypatch.setattr(sonar_report.urllib.request, 'urlopen', response)
    assert sonar_report.main() == 0
    content = (tmp_path / 'reports/backend/sonar.json').read_text(encoding='utf-8')
    assert 'test-secret-do-not-log' not in content
    report = json.loads(content)
    assert report['quality_gate'] == 'OK'
    assert report['measures'][0]['value'] == '85'
    assert report['conditions'][0]['metricKey'] == 'new_coverage'


def test_missing_scanner_metadata_fails_even_when_outcome_is_unknown(tmp_path, monkeypatch):
    monkeypatch.setattr(sonar_report, 'ROOT', tmp_path)
    monkeypatch.setattr('sys.argv', ['sonar_report.py', '--project', 'backend'])
    for key, value in {'SONAR_HOST_URL': 'https://sonar.example', 'SONAR_PROJECT_KEY': 'backend', 'SONAR_TOKEN': 'test-token'}.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv('SONAR_OUTCOME', raising=False)
    monkeypatch.delenv('GITHUB_STEP_SUMMARY', raising=False)
    assert sonar_report.main() == 1
