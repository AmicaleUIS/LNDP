# Le Nid des Pronos — V0.25.17

## Nouveauté V0.25.17

Correction ciblée de la phase finale :

- colonnes du bracket élargies ;
- cartes de match contenues dans leur colonne ;
- textes tronqués proprement au lieu de pousser les cartes sur les voisines ;
- connecteurs placés derrière les cartes ;
- scroll horizontal propre en mobile/tablette ;
- plus de chevauchement entre seizièmes, huitièmes, quarts, demies et centre.

## SQL

Aucun nouveau patch SQL pour la V0.25.17.

Si tu viens d’une version avant V0.25.10, lance toujours :

```sql
patch_v0_25_10_reset_messages_backup.sql
```

Si tu viens d’une version avant V0.25.8, lance aussi :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```
