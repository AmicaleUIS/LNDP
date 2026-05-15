# Le Nid des Pronos — V1.0.8

## Correctif V1.0.8

Version de stabilisation du tableau de bord.

- Tableau de bord desktop remis en page sans carte « Prochain match » géante.
- Les blocs ne sont plus forcés dans une grille qui écrase les autres cartes.
- Sur mobile, le dashboard redevient lisible : les cartes gardent une taille confortable et la page peut scroller si l’écran est trop petit.
- Classement général et Moyenne team restent côte à côte.
- Mini-records visibles en entier, sans être coupés en bas.
- Conservation des avatars rangés et des équipes vides masquées dans l’annuaire.
- Cache PWA forcé en **1.0.8**.

Fichiers statiques à publier avec cache-busting :

```txt
?v=1.0.8
```

Service worker :

```txt
le-nid-des-pronos-v1-0-8
```

Aucun nouveau patch SQL n’est nécessaire pour cette V1.0.8.
