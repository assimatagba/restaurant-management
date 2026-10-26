"""Export a SonarQube quality gate/metrics report, including skipped/failed analysis."""
import argparse
import html
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', choices=['backend', 'frontend'], required=True)
    args = parser.parse_args()
    directory = ROOT / 'reports' / args.project
    directory.mkdir(parents=True, exist_ok=True)
    status = os.environ.get('SONAR_OUTCOME', 'not-run')
    report = {'project': args.project, 'scanner': status, 'quality_gate': 'NOT_EVALUATED'}
    token = os.environ.get('SONAR_TOKEN', '')
    host = os.environ.get('SONAR_HOST_URL', '').rstrip('/')
    key = os.environ.get('SONAR_PROJECT_KEY', '')

    def api(endpoint, **query):
        request = urllib.request.Request(host + '/api/' + endpoint + '?' + urllib.parse.urlencode(query),
                                         headers={'Authorization': 'Bearer ' + token})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    failed = False
    if not (host and key and token):
        report['reason'] = 'SonarQube non configuré ou secrets indisponibles (pull request externe). Aucune analyse effectuée.'
    else:
        report['dashboard'] = host + '/dashboard?id=' + urllib.parse.quote(key, safe='')
        metadata_file = ROOT / '.scannerwork/report-task.txt'
        if not metadata_file.exists():
            report['reason'] = 'Le scanner n’a produit aucun identifiant de tâche. Consulter les logs du workflow.'
            failed = status not in ('skipped', 'not-run')
        else:
            metadata = dict(line.split('=', 1) for line in metadata_file.read_text(encoding='utf-8').splitlines() if '=' in line)
            try:
                task = api('ce/task', id=metadata['ceTaskId'])['task']
                report['task_status'] = task['status']
                if task.get('analysisId'):
                    gate = api('qualitygates/project_status', analysisId=task['analysisId'])['projectStatus']
                    report['quality_gate'] = gate['status']
                    report['conditions'] = gate.get('conditions', [])
                    if os.environ.get('CI_PULL_REQUEST'):
                        branch = {'pullRequest': os.environ['CI_PULL_REQUEST']}
                    elif os.environ.get('GITHUB_REF_NAME'):
                        branch = {'branch': os.environ['GITHUB_REF_NAME']}
                    else:
                        branch = {}
                    report['measures'] = api('measures/component', component=key, metricKeys='bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc', **branch)['component']['measures']
                    failed = gate['status'] != 'OK'
                else:
                    report['reason'] = 'Analyse non terminée ou en échec ; Quality Gate non disponible.'
                    failed = True
            except (urllib.error.URLError, KeyError, ValueError) as error:
                # No token, request headers or response contents are included in the report.
                report['reason'] = f'Rapport SonarQube indisponible ({type(error).__name__}). Voir le dashboard.'
                failed = True
    directory.joinpath('sonar.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    directory.joinpath('sonar.html').write_text('<!doctype html><meta charset="utf-8"><title>SonarQube</title><h1>SonarQube</h1><pre>' + html.escape(json.dumps(report, ensure_ascii=False, indent=2)) + '</pre>', encoding='utf-8')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as stream:
            stream.write(f'\n### SonarQube {args.project}\n\nScanner : {status}. Quality Gate : {report["quality_gate"]}.\n\n')
            stream.write(report.get('reason', 'Résultats détaillés dans sonar.html et sonar.json.') + '\n')
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
