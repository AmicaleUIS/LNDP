# Le Nid des Pronos — V0.25.15

## Nouveauté V0.25.15

- Refonte visuelle de la page **Coupe du monde > Phase finale**.
- Nouveau tableau façon bracket : les seizièmes partent des deux côtés et le parcours converge vers la finale au centre.
- Cartes compactes par match avec date, équipes, score/statut et lieu.
- Ambiance harmonisée avec Le Nid : fond sombre, doré, halos et rubans colorés plus propres que l’ancien affichage en colonnes.
- Sur mobile/tablette, le tableau devient horizontalement navigable pour garder une vraie lecture de phase finale sans tout écraser.

## Base de données

Aucun nouveau patch SQL pour la V0.25.15.

Si tu viens d’une version avant V0.25.10, lance toujours :

```sql
patch_v0_25_10_reset_messages_backup.sql
```

Si tu viens d’une version avant V0.25.8, lance aussi :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```
