"""Build offline-friendly, plain-language quality dashboards for both projects."""
from datetime import datetime, timezone
import html
import json
import os
from pathlib import Path
import re
import xml.etree.ElementTree as ET

TEMPLATES = Path(__file__).resolve().parent / 'report_templates'
STATUS = {'passed': 'Réussi', 'failure': 'Échec', 'error': 'Erreur technique', 'skipped': 'Non exécuté'}
LABELS = {'unit': 'Tests unitaires', 'regression': 'Tests de régression', 'build': 'Préparation du livrable', 'coverage-xml': 'Mesure de la couverture', 'coverage-html': 'Rapport de couverture', 'pipeline': 'Exécution du pipeline'}
LABELS['e2e'] = 'Parcours navigateur'
TESTS = {
    'healthcheck': ('L’application répond', 'Vérifie que le service est joignable et annonce son bon fonctionnement.'),
    'menu_is_available': ('La carte est consultable', 'Vérifie que les clients peuvent obtenir la liste des plats disponibles.'),
    'order_creation_requires_auth': ('Les commandes exigent une connexion', 'Vérifie qu’une personne non connectée ne peut pas créer une commande.'),
    'public_server_call_option_is_removed': ('L’ancienne action publique est désactivée', 'Vérifie qu’un ancien point d’entrée ne permet plus un appel non prévu.'),
    'server_can_only_mark_ready_orders_as_served': ('Les droits du serveur sont respectés', 'Vérifie que le serveur peut servir une commande prête sans modifier les étapes réservées à la cuisine.'),
    'server_can_release_table_only_after_order_is_paid': ('Une table reste occupée tant que l’addition n’est pas réglée', 'Contrôle le lien entre paiement et libération de la table.'),
    'manager_can_create_tables_with_automatic_numbers': ('Les nouvelles tables reçoivent un numéro unique', 'Vérifie que les tables sont créées avec des numéros successifs.'),
    'manager_can_merge_multiple_tables_into_selected_target': ('Le regroupement des tables conserve la table choisie', 'Vérifie qu’un regroupement respecte la destination sélectionnée.'),
    'merge_sums_capacity_hides_source_and_keeps_highest_table_server': ('Le regroupement conserve les places et l’affectation', 'Contrôle la capacité totale, l’affichage et le serveur affecté.'),
    'unmerge_restores_source_table_and_previous_assignments': ('La séparation des tables restaure leur organisation', 'Vérifie le rétablissement des places et des affectations précédentes.'),
    'leave_request_lifecycle_and_validation': ('Une demande de congé peut être envoyée, traitée et suivie', 'Contrôle les dates, les doublons, les droits du manager et le statut visible par l’employé.'),
    'unchanged_snapshot_returns_only_the_version': ('La synchronisation évite les transferts inutiles', 'Vérifie qu’un état inchangé produit une réponse courte.'),
    'frontend_routes_and_entry_assets_are_served': ('Les pages et leurs ressources sont accessibles', 'Vérifie que le serveur expose les entrées du site et leurs fichiers JavaScript.'),
    'password_hash_is_salted_and_repeatable': ('Les mots de passe sont protégés par un hachage salé', 'Contrôle la stabilité de la vérification et l’utilisation de sels distincts.'),
    'order_quantities_reject_invalid_values': ('Les quantités de commande invalides sont refusées', 'Contrôle les valeurs nulles, négatives et supérieures à la limite autorisée.'),
    'leave_dates_are_real_calendar_dates': ('Les dates impossibles sont refusées', 'Vérifie qu’une date inexistante ne peut pas être acceptée.'),
    'profile_rejects_empty_names': ('Le profil exige un prénom renseigné', 'Vérifie le refus d’un champ de nom vide.'),
    'failed_test_has_individual_report_and_project_summary': ('Les erreurs restent visibles dans les rapports', 'Vérifie qu’un échec génère sa fiche individuelle et figure dans la synthèse du projet.'),
    'missing_test_execution_is_not_reported_as_success': ('Un test absent n’est pas annoncé comme réussi', 'Vérifie que le rapport ne transforme pas une absence de résultats en réussite.'),
    'unconfigured_sonar_generates_explicit_report': ('Une analyse SonarQube manquante est clairement signalée', 'Vérifie qu’un rapport absent reste identifié comme non évalué.'),
}
TESTS.update({
    'existing names split into given names and surname': ('Le nom existant est réparti dans les bons champs', 'Contrôle la séparation du nom et des prénoms lors de l’ouverture du profil.'),
    'explicit name fields take precedence': ('Les champs du profil sont respectés', 'Les valeurs déjà renseignées restent prioritaires sur le nom complet.'),
    'profile attributes escape HTML special characters': ('Les caractères spéciaux du profil sont protégés', 'Vérifie que les valeurs ne peuvent pas introduire du HTML dans le formulaire.'),
    'complete name updates immediately from both editable fields': ('Le nom complet se met à jour immédiatement', 'Contrôle la synchronisation pendant la saisie du nom et des prénoms.'),
    'startup without session shows the login form': ('Une personne déconnectée voit le formulaire de connexion', 'Vérifie le démarrage du portail sans session active.'),
    'profile synchronization supports an empty surname during typing': ('Le profil reste utilisable pendant la saisie', 'Vérifie la synchronisation lorsque le nom est temporairement vide.'),
    'an expired API session triggers reconnection': ('Une session expirée propose une reconnexion', 'Contrôle la réaction du portail quand l’API refuse une session expirée.'),
    'reconnection preserves the leave request draft and removes the stale token': ('La reconnexion préserve la demande de congé', 'Le brouillon reste disponible et l’ancien jeton est retiré.'),
    'polling does not replace a focused leave form': ('La saisie des congés reste stable', 'Le rafraîchissement automatique ne remplace pas le formulaire en cours de saisie.'),
    'submission validates dates and prevents duplicate clicks': ('L’envoi contrôle les dates et les doubles clics', 'Vérifie les validations et la protection contre un envoi répété.'),
    'production chunks support login, profile and leave submission': ('Connexion, profil et congés fonctionnent dans Chromium', 'Exécute le parcours dans le site compilé avec une API simulée.'),
    'portal and public menu use distinct dynamic entry points': ('Le portail et la carte chargent leurs propres modules', 'Vérifie les points d’entrée dynamiques dans le navigateur.'),
    'menu visuals are local vectors and identical data does not replace cards': ('Les visuels sont locaux et le rafraîchissement reste stable', 'Contrôle les ressources graphiques et la conservation des cartes lorsque les données ne changent pas.'),
})


