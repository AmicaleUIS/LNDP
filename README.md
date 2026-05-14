# Le Nid des Pronos — V0.25.12

## Nouveautés V0.25.12

- Dans **Classements**, suppression de l’onglet Exploits qui faisait doublon avec la page dédiée.
- Ajout d’un onglet **Évolution** avec graphiques jour/semaine, avatars et noms des joueurs.
- Dans **Teams bureau**, ajout d’un classement **par phase** avec navigation entre les journées/phases.
- Ajout d’une page **Mini-records** dans les Exploits : total points, moyenne, scores exacts, bons résultats, bons écarts, qualifiés, meilleur score sur une journée, séries, pronos validés et casseroles à zéro.
- Harmonisation visuelle des nouveaux blocs avec l’ambiance du nid.

## Base de données

Aucun nouveau patch SQL pour la V0.25.12.

Si tu viens d’une version avant V0.25.10, lance toujours :

```sql
patch_v0_25_10_reset_messages_backup.sql
```

Si tu viens d’une version avant V0.25.8, lance aussi :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```

## Exploits

Les exploits existants restent câblés dans `computeBadgesForUser()`. La V0.25.12 ajoute en plus des **mini-records dynamiques** calculés depuis les pronos et scores visibles, sans nouvelle table.

Les images des exploits utilisent le même système que les anciens badges : ajoute un PNG nommé comme l’identifiant du badge dans `assets/badges/`.
