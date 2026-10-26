# Frontend dynamique — Vite, installation, tests et CI

## Architecture

Le dépôt reste organisé en deux projets sous `restaurant-management` :

- `backend/` : API FastAPI et stockage SQLite.
- `frontend/` : application JavaScript native modulaire, outillage Vite et tests.
- `frontend/public/` : sources HTML/CSS/JS, trois entrées portail/équipe/client.
- `frontend/dist/` : résultat du build, jamais édité à la main ni versionné.

Les écrans récupèrent les données via l’API. Le point d’entrée `entry.js` charge
dynamiquement le module Back Office ou Front Office selon la page. Le portail
ne charge pas le code de gestion de l’équipe. Vite produit des chunks minifiés
avec empreintes de contenu et un manifeste de build. Les anciens gestionnaires
inline restent accessibles via un pont explicite sur `window` ; les fonctions
redéfinies ont été éliminées avant la conversion en modules.

Cette application est dynamique côté navigateur. La production distribue toujours
des fichiers HTML/CSS/JS, comme la plupart des applications clientes. Il n’y a pas
de rendu serveur React/SSR : ajouter un tel moteur ne rendrait pas, à lui seul,
les parcours internes de gestion plus rapides.

## Prérequis

Node.js 24 LTS avec npm, Python 3.11+ (3.13 recommandé), Git et un navigateur
moderne. L’installation accède à npm/PyPI et, avec `--dev`, au CDN Playwright.
Le fichier `frontend/package-lock.json` verrouille les dépendances : utiliser
`npm ci` en CI et sur un nouveau poste.

## Installation automatisée

Depuis la racine sous Windows :

```powershell
git clone https://github.com/assimatagba/restaurant-management.git
cd restaurant-management
git switch ci/github-actions-sonarqube
py scripts/manage.py setup --project all --dev
```

Sous Linux/macOS, remplacer `py` par `python3`. Le script crée `.venv-ci`,
installe les dépendances backend, exécute `npm ci --prefix frontend` puis installe
Chromium si `--dev` est présent. Il conserve la base SQLite existante.

Installation frontend seule :

```powershell
py scripts/manage.py setup --project frontend --dev
```

Sous Linux, les tests Chromium peuvent nécessiter les bibliothèques système :

```bash
npm exec --prefix frontend -- playwright install --with-deps chromium
```

Cette commande peut nécessiter sudo pour les paquets système. En CI Ubuntu elle
est intégrée au workflow. Aucune installation globale de Vite n’est nécessaire.

## Développement : deux terminaux

Terminal API :

```powershell
py scripts/manage.py start --project backend
```

Terminal frontend :

```powershell
py scripts/manage.py start --project frontend
```

Équivalents manuels :

```powershell
.\.venv-ci\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
npm run dev --prefix frontend
```

Sous Linux/macOS, l’interpréteur du virtualenv est `.venv-ci/bin/python`.

Ouvrir http://127.0.0.1:5173/ ; l’équipe est sur `/back-office/`, la carte client
sur `/front-office/`. Vite recharge les sources après modification et transmet
les requêtes `/api` à http://127.0.0.1:8000. Le port 5173 est strict : si occupé,
Vite signale l’erreur au lieu de changer silencieusement de port.

Pour une API sur un autre port, définir `API_PROXY_TARGET` avant de démarrer Vite :

```powershell
$env:API_PROXY_TARGET = 'http://127.0.0.1:8001'
npm run dev --prefix frontend
```

```bash
API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev --prefix frontend
```

Le navigateur utilise une même origine grâce au proxy. Aucun secret ne doit être
placé dans une variable Vite exposée au navigateur. Le service worker de
production est désactivé sur l’origine du serveur de développement pour éviter
la mise en cache des modules HMR.

## Production et prévisualisation

```powershell
npm ci --prefix frontend
npm run build --prefix frontend
npm run preview --prefix frontend
```

Le preview est sur http://127.0.0.1:4173/ et conserve le proxy API. Ce serveur sert
à valider le build, pas à héberger une production publique. Le build contient
trois pages, les chunks avec empreintes de contenu, les CSS optimisés,
`.vite/manifest.json`, le manifeste PWA et le service worker.

Pour utiliser FastAPI comme serveur commun :

```powershell
py scripts/manage.py start --project all
```

Cette commande compile d’abord le frontend puis démarre FastAPI au port 8000.
FastAPI privilégie `frontend/dist` si ce dossier existe. Sans build, il conserve
un repli vers les sources pour compatibilité ; le mode de développement
recommandé reste Vite. Après un nouveau build, redémarrer l’API si elle avait été
lancée sans dossier `dist`.

Le service worker ne met en cache que les ressources de production sous
`/assets/`. Les réponses API et les pages HTML ne sont pas servies depuis un
ancien cache. Les ressources portent des empreintes de contenu pour éviter les
collisions entre versions.

Le paquet déployable `dist/frontend.zip` est généré par :

```powershell
py scripts/manage.py build --project frontend
```

Il contient le résultat Vite à la racine de l’archive, pas les sources ni
`node_modules`. Un hébergement indépendant doit transmettre `/api` à FastAPI,
et conserver les URL `/back-office/` et `/front-office/`.

Avant de produire cette archive, `scripts/validate_frontend.py` contrôle les trois
pages, l’existence de leurs ressources, les modules chargés dynamiquement et les
polices WOFF2 locales. Il refuse un build sans chargement dynamique ou dépendant
de Google Fonts. Son résultat est publié dans `build-validation.json`.

