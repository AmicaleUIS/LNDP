# Le Nid des Pronos — V0.25.2

## Nouveautés V0.25.2

- Fusion des onglets **Matchs** et **Mes pronos** dans un seul écran **Matchs & pronos**.
- Suppression du bouton **Mes pronos** du menu desktop et mobile.
- Ajout d’un récap de pronos directement au-dessus de la liste des matchs :
  - nombre de pronos posés ;
  - nombre de pronos manquants ;
  - nombre de matchs verrouillés ;
  - résumé de la phase/journée affichée.
- Clic sur une ligne du récap pour aller directement au match concerné.
- Ajout d’une modal festive/magique quand un exploit est débloqué.
- Si plusieurs exploits sont gagnés d’un coup, ils s’ouvrent **un par un** : fermer le premier ouvre le suivant.
- Les exploits déjà présents au premier lancement de cette version sont marqués comme déjà vus pour éviter d’assommer le joueur avec tout l’historique.

## Base de données

Aucun nouveau patch SQL nécessaire pour la V0.25.2.

Si le site n’a pas encore reçu les versions précédentes, lancer d’abord :

1. `patch_v0_25_0_les_teams_chat.sql`
2. `patch_v0_25_1_teams_details_moderation.sql`

## Fichiers modifiés

- `app.html`
- `js/app.js`
- `css/style.css`
- `service-worker.js`
- `README.md`
