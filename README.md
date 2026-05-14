# Le Nid des Pronos — V0.25.13

## Nouveauté V0.25.13

- Correction mobile : le header de l'application prend maintenant toute la largeur de l'écran.
- Correction mobile admin : le header admin prend lui aussi toute la largeur de l'écran.
- Suppression des petits débords horizontaux possibles liés au header sticky et au menu burger.

## Base de données

Aucun nouveau patch SQL pour la V0.25.13.

Si tu viens d’une version avant V0.25.10, lance toujours :

```sql
patch_v0_25_10_reset_messages_backup.sql
```

Si tu viens d’une version avant V0.25.8, lance aussi :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```
