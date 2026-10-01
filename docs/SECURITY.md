# Authentification et droits d’accès

## Connexion Back Office

Le Back Office requiert une session authentifiée. Après connexion, le navigateur conserve un jeton de session pendant douze heures dans son stockage local et l’envoie dans l’en-tête `Authorization: Bearer <token>` pour chaque route interne.

## Compte super administrateur de démonstration

| Champ | Valeur |
|---|---|
| Email | `admin@epicea.local` |
| Mot de passe | `Admin2026!` |

Ces identifiants sont réservés au développement local et doivent être remplacés avant tout déploiement. Les mots de passe sont stockés avec un hachage `scrypt` et un sel unique.

## Comptes de test

| Profil | Email | Mot de passe |
|---|---|---|
| Manager | `amadou@epicea.local` | `Manager2026!` |
| Serveur | `mariam@epicea.local` | `Serveur2026!` |
| Caissier | `caisse@epicea.local` | `Caisse2026!` |

## Permissions granulaires

Les permissions sont attribuées utilisateur par utilisateur. Le super administrateur les possède toutes. Les principales permissions sont : `menu.manage`, `order.update`, `order.cancel`, `cash.process`, `cash.close`, `reservation.manage`, `service.manage`, `staff.manage`, `table.view`, `table.manage` et `audit.view`.

| Profil | Accès attribués à la création |
|---|---|
| Super administrateur | Toutes les permissions et création de comptes |
| Manager | Carte, commandes, caisse, réservations, service, RH, tables et audit |
| Serveur | Commandes, tables, auto-attribution de table, annulations et états de commande |
| Caissier | Encaissement, clôture de caisse, réservations et consultation des tables |

Les routes sensibles renvoient `401` sans session et `403` si la permission nécessaire n’est pas accordée.

## Modification du profil via le Frontend

Dans le Back Office, ouvrir **Ressources humaines** puis sélectionner **Modifier mon profil**. Chaque utilisateur peut modifier son nom et son adresse email. Le changement de mot de passe demande la saisie du mot de passe actuel avant d’enregistrer le nouveau.