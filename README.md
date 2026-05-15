# Le Nid des Pronos — V1.0.2

## Version publique

Cette version marque le passage du site en **1.0.2** avec harmonisation des numéros de version, mise à jour du cache PWA et corrections visibles côté utilisateur.

## Nouveautés V1.0.2

- Tableau de bord mobile compacté : titre, hero, prochain match, pronos manquants, moyenne team et mini-records prennent beaucoup moins de hauteur.
- Ajout d’une carte **Moyenne team** sur l’accueil : rang de la team, moyenne par joueur et accès rapide au classement des teams en mode moyenne.
- Les équipes sans joueur restent visibles dans l’annuaire des teams, avec un état vide explicite.
- Cache PWA passé en **1.0.2** pour forcer la récupération des nouveaux fichiers sur mobile/PWA.

## Cache PWA

Le service worker utilise maintenant :

```txt
le-nid-des-pronos-v1-0-2
```

Les fichiers HTML appellent les assets avec :

```txt
?v=1.0.2
```

Cela force les navigateurs et mobiles déjà installés en PWA à récupérer la nouvelle version au lieu de conserver les anciens fichiers.

## Patch SQL

Aucun nouveau patch SQL n’est nécessaire pour cette V1.0.2.

Le dernier patch SQL nécessaire pour les fonctions de préparation reste :

```txt
patch_v0_26_0_preparation_classements.sql
```

## Images mini-records

Les images des mini-records sont attendues dans :

```txt
assets/records/<record-id>.png
```

Liste complète dans :

```txt
assets/records/README.md
```
