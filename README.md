# Le Nid des Pronos — V1.0.13

## Correctif V1.0.13

- Ajout du badge **Descente du bus impossible**.
- Le badge se débloque quand l’équipe choisie comme championne du monde est marquée comme éliminée dans `v_group_standings` après la fin complète de la phase de groupes.
- Le badge utilise l’image `assets/badges/bus-stuck.png`.
- Cache PWA forcé en **1.0.13**.

## Cache

Les assets sont appelés avec :

```txt
?v=1.0.13
```

Le service worker utilise :

```txt
le-nid-des-pronos-v1-0-13
```

Aucun nouveau patch SQL n’est nécessaire pour cette V1.0.13 si `v_group_standings` existe déjà.
