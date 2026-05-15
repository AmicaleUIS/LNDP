# Le Nid des Pronos — V1.0.4

## Nouveautés V1.0.4

- Avatars analysés et rangés par type dans `assets/avatars/`.
- Fichiers avatars renommés avec un nom lisible, tout en gardant les clés `owl-01` à `owl-90` pour ne pas casser les profils déjà enregistrés.
- `assets/avatars/avatars.json` enrichi avec `type`, `type_label` et le nouveau chemin de chaque image.
- `js/common.js` synchronisé avec `avatars.json` : les noms affichés dans le site sont maintenant les bons.
- Sélecteur d’avatar du profil groupé par familles : terrain, kop, ambiance, nations et clubs.
- Cache PWA passé en **1.0.4**.

## Cache

Les assets sont appelés avec :

```txt
?v=1.0.4
```

Le cache PWA utilise :

```txt
le-nid-des-pronos-v1-0-4
```

## SQL

Aucun nouveau patch SQL n’est nécessaire pour cette V1.0.4.
