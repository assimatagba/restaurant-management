# Épicéa — Gestion de restaurant

Socle applicatif pour un établissement unique, basé sur le cahier des charges fourni. L’application couvre le parcours client, les opérations de cuisine et de salle, l’encaissement, la supervision manager et les premières fonctions RH.

## Arborescence

```text
restaurant-management/
├── backend/                         # API commune aux deux interfaces
│   ├── app/
│   │   ├── database.py       # Schéma et initialisation SQLite
│   │   ├── main.py           # API REST FastAPI et serveur des écrans
│   │   └── schemas.py        # Validation des requêtes API
│   └── requirements.txt
├── data/                            # Base SQLite locale, créée au démarrage
├── docs/
│   └── ARCHITECTURE.md              # Périmètre Front/Back Office
│   └── TRACEABILITY.md               # Suivi des exigences du cahier des charges
│   └── SECURITY.md                   # Connexion, sessions et permissions
│   └── TEST_IDS.md                   # Comptes, tables, QR et plats de test
├── frontend/
│   ├── public/
│   │   ├── index.html               # Portail de choix des espaces
│   │   ├── back-office/             # Interface équipe
│   │   ├── front-office/            # Interface client et panier local
│   │   ├── app.js                   # Interactions Back Office
│   │   └── styles.css               # Design responsive partagé
│   └── src/                         # Réservé à la future migration React
└── tests/                           # Tests de santé de l’API
```

## Fonctionnalités déjà couvertes

- **Front office** : carte, suggestions, filtres diététiques, panier brouillon, choix sur place/à emporter et validation.
- **Cuisine** : tableau KDS en colonnes, allergies, chronométrage et progression des statuts.
- **Serveurs** : plan de salle graphique, détail de table, appel d’addition et réassignation simulée.
- **Caisse** : commandes en attente, sélection du paiement et reçu email planifié.
- **Manager** : disponibilité de la carte, plat du jour et journal d’audit côté API.
- **RH** : employés, consultation et décision des demandes de congé.
- **PWA** : manifeste et cache local pour conserver l’interface lors d’une coupure réseau.

## Démarrer le projet

Installation et démarrage automatisés depuis la racine :

```powershell
py scripts/manage.py setup --project all --dev
py scripts/manage.py start --project all
```

Sous Linux/macOS, remplacer `py` par `python3`. Guides détaillés :
[Backend](docs/BACKEND_TECHNIQUE.md) et [Frontend](docs/FRONTEND_TECHNIQUE.md).
Les workflows GitHub Actions backend et frontend sont indépendants. Pour générer
localement les tests, builds et rapports : `py scripts/manage.py test --project all`.

Le frontend est un projet Vite autonome. Développement avec rechargement :
`py scripts/manage.py start --project frontend` (port 5173), avec le backend
démarré séparément sur le port 8000. `start --project all` compile le frontend
optimisé puis le sert via FastAPI. La CI frontend utilise `npm ci`, un build Vite
et des tests de régression Chromium sur le résultat compilé.

Prérequis : Python 3.11 ou version plus récente.

1. Créer un environnement virtuel : `py -m venv .venv`
2. L’activer sous PowerShell : `.\.venv\Scripts\Activate.ps1`
3. Installer les dépendances : `py -m pip install -r backend\requirements.txt`
4. Lancer l’application : `py -m uvicorn backend.app.main:app --reload`
5. Ouvrir http://127.0.0.1:8000

La base SQLite et ses données de démonstration sont générées au premier lancement dans le dossier `data`.

## API disponible

| Méthode | Route | Objectif |
|---|---|---|
| `GET` | `/api/health` | Vérification de disponibilité |
| `GET`, `POST` | `/api/menu` | Consulter ou créer les plats |
| `PATCH` | `/api/menu/{id}/availability` | Déclarer un plat disponible/indisponible |
| `GET` | `/api/tables` | Plan de salle et états des tables |
| `GET`, `POST` | `/api/orders` | Consulter ou créer une commande |
| `PATCH` | `/api/orders/{id}/status` | Avancer ou annuler une commande |
| `POST` | `/api/orders/{id}/payments` | Encaisser une commande |
| `GET` | `/api/employees` | Lister le personnel |
| `GET`, `PATCH` | `/api/leave-requests` | Gérer les congés |
| `GET` | `/api/dashboard` | Indicateurs de supervision |

La documentation interactive est disponible à http://127.0.0.1:8000/docs.

## Accès aux interfaces

- **Portail** : http://127.0.0.1:8000/
- **Front Office client (QR démo table 4)** : http://127.0.0.1:8000/front-office/?token=t4-92de65af
- **Back Office personnel** : http://127.0.0.1:8000/back-office/

## Compte de démonstration

Le Back Office demande une connexion. En environnement local, le compte super administrateur est `admin@epicea.local` avec le mot de passe `Admin2026!`. Les détails de sécurité et les permissions sont décrits dans [docs/SECURITY.md](docs/SECURITY.md).

Tous les comptes et identifiants de démonstration sont centralisés dans [docs/TEST_IDS.md](docs/TEST_IDS.md).

## Étapes suivantes recommandées

1. Ajouter l’authentification et les permissions granulaires.
2. Remplacer les données locales de l’interface par les appels API REST.
3. Ajouter WebSocket pour les alertes cuisine/salle/caisse en temps réel.
4. Intégrer un prestataire email pour les reçus, puis l’impression de secours.
5. Ajouter migrations, tests métier approfondis et déploiement Docker/cloud.