## Tests et rapports

```powershell
py scripts/manage.py test --project frontend
```

La chaîne exécute séparément les tests unitaires et les régressions Node,
génère JUnit/LCOV, compile Vite, puis teste le résultat réel dans Chromium.
Les appels API sont simulés dans les tests frontend pour garder cette CI
indépendante du backend. Les tests REST backend vérifient le serveur réel avec
une base temporaire.

Les tests navigateur vérifient : connexion, navigation, ouverture du profil,
calcul du nom complet, maintien du formulaire pendant un cycle de rafraîchissement,
envoi unique d’un congé, confirmation et historique ; ils vérifient aussi le
portail et le chargement de la carte client. Ils remontent les erreurs JavaScript
du build et conservent trace/capture uniquement en cas d’échec.

Commandes ciblées :

```powershell
npm test --prefix frontend
npm run build --prefix frontend
npm run test:e2e --prefix frontend
```

`scripts/ci_run.py --project frontend --suite unit` ou `--suite regression`
permet de cibler une suite Node ; le build et les E2E sont également exécutés.

Rapports dans `reports/frontend/` :

| Chemin | Contenu |
| --- | --- |
| `index.html`, `summary.json` | bilan du projet et des étapes |
| `cases/*.html`, `cases/*.json` | rapport individuel de chaque test |
| `unit/junit.xml`, `regression/junit.xml` | résultats par cas |
| `unit/lcov.info`, `regression/lcov.info` | couverture JavaScript |
| `e2e/junit.xml`, `e2e/html/index.html` | résultats Chromium et rapport interactif |
| `e2e/results/` | traces/captures des erreurs |
| `build.log`, `build.json` | sortie Vite et paquet généré |
| `sonar.html`, `sonar.json` | analyse réelle ou motif explicite de non-exécution |

La couverture provient des tests Node exécutant le code applicatif. Les tests
Chromium n’ajoutent pas artificiellement de couverture. La couverture CSS et
visuelle n’est pas mesurée. Un échec de tests, de compilation ou de navigateur
fait échouer la commande et la CI ; les rapports disponibles sont quand même
publiés.

## GitHub Actions et SonarQube

Le workflow `.github/workflows/frontend-ci.yml` est distinct de celui du backend.
Il installe Python pour les scripts de rapport, Node 24, les dépendances via
`npm ci` avec cache indexé sur le lockfile, puis Chromium et ses bibliothèques.
Il exécute les tests, le build Vite et les régressions navigateur avant SonarQube.

Les artefacts `frontend-reports` et `frontend-build` sont conservés respectivement
30 et 14 jours. Le résumé du job indique les étapes et leurs codes de sortie.
Les rapports sont publiés même si un test ou le Quality Gate échoue ; une
annulation brutale ou une panne GitHub ne garantit pas la publication.

Configurer `SONAR_TOKEN`, `SONAR_HOST_URL`, `SONAR_FRONTEND_PROJECT_KEY` et, pour
Cloud, `SONAR_ORGANIZATION`. `SONAR_REQUIRED=true` rend la configuration
obligatoire sur les pushs. Le projet backend possède une clé distincte.
Voir [le guide backend](BACKEND_TECHNIQUE.md#9-installation-et-configuration-sonarqube)
pour la procédure serveur et GitHub.

SonarQube analyse les sources, jamais `frontend/dist` ou `node_modules`.
Le Quality Gate réel est attendu pendant 300 secondes maximum. Sans instance
configurée, un rapport « analyse non effectuée » est produit. Les analyses de
branches/PR nécessitent une édition/offre compatible.

## Dépannage

### Lisibilité et rafraîchissements

La taille de base est de 16 px ; les petits textes, libellés et titres ont été
augmentés de 2 px. `comfort.css` fournit les polices WOFF2 locales, les ajustements
tactiles et les règles de réduction des animations. `visuals.js` fournit les SVG
des icônes et plats sans bibliothèque externe ni téléchargement d’images.

Le Back Office demande les changements toutes les deux secondes uniquement si
l’onglet est visible. Il transmet `since` à l’API : si la version n’a pas changé,
le serveur ne reconstruit pas les commandes et historiques. La carte de l’équipe
est vérifiée toutes les 30 secondes, la carte client toutes les 15 secondes.
Les données identiques n’entraînent pas de reconstruction des cartes. Pendant
la saisie d’un formulaire, les rafraîchissements de fond sont différés.

- Port 5173 ou 4173 occupé : arrêter l’ancienne instance identifiée ; les ports
  stricts évitent de lancer les tests sur une autre application.
- API indisponible : vérifier le backend au port 8000 et `API_PROXY_TARGET`.
- Modules en erreur après changement de branche : relancer `npm ci`, puis rebuild.
- Anciennes ressources affichées : rechargement forcé ; le nouveau worker purge
  les anciens caches `epicea-*` lors de son activation.
- Chromium absent : installer avec Playwright ; ne pas utiliser un navigateur
  système de version non maîtrisée pour les tests CI.
- Quality Gate refusé : consulter le rapport et le dashboard ; la couverture
  initiale reste partielle et ne doit pas être maquillée.

## Références officielles

- https://vite.dev/guide/
- https://vite.dev/guide/build
- https://playwright.dev/docs/test-webserver
- https://nodejs.org/api/test.html
- https://github.com/SonarSource/sonarqube-scan-action
