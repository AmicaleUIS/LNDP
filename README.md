# Le Nid des Pronos — V0.26.2

## Nouveautés V0.26.2

Préparation du site pour ajouter facilement les nouvelles images :

- badges **Préparation du nid** et **Test concluant** ;
- image de la chouette volante pour le bouton retour rapide vers le haut ;
- images des **mini-records du nid**.

Aucun patch SQL nécessaire pour cette version.

## Où mettre les images

### Badges préparation

À déposer dans :

```txt
assets/badges/preparation-two-picks.png
assets/badges/prep-good-pick.png
```

### Chouette retour haut

À déposer dans :

```txt
assets/icons/owl-png/retour-haut-chouette.png
```

Si l’image n’existe pas encore, l’application utilise automatiquement `accueil.png` en secours.

### Mini-records

À déposer dans :

```txt
assets/records/<record-id>.png
```

Liste complète dans :

```txt
assets/records/README.md
```

## Conseils image

- Format conseillé : PNG carré `512x512` ou `1024x1024`.
- Fond transparent si possible.
- Garder une petite marge autour du dessin.
- Nom de fichier exact, tout en minuscules, avec les tirets.

## Patch SQL

Le dernier patch SQL nécessaire reste celui de la V0.26.0 :

```txt
patch_v0_26_0_preparation_classements.sql
```

Pour la V0.26.2, il n’y a rien à lancer côté Supabase.
