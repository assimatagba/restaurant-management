# Architecture fonctionnelle

## Front Office — `/front-office/`

Interface publique client, sans accès aux écrans internes. Elle permet de consulter uniquement les plats disponibles, filtrer la carte, signaler les allergènes, conserver le panier localement et transmettre une commande confirmée à la cuisine. Le type **sur place** ou **à emporter** est obligatoire avant l’envoi.

## Back Office — `/back-office/`

Interface réservée aux équipes. Elle rassemble les modules :

- tableau de bord manager ;
- KDS cuisine et progression des commandes ;
- plan de salle serveurs ;
- encaissement en caisse ;
- gestion des plats et disponibilités ;
- espace RH et décisions de congés.

## API commune — `/api/`

Le backend FastAPI est la source de vérité : menu, tables, commandes, paiements, personnel, congés et journal d’audit. Le Front Office et le Back Office l’utilisent via HTTP et se synchronisent automatiquement toutes les cinq secondes. Le Back Office consomme un instantané unique `/api/back-office/snapshot`, limitant les requêtes et évitant les états intermédiaires à l’écran. Un canal WebSocket pourra ensuite réduire encore ce délai.

## Règle de séparation

Le Front Office ne fournit aucune fonction d’administration ou de paiement. Les actions sensibles sont concentrées dans le Back Office et consignées dans le journal d’audit côté API.