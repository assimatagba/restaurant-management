# Backend — installation, démarrage et CI

## 1. Périmètre et arborescence

Le dépôt racine est `restaurant-management`. Le code Python est dans
`backend/app`, les dépendances dans `backend/requirements.txt`. FastAPI expose
l’API REST et sert les fichiers de `frontend/public` sur la même origine.
SQLite conserve les données locales dans `data/restaurant.db` (non versionné).
Le frontend possède désormais un projet Vite autonome. En production, FastAPI
sert `frontend/dist` lorsqu’un build existe ; le développement frontend se fait
sur Vite, port 5173, avec proxy de `/api` vers le backend au port 8000.
Il n’y a pas de service de base de données externe à installer.

```text
restaurant-management/
  backend/app/                       API, schémas et accès SQLite
  backend/tests/unit/                tests unitaires Python
  backend/requirements-dev.txt        dépendances CI et rapports
  backend/sonar-project.properties    périmètre SonarQube backend
  tests/test_api.py                   régressions REST et permissions
  tests/test_leave_requests.py        régression du cycle des congés
  tests/conftest.py                   isolation des bases de test
  scripts/manage.py                   installation et démarrage automatisés
  scripts/ci_run.py                   tests, build et rapports
  scripts/sonar_report.py             export du résultat SonarQube
  .github/workflows/backend-ci.yml    pipeline GitHub Actions backend
```

## 2. Prérequis

- Git et accès au dépôt GitHub.
- Python 3.11 minimum, Python 3.13 recommandé et utilisé en CI.
- Module `venv` et pip. Sous Ubuntu : `sudo apt install python3-venv` si nécessaire.
- Accès réseau à PyPI pour l’installation des dépendances.
- Un terminal PowerShell, bash ou zsh. Aucun privilège administrateur n’est
  nécessaire pour installer les bibliothèques dans le dépôt.

Vérifier sous Windows : `py --version` et `git --version`.
Sous Linux/macOS : `python3 --version` et `git --version`.

## 3. Récupération du projet

```bash
git clone https://github.com/assimatagba/restaurant-management.git
cd restaurant-management
git switch ci/github-actions-sonarqube
```

La branche doit d’abord avoir été poussée pour être récupérable depuis une autre
machine. Les chemins ci-dessous sont relatifs à la racine du dépôt.

## 4. Installation automatisée

Windows :

```powershell
py scripts/manage.py setup --project backend --dev
```

Linux/macOS :

```bash
python3 scripts/manage.py setup --project backend --dev
```

Le script crée `.venv-ci` et installe les dépendances runtime et les outils
`pytest-cov` / `pytest-html`. Il ne supprime pas l’ancien `.venv` et n’écrase pas
la base de données. Relancer `setup` réutilise l’environnement. L’option `--dev`
est nécessaire pour les commandes de test avec rapports ; sans cette option,
seules les dépendances de `requirements.txt` sont installées.

L’activation manuelle du virtualenv est facultative : le script utilise toujours
son interpréteur Python par chemin absolu. Il fonctionne également depuis un
autre dossier si on lui fournit son chemin absolu.

## 5. Démarrage automatisé

```powershell
py scripts/manage.py start --project backend
```

Sous Linux/macOS, remplacer `py` par `python3` dans toutes les commandes.
L’application reste au premier plan ; `Ctrl+C` l’arrête proprement.
Par défaut, l’écoute est limitée à `127.0.0.1:8000`.

| URL | Usage |
| --- | --- |
| http://127.0.0.1:8000/api/health | doit retourner `status: ok` |
| http://127.0.0.1:8000/docs | Swagger interactif |
| http://127.0.0.1:8000/back-office/ | connexion de l’équipe |
| http://127.0.0.1:8000/front-office/ | carte client |

Changer de port :

```powershell
py scripts/manage.py start --project backend --port 8001
Invoke-RestMethod http://127.0.0.1:8001/api/health
```

Équivalent manuel Windows :