def esc(value):
    return html.escape(str(value if value is not None else ''))


def number(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def javascript_coverage(directory):
    """Merge suite LCOV line hits without counting shared source lines twice."""
    files = {}
    sources = sorted(directory.glob('*/lcov.info'))
    if not sources:
        return {'available': False, 'reason': 'Aucun rapport LCOV JavaScript disponible.'}
    try:
        for source in sources:
            current = None
            for line in source.read_text(encoding='utf-8').splitlines():
                if line.startswith('SF:'):
                    current = line[3:].replace('\\', '/')
                    current = current[current.index('frontend/'):] if 'frontend/' in current else current
                    files.setdefault(current, {})
                elif line.startswith('DA:') and current is not None:
                    index, hits, *_ = line[3:].split(',')
                    files[current][index] = files[current].get(index, 0) + int(hits)
                elif line == 'end_of_record':
                    current = None
        total = sum(len(lines) for lines in files.values())
        covered = sum(hits > 0 for lines in files.values() for hits in lines.values())
        if not total:
            return {'available': False, 'reason': 'Les rapports LCOV ne contiennent aucune ligne mesurée.'}
        details = [{'name': name, 'lines': len(lines), 'missing': [index for index, hits in lines.items() if not hits],
                    'percent': round(100 * sum(hits > 0 for hits in lines.values()) / len(lines), 1)}
                   for name, lines in files.items() if lines]
        return {'available': True, 'percent': round(100 * covered / total, 1), 'covered': covered,
                'total': total, 'missing': total - covered, 'files': sorted(details, key=lambda file: file['percent']),
                'branch_total': 0, 'scope': 'Couverture des lignes JavaScript par les tests Node ; les tests navigateur et le CSS ne sont pas mesurés.'}
    except (OSError, ValueError) as error:
        return {'available': False, 'reason': f'Rapport LCOV illisible ({type(error).__name__}).'}


def coverage_data(directory):
    source = directory / 'coverage.xml'
    if not source.exists():
        return {'available': False, 'reason': 'Aucun rapport de couverture disponible.'}
    try:
        root = ET.parse(source).getroot()
        total = int(root.get('lines-valid', 0))
        covered = int(root.get('lines-covered', 0))
        if total <= 0 or not 0 <= covered <= total:
            return {'available': False, 'reason': 'Le rapport ne contient pas de mesure de lignes exploitable.'}
        files = []
        for item in root.findall('.//class'):
            lines = item.findall('./lines/line')
            if not lines:
                continue
            missing = [line.get('number') for line in lines if number(line.get('hits')) == 0]
            files.append({'name': item.get('filename', 'Fichier'), 'lines': len(lines), 'missing': missing,
                          'percent': round(100 * (len(lines) - len(missing)) / len(lines), 1)})
        return {'available': True, 'percent': round(100 * covered / total, 1), 'covered': covered,
                'total': total, 'missing': total - covered, 'files': sorted(files, key=lambda file: file['percent']),
                'branch_total': int(root.get('branches-valid', 0))}
    except (ET.ParseError, ValueError) as error:
        return {'available': False, 'reason': f'Le rapport de couverture est illisible ({type(error).__name__}).'}


def describe(case):
    technical = case.get('name') or 'Test sans nom'
    key = re.sub(r'\[.*$', '', technical).removeprefix('test_')
    title, description = TESTS.get(key, ('Contrôle automatique : ' + key.replace('_', ' '), 'Ce contrôle vérifie le comportement indiqué par son nom technique. Consulter le détail pour son périmètre exact.'))
    parameter = re.search(r'\[(.*)\]$', technical)
    if parameter:
        title += f' — valeur {parameter.group(1)}'
    return title, description


def warning_data(directory):
    total = 0
    logs = []
    for suite in ('unit', 'regression', 'e2e'):
        path = directory / suite / 'output.log'
        if path.exists():
            content = path.read_text(encoding='utf-8', errors='replace')
            matches = re.findall(r'\b(\d+) warnings?\b', content)
            total += int(matches[-1]) if matches else len(re.findall(r'\b(?:ExperimentalWarning|DeprecationWarning|ResourceWarning):', content))
            logs.append(content)
    text = '\n'.join(logs)
    categories = []
    if 'ResourceWarning' in text and 'unclosed database' in text:
        categories.append(('Connexions à la base laissées ouvertes', 'Les journaux signalent des connexions SQLite non fermées explicitement. Les tests peuvent réussir malgré cet avertissement.', 'Vérifier la fermeture des connexions et la gestion de leur durée de vie, puis relancer les tests avec les avertissements actifs.', 'ResourceWarning: unclosed database'))
    if 'DeprecationWarning' in text:
        categories.append(('Compatibilité à préparer', 'Une bibliothèque indique qu’une manière de l’utiliser sera abandonnée dans une version future.', 'Consulter le message de dépréciation, vérifier les versions compatibles et prévoir l’adaptation du code ou des dépendances.', 'DeprecationWarning'))
    if total and not categories:
        categories.append(('Messages à examiner', 'Les tests ont produit des avertissements dont la nature doit être vérifiée dans les journaux.', 'Ouvrir le journal de la suite concernée avant de conclure sur leur impact.', 'Warnings pytest'))
    return {'reported_count': total, 'categories': categories}


def badge(status):
    category = 'good' if status == 'passed' else 'muted' if status == 'skipped' else 'bad'
    return f'<span class="badge {category}">{esc(STATUS.get(status, status))}</span>'


def test_card(case, include_link=True):
    title, description = describe(case)
    failed = case['status'] in ('failure', 'error')
    action = '<p class="advice"><strong>Piste de correction :</strong> reproduire ce test seul, comparer le résultat attendu au résultat obtenu, puis vérifier le code et les données de test concernés. Cette piste n’est pas un diagnostic confirmé.</p>' if failed else ''
    link = f'<a href="{esc(case["report"])}">Ouvrir la fiche individuelle</a>' if include_link and case.get('report') else ''
    return f'<article class="test-card" data-result="{esc(case["status"])}"><div class="row"><h3>{esc(title)}</h3>{badge(case["status"])}</div><p>{esc(description)}</p>{action}<details><summary>Détails techniques · {number(case.get("seconds")):.3f} s</summary><dl><dt>Identifiant</dt><dd><code>{esc(case.get("name"))}</code></dd><dt>Module</dt><dd><code>{esc(case.get("class"))}</code></dd><dt>Suite</dt><dd>{esc(LABELS.get(case["suite"], case["suite"]))}</dd></dl><pre>{esc(case.get("details") or "Aucune erreur signalée par ce test.")}</pre>{link}</details></article>'


def suite_panel(cases, suite, project='backend'):
    selected = [case for case in cases if case['suite'] == suite]
    passed = sum(case['status'] == 'passed' for case in selected)
    failed = sum(case['status'] in ('failure', 'error') for case in selected)
    skipped = len(selected) - passed - failed
    purpose = f'Des contrôles ciblés sur les validations, les règles et les fonctions du {project}.' if suite == 'unit' else 'Des scénarios qui vérifient que les parcours existants continuent de fonctionner après une modification.'
    if suite == 'e2e':
        purpose = 'Des parcours exécutés dans Chromium sur le frontend compilé, avec une API simulée. Ils ne testent pas un serveur backend réel.'
    cards = ''.join(test_card(case) for case in selected)
    return f'<h2>{esc(LABELS[suite])}</h2><p>{purpose}</p><p class="suite-count">{passed} réussis · {failed} en échec · {skipped} non exécutés</p><label class="search">Rechercher un contrôle<input type="search" placeholder="Ex. congé, paiement, table…" data-search="{suite}"></label><div class="test-list" data-suite="{suite}">{cards or "<p class=notice>Aucun cas de test disponible. Cela ne signifie pas que les tests ont réussi.</p>"}</div><p class="empty-search" hidden>Aucun contrôle ne correspond à votre recherche.</p>'


def write_dashboard(directory, summary):
    project = summary.get('project', 'backend')
    suites = ('unit', 'regression', 'e2e') if project == 'frontend' else ('unit', 'regression')
    cases = summary['tests']
    passed = sum(case['status'] == 'passed' for case in cases)
    failed = sum(case['status'] in ('failure', 'error') for case in cases)
    skipped = len(cases) - passed - failed
    executed = passed + failed
    rate = round(100 * passed / executed, 1) if executed else None
    coverage = javascript_coverage(directory) if project == 'frontend' else coverage_data(directory)
    warnings = warning_data(directory)
    sonar = summary.get('sonar', {})
    gate = sonar.get('quality_gate', 'NOT_EVALUATED')
    sonar_status = 'Validé' if gate == 'OK' else 'Refusé' if gate == 'ERROR' else 'Non évalué'
    stages = summary['stages']
    build = stages.get('build', {})
    blocked = failed > 0 or any(stage.get('exit_code') for stage in stages.values()) or gate == 'ERROR' or sonar.get('scanner') in ('failure', 'cancelled') or summary.get('workflow_status') == 'failure'
    complete = bool(executed) and not blocked and gate == 'OK' and coverage['available'] and build.get('exit_code') == 0
    overall = 'Des corrections sont nécessaires' if blocked else 'Contrôles disponibles réussis, bilan incomplet' if not complete else 'Les vérifications disponibles sont validées'
    explanation = 'Certains contrôles ont échoué. Consulter les actions prioritaires avant de valider la livraison.' if blocked else 'Les tests exécutés ne signalent pas de régression. Les contrôles non mesurés restent à réaliser ; ce bilan ne garantit pas l’absence de défaut.'
    actions = []
    if failed:
        actions.append(('Priorité haute', f'Corriger les {failed} contrôles en échec', 'Ouvrir les fiches rouges, reproduire les scénarios concernés et relancer la suite après correction. Les détails techniques donnent l’erreur observée.', 'regression'))
    for name, stage in stages.items():
        if stage.get('exit_code'):
            actions.append(('Priorité haute', f'Rétablir : {LABELS.get(name, name)}', 'Lire le journal de l’étape, vérifier les dépendances et reproduire la commande indiquée dans l’onglet technique.', 'technical'))
    if gate not in ('OK', 'ERROR'):
        actions.append(('À compléter', 'Activer ou rétablir l’analyse SonarQube', f'Consulter le journal de démarrage du serveur temporaire ou vérifier SONAR_HOST_URL, SONAR_{project.upper()}_PROJECT_KEY et SONAR_TOKEN pour un serveur externe. Aucun score statique n’est disponible pour cette exécution.', 'sonar'))
    elif gate == 'ERROR':
        actions.append(('Priorité haute', 'Traiter les conditions SonarQube refusées', 'Consulter les conditions et le dashboard SonarQube pour identifier les lignes concernées ; corriger puis refaire l’analyse.', 'sonar'))
    if not coverage['available']:
        coverage_advice = 'Vérifier les fichiers unit/lcov.info et regression/lcov.info produits par Node.' if project == 'frontend' else 'Vérifier pytest-cov et la production du fichier coverage.xml.'
        actions.append(('À compléter', 'Générer la couverture du code', coverage_advice + ' Une mesure absente n’est pas un score de zéro.', 'coverage'))
    elif coverage['percent'] < 80:
        actions.append(('Amélioration conseillée', 'Renforcer les tests des zones peu exercées', 'Commencer par les fichiers les moins couverts et les scénarios métier sensibles. Le repère de 80 % est indicatif et ne remplace pas le Quality Gate du serveur.', 'coverage'))
    if skipped:
        actions.append(('À vérifier', f'Examiner les {skipped} contrôles non exécutés', 'Vérifier le motif de saut avant de conclure que le périmètre est validé.', 'unit'))
    if warnings['reported_count'] or warnings['categories']:
        actions.append(('À vérifier', 'Examiner les avertissements des tests', 'Les avertissements ne sont pas des tests en échec. Ils peuvent néanmoins signaler des ressources mal libérées ou une adaptation future des dépendances.', 'warnings'))
    if not executed:
        actions.append(('Priorité haute', 'Exécuter les tests avant de conclure', 'Aucun résultat exécutable n’a été trouvé. Vérifier la collecte des tests et leurs fichiers JUnit.', 'technical'))
    if not actions:
        actions.append(('Suivi', 'Maintenir les contrôles lors des prochaines évolutions', 'Relancer les tests et l’analyse à chaque changement. Les résultats décrivent cette exécution uniquement.', 'overview'))
    action_html = ''.join(f'<article class="action"><span class="badge {"bad" if priority == "Priorité haute" else "warn"}">{esc(priority)}</span><h3>{esc(title)}</h3><p>{esc(text)}</p><button class="text-link" data-open="{target}">Voir la rubrique →</button></article>' for priority, title, text, target in actions)
    cov_percent = coverage.get('percent')
    ring = rate if rate is not None else 0
    score = f'{rate:g} %' if rate is not None else 'Non mesuré'
    coverage_score = f'{cov_percent:g} %' if cov_percent is not None else 'Non mesurée'
    stage_rows = ''.join(f'<tr><td>{esc(LABELS.get(name, name))}</td><td>{"Réussie" if not stage.get("exit_code") else "En échec"}</td><td><code>{esc(stage.get("exit_code"))}</code></td></tr>' for name, stage in stages.items())
    suite_bars = ''
    for suite in suites:
        subset = [case for case in cases if case['suite'] == suite]
        count = len(subset)
        segments = ''.join(f'<span class="segment {color}" style="width:{100 * sum(case["status"] in statuses for case in subset) / count if count else 0}%"></span>' for statuses, color in ((('passed',), 'pass'), (('failure', 'error'), 'fail'), (('skipped',), 'skip')))
        suite_bars += f'<div class="bar-row"><span>{esc(LABELS[suite])}</span><div class="stack" role="img" aria-label="{count} tests, dont {sum(case["status"] == "passed" for case in subset)} réussis">{segments}</div><b>{count}</b></div>'
    file_rows = ''.join(f'<tr><td><code>{esc(file["name"])}</code></td><td><meter min="0" max="100" value="{file["percent"]}">{file["percent"]} %</meter> {file["percent"]} %</td><td>{len(file["missing"])}/{file["lines"]}</td><td><details><summary>Lignes non exercées</summary><code>{esc(", ".join(file["missing"]) or "Aucune")}</code></details></td></tr>' for file in coverage.get('files', []))
    coverage_html = f'<p class="notice">{coverage.get("covered", "—")} lignes exercées sur {coverage.get("total", "—")} · {coverage.get("missing", "—")} lignes non exercées.</p><p>La couverture indique la part du code parcourue par les tests. Un pourcentage élevé ne prouve pas que tous les cas métier sont corrects. Les branches conditionnelles {"sont instrumentées" if coverage.get("branch_total") else "ne sont pas mesurées dans ce rapport"}.</p><div class="table-wrap"><table><tr><th>Fichier</th><th>Couverture</th><th>Lignes non exercées / total</th><th>Détail</th></tr>{file_rows}</table></div>' if coverage['available'] else f'<p class="notice warn">{esc(coverage["reason"])}</p>'
    warning_cards = ''.join(f'<article class="test-card"><h3>{esc(title)}</h3><p>{esc(description)}</p><p class="advice"><strong>Action conseillée :</strong> {esc(action)}</p><details><summary>Repère technique</summary><code>{esc(technical)}</code></details></article>' for title, description, action, technical in warnings['categories'])
    metrics = {metric.get('metric'): metric.get('value') for metric in sonar.get('measures', [])}
    metric_labels = {'bugs': ('Défauts potentiels', 'Anomalies détectées par l’analyse statique, à vérifier dans le code.'), 'vulnerabilities': ('Vulnérabilités détectées', 'Points de sécurité signalés par l’outil ; ce nombre n’est pas un audit de sécurité complet.'), 'code_smells': ('Points de maintenance', 'Code pouvant être clarifié ou simplifié.'), 'duplicated_lines_density': ('Code dupliqué (%)', 'Part de lignes répétées selon SonarQube.'), 'coverage': ('Couverture SonarQube (%)', 'Mesure importée et calculée par SonarQube, à distinguer de la couverture locale.'), 'ncloc': ('Lignes de code analysées', 'Taille du périmètre analysé, hors commentaires.')}
    sonar_metrics = ''.join(f'<article class="metric"><span>{esc(label)}</span><strong>{esc(metrics.get(key, "Non mesuré"))}</strong><p>{esc(description)}</p></article>' for key, (label, description) in metric_labels.items())
    conditions = ''.join(f'<tr><td><code>{esc(condition.get("metricKey"))}</code></td><td>{esc(condition.get("actualValue", "Non mesuré"))}</td><td>{esc(condition.get("comparator"))} {esc(condition.get("errorThreshold"))}</td><td>{esc(condition.get("status"))}</td></tr>' for condition in sonar.get('conditions', []))
    dashboard = sonar.get('dashboard', '')
    dashboard_link = f'<a href="{esc(dashboard)}" target="_blank" rel="noopener noreferrer">Ouvrir le dashboard SonarQube →</a>' if dashboard.startswith(('https://', 'http://')) else ''
    if sonar.get('temporary_instance'):
        dashboard_link = '<p class="notice">Analyse réalisée sur un serveur temporaire. Ses résultats sont conservés dans ce rapport ; le serveur est arrêté après le build.</p>'
    build_file = directory / 'build.json'
    build_data = json.loads(build_file.read_text(encoding='utf-8')) if build_file.exists() else {}
    build_size = f'{number(build_data["bytes"]) / 1024:.1f} Ko' if 'bytes' in build_data else 'Non mesurée'
    build_text = ('Le frontend a été compilé avec Vite, validé et empaqueté.' if project == 'frontend' else 'Le code Python a pu être préparé et empaqueté.') if build.get('exit_code') == 0 else 'Le livrable n’est pas validé pour cette exécution.'
    exports = [('summary.json', 'Synthèse structurée JSON'), ('unit/junit.xml', 'Résultats unitaires JUnit'), ('regression/junit.xml', 'Régressions JUnit'), ('coverage.xml', 'Couverture XML'), ('coverage-html/index.html', 'Explorer le code couvert'), ('unit/tests.html', 'Rapport pytest unitaire'), ('regression/tests.html', 'Rapport pytest de régression'), ('unit/output.log', 'Journal des tests unitaires'), ('regression/output.log', 'Journal des régressions'), ('sonar.json', 'Données SonarQube brutes'), ('build.json', 'Détails du livrable')]
    if project == 'frontend':
        exports += [('unit/lcov.info', 'Couverture unitaire LCOV'), ('regression/lcov.info', 'Couverture de régression LCOV'), ('e2e/junit.xml', 'Résultats navigateur JUnit'), ('e2e/html/index.html', 'Rapport Playwright et traces'), ('e2e/output.log', 'Journal Chromium'), ('build.log', 'Journal Vite'), ('build-validation.json', 'Validation des ressources compilées')]
    links = ''.join(f'<a class="export" href="{esc(path)}">{esc(label)} ↗</a>' for path, label in exports if (directory / path).exists())
    timestamp = datetime.now(timezone.utc).strftime('%d/%m/%Y à %H:%M UTC')
    metadata = {'Généré le': timestamp, 'Contexte': summary.get('workflow_status', 'local'), 'Branche': os.environ.get('GITHUB_REF_NAME', 'Exécution locale'), 'Commit': os.environ.get('GITHUB_SHA', 'Non renseigné'), 'Durée cumulée des tests': f'{sum(number(case.get("seconds")) for case in cases):.2f} s'}
    metadata_html = ''.join(f'<dt>{esc(key)}</dt><dd>{esc(value)}</dd>' for key, value in metadata.items())
    sections = {
        'overview': f'<div class="verdict {"bad" if blocked else "warn" if not complete else "good"}"><span>BILAN DE CETTE EXÉCUTION</span><h2>{overall}</h2><p>{explanation}</p></div><div class="metrics"><article class="metric"><span>Réussite des tests exécutés</span><div class="ring" style="--score:{ring}" role="img" aria-label="{score} de réussite"><strong>{score}</strong></div><p>{passed} réussis sur {executed} exécutés. Les {skipped} tests non exécutés sont exclus du calcul.</p></article><article class="metric"><span>Couverture locale du code</span><strong>{coverage_score}</strong><p>Part des lignes effectivement parcourues. Ce score ne représente pas une garantie de qualité.</p></article><article class="metric"><span>Quality Gate SonarQube</span><strong>{sonar_status}</strong><p>Décision réelle du serveur d’analyse. Aucun score n’est inventé lorsqu’il n’a pas analysé le code.</p></article></div><section class="card"><h2>Résultats par famille de tests</h2><p>Chaque barre montre la répartition des statuts dans sa famille. Le nombre à droite indique le total de tests de cette famille.</p>{suite_bars}<p class="legend"><span class="dot pass"></span> Réussis <span class="dot fail"></span> Échecs <span class="dot skip"></span> Non exécutés</p></section><section><h2>Que faire maintenant ?</h2><div class="actions">{action_html}</div></section>',
        'unit': suite_panel(cases, 'unit', project),
        'regression': suite_panel(cases, 'regression', project),
        'warnings': f'<h2>Avertissements à examiner</h2><p class="notice">{warnings["reported_count"]} avertissements comptabilisés dans les résumés des suites. Un même problème peut produire plusieurs messages : ce nombre ne représente pas des défauts distincts.</p>{warning_cards or "<p>Aucune catégorie d’avertissement reconnue dans les journaux disponibles. Cela ne constitue pas une vérification exhaustive.</p>"}<p>Les journaux complets restent disponibles dans l’onglet technique. Les messages émis hors du résumé pytest peuvent ne pas être inclus dans le compteur.</p>',
        'coverage': f'<h2>Couverture du code · {coverage_score}</h2>{coverage_html}<p>Repère de lecture : 80 % est un objectif indicatif, pas une règle appliquée par ce rapport. Prioriser les règles métier et les scénarios d’erreur.</p>',
        'sonar': f'<h2>Analyse SonarQube · {sonar_status}</h2><p class="notice">{esc(sonar.get("reason") or "Le Quality Gate représente les critères définis dans votre serveur SonarQube.")}</p><div class="metrics">{sonar_metrics}</div><h3>Conditions du Quality Gate</h3><p>LT : une valeur inférieure au seuil est refusée. GT : une valeur supérieure au seuil est refusée. Ces critères viennent du serveur.</p><div class="table-wrap"><table><tr><th>Critère technique</th><th>Mesuré</th><th>Condition de refus</th><th>Résultat serveur</th></tr>{conditions or "<tr><td colspan=4>Aucune condition mesurée disponible.</td></tr>"}</table></div>{dashboard_link}<details><summary>Données techniques SonarQube</summary><pre>{esc(json.dumps(sonar, ensure_ascii=False, indent=2))}</pre></details>',
        'build': f'<h2>Préparation du livrable</h2><p class="notice">{build_text}</p><p>Cette étape vérifie la syntaxe Python et archive les sources et la déclaration des dépendances. Elle ne déploie pas l’application et ne remplace pas les tests.</p><dl><dt>Paquet</dt><dd><code>{esc(build_data.get("artifact", "Non disponible"))}</code></dd><dt>Taille</dt><dd>{build_size}</dd></dl><p>Dans GitHub Actions, le paquet est un artefact séparé nommé <strong>backend-build</strong>. Il n’est pas inclus dans cette page.</p><pre>{esc(build.get("error", ""))}</pre>',
        'actions': f'<h2>Plan d’action proposé</h2><p>Les recommandations ci-dessous proviennent des résultats disponibles. Elles suggèrent des vérifications ; aucune correction n’est appliquée automatiquement.</p><div class="actions">{action_html}</div>',
        'technical': f'<h2>Détails techniques et fichiers sources</h2><dl>{metadata_html}</dl><div class="table-wrap"><table><tr><th>Étape</th><th>Résultat</th><th>Code de sortie</th></tr>{stage_rows}</table></div><h3>Reproduire localement</h3><pre>py scripts/manage.py setup --project backend --dev\npy scripts/manage.py test --project backend</pre><p>Sous Linux/macOS : remplacer <code>py</code> par <code>python3</code>. Pour cibler un cas, utiliser l’interpréteur de l’environnement : <code>python -m pytest chemin/du/test.py::nom_du_test -q</code>.</p><h3>Téléchargements et journaux</h3><div class="exports">{links}</div><h3>Lire les indicateurs</h3><p><strong>Réussite :</strong> tests réussis / tests exécutés. <strong>Couverture :</strong> lignes parcourues / lignes mesurables. <strong>Quality Gate :</strong> décision SonarQube. Ces trois notions sont distinctes ; aucun score global ne les mélange.</p><p>Les tests sont isolés sur une base temporaire. Le rapport n’atteste ni d’un déploiement réussi, ni de performances de production, ni d’un audit complet de sécurité. Les journaux peuvent contenir des détails internes : partager le rapport avec les destinataires appropriés.</p>'
    }
    tabs = [('overview', 'Vue d’ensemble'), ('unit', 'Tests unitaires'), ('regression', 'Régressions'), ('coverage', 'Couverture'), ('sonar', 'SonarQube'), ('warnings', 'Avertissements'), ('build', 'Livrable'), ('actions', 'Actions à mener'), ('technical', 'Détails techniques')]
    if project == 'frontend':
        tabs.insert(3, ('e2e', 'Parcours navigateur'))
        sections['e2e'] = suite_panel(cases, 'e2e', project)
        sections['coverage'] += f'<p class="notice">{esc(coverage.get("scope", ""))}</p>'
        sections['build'] = f'<h2>Préparation du livrable frontend</h2><p class="notice">{build_text}</p><p>Vite compile les modules et optimise les ressources ; une validation vérifie les fichiers produits. Cette étape ne déploie pas le site.</p><dl><dt>Paquet</dt><dd><code>{esc(build_data.get("artifact", "Non disponible"))}</code></dd><dt>Taille</dt><dd>{build_size}</dd></dl><p>Artefact GitHub séparé : <strong>frontend-build</strong>.</p><pre>{esc(build.get("error", ""))}</pre>'
        sections['technical'] = sections['technical'].replace('--project backend', '--project frontend').replace('Pour cibler un cas, utiliser l’interpréteur de l’environnement : <code>python -m pytest chemin/du/test.py::nom_du_test -q</code>.', 'Pour cibler un contrôle JavaScript : <code>node --test frontend/tests/unit/profile.test.cjs</code>.').replace('Les tests sont isolés sur une base temporaire.', 'Les tests frontend exécutent des simulations et des parcours Chromium sur le build Vite, avec une API simulée ; aucune base backend réelle n’est utilisée.')
    nav = ''.join(f'<button role="tab" id="tab-{key}" aria-controls="panel-{key}" aria-selected="{str(index == 0).lower()}" tabindex="{0 if index == 0 else -1}" data-tab="{key}">{label}</button>' for index, (key, label) in enumerate(tabs))
    panels = ''.join(f'<section role="tabpanel" id="panel-{key}" aria-labelledby="tab-{key}" tabindex="0" {"hidden" if index else ""}>{sections[key]}</section>' for index, (key, _) in enumerate(tabs))
    css = TEMPLATES.joinpath('backend.css').read_text(encoding='utf-8')
    js = TEMPLATES.joinpath('backend.js').read_text(encoding='utf-8')
    page = f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bilan qualité · Backend Épicéa</title><style>{css}</style></head><body><header><div><p class="eyebrow">ÉPICÉA · QUALITÉ LOGICIELLE</p><h1>Comprendre l’état du backend</h1><p>Un bilan lisible pour décider, avec les preuves techniques pour approfondir.</p></div><span class="stamp">{timestamp}</span></header><main><nav role="tablist" aria-label="Rubriques du rapport">{nav}</nav><noscript><p>Activez JavaScript pour utiliser les onglets. Les fiches et fichiers de données restent consultables séparément.</p></noscript>{panels}</main><footer>Rapport backend · lecture locale possible · aucune bibliothèque ou police externe</footer><script>{js}</script></body></html>'
    if project == 'frontend':
        page = page.replace('Backend Épicéa', 'Frontend Épicéa').replace('état du backend', 'état du frontend').replace('Rapport backend ·', 'Rapport frontend ·')
    directory.joinpath('index.html').write_text(page, encoding='utf-8')
    # The old Sonar HTML entry now opens its dedicated tab in the same dashboard.
    directory.joinpath('sonar.html').write_text(f'<!doctype html><html lang="fr"><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=index.html#sonar"><title>Analyse SonarQube</title><a href="index.html#sonar">Ouvrir la rubrique SonarQube du rapport {project}</a></html>', encoding='utf-8')
    for case in cases:
        target = directory / case['report']
        target.write_text(f'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fiche de contrôle</title><style>{css}</style><main class="individual"><a href="../index.html#{case["suite"]}">← Retour au rapport {project}</a>{test_card(case, False)}</main></html>', encoding='utf-8')
    directory.joinpath('dashboard-data.json').write_text(json.dumps({'generated_at': timestamp, 'test_success_percent': rate, 'executed': executed, 'skipped': skipped, 'coverage': coverage, 'warnings': warnings, 'sonar_status': sonar_status, 'actions': actions}, ensure_ascii=False, indent=2), encoding='utf-8')
