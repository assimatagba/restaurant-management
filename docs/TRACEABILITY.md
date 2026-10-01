# Matrice de traçabilité — cahier des charges v1

| Domaine | Exigence | État | Implémentation |
|---|---|---:|---|
| Front Office | Carte, catégories, filtres alimentaires et allergènes | Couvert | `front-office/client.js`, API menu |
| Front Office | Plat du jour mis en avant | Couvert | champ `featured` de la carte |
| Front Office | Panier brouillon, validation explicite, pas de paiement en ligne | Couvert | panier local, bouton de validation et texte d’information |
| Front Office | Sur place / à emporter obligatoire | Couvert | validation bloquée tant que le choix n’est pas fait |
| Front Office | QR unique sécurisé par table | Couvert | jetons `table_qr_tokens` et route de résolution ; exemple `?token=t4-92de65af` |
| Front Office | Panier conservé en coupure réseau | Couvert | `localStorage` et cache PWA |
| Front Office | Appel serveur et demande d’addition | Couvert | route `POST /api/server-calls` |
| Cuisine | KDS reçue → préparation → prête | Couvert | écran KDS et changement de statut |
| Cuisine | Allergies et notes critiques | Couvert | affichage renforcé dans les cartes de commande |
| Cuisine | Rupture de stock en temps réel | Couvert | disponibilité API, Manager et synchronisation automatique toutes les 5 secondes |
| Serveurs | Plan de salle graphique, réassignation et historique | Partiel | plan graphique et action de réassignation ; persistance détaillée par table à finaliser |
| Serveurs | Annulation libre et journal d’audit | Couvert | annulation via statut `cancelled`, journal API |
| Caisse | Espèces, carte, mobile money | Couvert | modes de paiement et enregistrement API |
| Caisse | Split de l’addition | Couvert côté API | paiements partiels acceptés jusqu’au solde ; interface de répartition par article à finaliser |
| Caisse | Reçu email, impression papier | Prévu | statut d’envoi présent ; SMTP et imprimante à connecter |
| Caisse | Ouverture, fermeture et rapprochement | Couvert côté API | sessions de caisse et clôture de service avec écart calculé |
| Manager | Menu et disponibilité | Couvert | API et écran Manager |
| Manager | Permissions granulaires et audit | Couvert | comptes, sessions, droits par utilisateur, super administrateur et protection des routes sensibles |
| Manager | Ouverture/fermeture du service | Couvert côté API | sessions de service et remise à zéro des tables |
| RH | Employés, plannings et congés | Couvert côté API | employés, shifts, demandes et décision manager |
| Transverse | Mise à jour sans rafraîchissement manuel | Couvert | synchronisation automatique toutes les 5 secondes sur Front et Back Office ; WebSocket reste une optimisation future |
| Transverse | Authentification | Couvert | connexion Back Office, session Bearer expirant après 12 h et mots de passe hachés avec scrypt |

## Décisions de périmètre respectées

- Aucun paiement en ligne ni livraison n’est exposé dans le Front Office.
- La vente à emporter est gérée sans table obligatoire.
- La gestion de stock détaillée et les remboursements actifs restent hors du périmètre v1 ; les structures de disponibilité et de paiement préservent leur future extension.
- L’application conserve une conception mono-établissement, sans rendre les modèles incompatibles avec une extension future.