```powershell
.\.venv-ci\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Équivalent Linux/macOS :

```bash
.venv-ci/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
curl --fail http://127.0.0.1:8000/api/health
```

La base et les données de démonstration sont initialisées au démarrage FastAPI.
Les comptes de démonstration sont documentés dans `TEST_IDS.md` ; leurs secrets
locaux ne doivent pas servir à un déploiement public. Le script
`tools/create_manager.py` est un outil local facultatif : il ne fait pas partie
de l’installation ni de la CI et ne s’exécute jamais automatiquement.

## 6. Tests unitaires et régressions

```powershell
py scripts/manage.py test --project backend
```

Le script appelle Python dans `.venv-ci`, exécute les deux suites séparément,
génère leurs rapports, calcule la couverture puis construit une archive du code.
Un échec dans une suite n’empêche pas l’exécution de l’autre. Le code de sortie
global est non nul si une suite, le calcul de couverture ou le build échoue.

Commandes ciblées, après installation :

```powershell
.\.venv-ci\Scripts\python.exe scripts/ci_run.py --project backend --suite unit
.\.venv-ci\Scripts\python.exe scripts/ci_run.py --project backend --suite regression
.\.venv-ci\Scripts\python.exe -m pytest -q
```

Les tests unitaires couvrent le hachage des mots de passe et les validations de
quantités, dates et profils. Les régressions couvrent les endpoints, permissions,
paiements, tables/fusions et le cycle de soumission/décision des congés.
`tests/conftest.py` utilise un fichier SQLite temporaire pour chaque test : les
tests REST ne modifient jamais la base de service dans `data/`.

## 7. Rapports et build

```text
reports/backend/
  index.html                 bilan du projet, résultats et liens par test
  summary.json               bilan exploitable par un outil
  cases/*.html, *.json       un rapport par cas de test
  unit/junit.xml             résultats unitaires par cas
  unit/tests.html            rapport pytest autonome
  unit/output.log            sortie complète de la suite
  regression/...             mêmes rapports pour les régressions
  coverage.xml               couverture Cobertura pour SonarQube
  coverage-html/index.html   couverture navigable
  build.json                 résultat et taille du paquet
  sonar.html, sonar.json     Quality Gate, métriques et état d’analyse
dist/backend.zip             code backend et dépendances déclarées
```

Le build compile les sources Python en mémoire puis archive les sources ; il ne
démarre pas l’application et n’intègre ni SQLite, ni environnement virtuel, ni
jeton. C’est un paquet de sources déployables, pas une image Docker ni un wheel.
Build seul : `py scripts/manage.py build --project backend`.

Pour servir aussi le frontend optimisé depuis FastAPI, exécuter
`npm ci --prefix frontend`, puis `npm run build --prefix frontend` avant le
démarrage de l’API. `py scripts/manage.py start --project all` effectue ce build
avant de démarrer le serveur commun. Pour le développement avec rechargement
frontend, lancer `start --project backend` et `start --project frontend` dans
deux terminaux. Les archives backend et frontend restent indépendantes.

## 8. Pipeline GitHub Actions

### Lecture simplifiée du rapport backend (version pilote)

Ouvrir `reports/backend/index.html` après une exécution ou après extraction de
l’artefact `backend-reports`. Cette page unique fonctionne localement, sans
connexion réseau, bibliothèque distante ou police externe. Conserver l’ensemble
du dossier extrait pour que les liens vers les fiches et journaux fonctionnent.

Les onglets couvrent la vue d’ensemble, les tests unitaires, les régressions,
la couverture, SonarQube, le livrable, les actions proposées et les détails
techniques. Les fiches utilisent des titres métier et conservent les identifiants,
durées et traces d’erreur dans des sections repliables. Une recherche permet de
retrouver un scénario. Les onglets se parcourent aussi au clavier (flèches,
Home/End). L’impression inclut les différentes rubriques.

La réussite des tests est calculée sur les tests effectivement exécutés, en
excluant les tests sautés. La couverture provient de `coverage.xml`. La décision
SonarQube provient exclusivement du serveur. Une mesure absente reste « Non
évaluée » ; aucun score global ne mélange ces indicateurs. Le repère de couverture
de 80 % est une suggestion de lecture, pas un nouveau seuil bloquant de CI.

Les commentaires et remédiations sont des pistes basées sur les résultats
observés, pas des diagnostics automatiques certains. Un bilan technique valide
avec SonarQube manquant est présenté comme incomplet. Les données détaillées sont
aussi disponibles dans `dashboard-data.json` et `summary.json`.

Régénérer la page sans relancer les tests :

```powershell
.\.venv-ci\Scripts\python.exe scripts/ci_run.py --project backend --report-only
```

Une validation visuelle locale facultative est disponible avec
`node scripts/check_backend_report.cjs` après installation de Playwright/Chromium
dans le projet frontend. Elle teste uniquement le rapport backend et produit les
captures dans `reports/backend/preview/`. La CI backend ne dépend pas de Node pour
générer le rapport. Le frontend partage désormais ce moteur de rapport avec une
couverture LCOV et un onglet supplémentaire pour les parcours Chromium.

Le workflow `backend-ci.yml` s’exécute sur les pushs/PR touchant `backend/`, les
tests Python ou les scripts communs. Un lancement manuel est disponible depuis
**Actions → CI backend → Run workflow**. Les changements exclusivement frontend
ne lancent pas cette CI. Seuls les scripts partagés explicitement listés dans les workflows lancent les
deux pipelines. Le moteur et les modèles du rapport sont désormais partagés ;
leurs modifications déclenchent donc les deux pipelines.

Étapes : checkout avec historique complet, Python 3.13 et cache pip, installation,
tests unitaires, tests de régression, couverture, build, analyse SonarQube avec
attente du Quality Gate, export du rapport SonarQube, bilan final et artefacts.
Les permissions du workflow sont limitées à `contents: read`.

Les connexions SQLite sont ouvertes par un gestionnaire de contexte qui valide
ou annule la transaction puis ferme toujours la connexion, même après une erreur.
Les suites backend traitent `ResourceWarning` et les exceptions de finalisation
non gérées comme des erreurs : une nouvelle fuite de connexion bloque donc la CI.

Les rapports sont publiés avec `if: always()` même si les tests ou le scan
échouent. Si l’installation échoue avant les tests, le bilan indique que les
tests n’ont pas été exécutés ; il n’invente pas de résultats. Une annulation
forcée du runner ou une panne GitHub ne permet pas de garantir une publication.
Les artefacts `backend-reports` sont conservés 30 jours, `backend-build` 14 jours.

## 9. Installation et configuration SonarQube

Par défaut, chaque job démarre une instance Docker `sonarqube:community` temporaire.
Le runner éphémère règle `vm.max_map_count=524288` avec sudo. Le script attend
le serveur, change le mot de passe administrateur, crée le projet et un jeton
d’analyse masqué dans les logs. Le serveur est arrêté après export des résultats.
Les analyses sont indépendantes, sans historique ni décoration de PR ; le lien
localhost du dashboard cesse de fonctionner après le job. Les métriques et le
Quality Gate restent disponibles dans les artefacts HTML/JSON. L’image suit le
canal Community ; sa version peut évoluer.

Pour conserver un historique, configurer une instance SonarQube Server accessible
par les runners GitHub ou SonarQube Cloud. Une configuration externe partielle
fait échouer le job ; elle ne déclenche pas le serveur temporaire. Pour un serveur
sur réseau privé, utiliser un runner auto-hébergé autorisé à le joindre et adapter
`runs-on`. Une URL `localhost` ne désigne pas votre ordinateur depuis GitHub.

1. Créer deux projets manuels distincts dans SonarQube : backend et frontend.
2. Pour SonarQube Cloud, associer le dépôt à l’organisation et désactiver
   l’analyse automatique afin de choisir l’analyse par GitHub Actions.
3. Créer un jeton d’analyse ayant accès aux deux projets (ou adapter les workflows
   pour utiliser deux secrets séparés).
4. Dans GitHub → Settings → Secrets and variables → Actions, créer :

| Type | Nom | Valeur |
| --- | --- | --- |
| Secret | `SONAR_TOKEN` | jeton d’analyse, jamais dans Git |
| Variable | `SONAR_HOST_URL` | URL HTTPS du serveur ou `https://sonarcloud.io` |
| Variable | `SONAR_BACKEND_PROJECT_KEY` | clé exacte du projet backend |
| Variable | `SONAR_FRONTEND_PROJECT_KEY` | clé exacte du projet frontend |
| Variable | `SONAR_ORGANIZATION` | clé d’organisation Cloud ; vide pour Server |

Le scan utilise `backend/sonar-project.properties` depuis la racine du dépôt.
La couverture doit être générée avant le scan. Le Quality Gate bloque le job si
le serveur signale un échec ; l’attente est limitée à 300 secondes. Le rapport
exporte l’état du scanner, du traitement serveur, le résultat du gate et ses
conditions, ainsi que les métriques de qualité. Les détails sont consultables
dans le dashboard SonarQube indiqué dans le rapport.

Les analyses de branches et de PR nécessitent une offre/édition SonarQube qui les
prend en charge sur un serveur externe. Sur le serveur temporaire, chaque build
analyse son code dans un projet neuf sur sa branche principale. Ne pas donner un
jeton à un workflow `pull_request_target` exécutant du code non vérifié.

Sans configuration externe, le serveur temporaire réalise une analyse réelle à
chaque exécution, y compris sur une PR externe sans secrets. Un échec de démarrage,
du scanner ou du Quality Gate fait échouer le job. Les rapports disponibles sont
publiés même en cas d’échec.
Aucun score de couverture n’est simulé : un gate exigeant peut initialement
échouer et doit être résolu en ajoutant des tests ou en définissant explicitement
la politique de qualité du projet.

Pour tester avec Docker Desktop, définir `GITHUB_ENV` et `GITHUB_OUTPUT` vers
des fichiers temporaires privés, puis lancer
`python scripts/prepare_sonar.py --project backend --local`. Ce mode ne modifie
pas le noyau local et n’affiche pas les identifiants. Charger les variables du
fichier dans le processus du scanner, sans les imprimer ni les committer.
Lancer ensuite le scanner avec `backend/sonar-project.properties`, exporter via
`python scripts/sonar_report.py --project backend`, puis reconstruire le bilan
avec `python scripts/ci_run.py --project backend --report-only`.
Après vérification, supprimer le conteneur `ci-sonarqube` et les fichiers de secrets.

## 10. Dépannage et exploitation

### Réservations de tables

La modal Caisse et le bloc du plan de salle utilisent les mêmes endpoints :
`GET /api/reservations/availability?reserved_at=...`, `POST /api/reservations` et
`POST /api/reservations/{id}/cancel`. Les horaires sont interprétés à Dakar (UTC).
Un créneau dure deux heures ; des réservations adjacentes sont autorisées.
Les tables occupées ou en nettoyage sont exclues des créneaux commençant dans
les deux prochaines heures. Pour les créneaux ultérieurs, les réservations
confirmées qui se chevauchent déterminent la disponibilité.

Une réservation peut couvrir plusieurs tables, dont les capacités sont cumulées.
Les tables fusionnées sont contrôlées au niveau de leurs composants physiques.
La création prend un verrou SQLite avant de revérifier les disponibilités, pour
éviter deux confirmations concurrentes. Le nom, l’effectif, la date future et les
notes sont validés côté serveur. L’acteur du journal vient de la session connectée.
Les profils disposant de `reservation.manage` ou de `table.manage` peuvent créer
et annuler. Annuler libère toutes les tables de cette réservation, sans supprimer
une autre réservation ni l’occupation réelle d’une table.

Le marqueur « R » du plan dépend des réservations confirmées non terminées ;
l’affectation d’un serveur ne déclenche plus ce marqueur. La migration ajoute
les notes, la durée et les liens vers les tables sans supprimer les réservations
existantes. Les nouvelles régressions sont collectées automatiquement depuis
le dossier `tests/` par la CI backend.

### Calcul des indicateurs

Les indicateurs journaliers suivent le fuseau du restaurant, `Africa/Dakar` (UTC).
Le CA encaissé additionne les paiements enregistrés aujourd’hui, y compris les
paiements partiels et ceux de commandes plus anciennes. Le nombre de commandes,
le panier moyen et le graphique horaire portent sur les commandes créées ce jour,
hors annulations. Le panier moyen est la moyenne de leurs montants, pas la moyenne
des paiements. Les évolutions comparent la même mesure à hier ; si la base est
nulle ou absente, aucun pourcentage n’est inventé.

L’attente moyenne mesure l’âge actuel des commandes reçues ou en préparation.
Elle ne mesure pas un délai historique de préparation, faute d’horodatage de fin.
Le flux cuisine inclut aussi les commandes déjà payées encore actives, tandis
que la caisse affiche les montants restant à payer. Les délais estimés proviennent
des règles enregistrées. Seuls les services ouverts datés d’aujourd’hui sont affichés
comme ouverts. Le planning personnel vient des créneaux enregistrés sur sept jours.
Le solde de congés est indiqué comme non renseigné : aucun registre de droits
acquis n’existe actuellement. Les données de démonstration initialement insérées
dans SQLite restent des enregistrements de la base ; l’interface n’invente plus
de lignes ou de statistiques de remplacement.

La version de synchronisation inclut l’utilisateur, la minute UTC et la dernière
action d’audit afin de renouveler les compteurs temporels et les périodes, même
sans nouvelle action métier.

- **Python introuvable / ancien `.venv` cassé** : vérifier `py --version`, puis
  utiliser `setup` pour `.venv-ci`, sans déplacer manuellement un virtualenv.
- **Port 8000 occupé** : utiliser `--port 8001` ou arrêter le processus du projet.
- **Module absent** : relancer `setup --project backend --dev` et utiliser le
  Python de `.venv-ci`, pas un pip global différent.
- **SQLite non accessible** : donner un accès en écriture au dossier `data/` ;
  éviter les tests sur la base de production. Sauvegarder la base avant migration.
- **Session expirée** : se reconnecter dans le Back Office ; le brouillon de congé
  est conservé pendant cette reconnexion tant que la page n’est pas rechargée.
- **Scan 401/403** : vérifier le secret, son expiration et les droits du projet.
- **Scan non joignable** : vérifier DNS, certificat et accessibilité depuis le runner.
- **Rapports non suivis par Git** : normal, `reports/` et `dist/` sont ignorés ;
  récupérer les artefacts GitHub ou les fichiers locaux.

Cette étape prépare la CI. Elle ne déploie pas automatiquement sur un hébergement.

## Références officielles

- https://github.com/SonarSource/sonarqube-scan-action
- https://github.com/actions/upload-artifact
- https://docs.github.com/en/actions
- https://docs.pytest.org/en/stable/how-to/output.html
