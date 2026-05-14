# Le Nid des Pronos — V0.25.16

## Nouveauté V0.25.16

- Correction de la page **Coupe du monde > Phase finale** : les cartouches de match ne se chevauchent plus.
- Tableau de phase finale plus aéré, avec colonnes plus larges, espacements renforcés et scroll horizontal propre sur mobile/tablette.
- Correction de l’affichage **Admin mobile > Saisie rapide des scores** : largeur verrouillée, filtres mieux rangés, cartes plus compactes et plus lisibles.
- Réduction du bloc de titre admin mobile pour éviter la répétition énorme et limiter le scroll.

## Base de données

Aucun nouveau patch SQL pour la V0.25.16.

Si tu viens d’une version avant V0.25.10, lance toujours :

```sql
patch_v0_25_10_reset_messages_backup.sql
```

Si tu viens d’une version avant V0.25.8, lance aussi :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```
