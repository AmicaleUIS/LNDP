# Le Nid des Pronos — V1.0.1

## Version publique

Cette version marque le passage du site en **1.0.1** avec harmonisation des numéros de version, mise à jour du cache PWA et corrections visibles côté utilisateur.

## Nouveautés V1.0.1

- Ajout sur l’écran d’accueil d’un cadre **Mini-records du nid** : un détenteur de record défile toutes les 10 secondes avec son nom, sa team, son haut fait, sa valeur et la date.
- Les classements **par phase** affichent maintenant aussi la phase **Matchs de préparation · TEST** pour les joueurs et les teams bureau, sans réintégrer ces matchs dans le classement général Coupe du Monde.
- Les popups sont mieux centrés sur mobile et plus simples à fermer.
- Les badges / exploits débloqués et les mini-records peuvent s’ouvrir au clic avec grande icône, infos et confettis.
- Les groupes Coupe du monde sont plus lisibles sur mobile : les noms longs d’équipes reviennent à la ligne au lieu d’être coupés.
- La phase finale mobile a un scroll horizontal renforcé, avec boutons gauche/droite pour naviguer dans le tableau.
- Les crédits affichés dans le profil sont mis à jour en **v1.0.1**.

## Cache PWA

Le service worker utilise maintenant :

```txt
le-nid-des-pronos-v1-0-1
```

Les fichiers HTML appellent les assets avec :

```txt
?v=1.0.1
```

Cela force les navigateurs et mobiles déjà installés en PWA à récupérer la nouvelle version au lieu de conserver les anciens fichiers.

## Patch SQL

Aucun nouveau patch SQL n’est nécessaire pour cette V1.0.1.

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
