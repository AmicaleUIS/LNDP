# Le Nid des Pronos — V1.0.19

## Correctif V1.0.19

Cette version ajoute le classement **Teams bureau général** en plus du classement **Teams bureau par phase**.

### Classements Teams bureau

Dans l’onglet **Classements → Teams bureau**, on peut maintenant choisir :

- **Général** ou **Par phase** ;
- **Moyenne** ou **Par points**.

Donc les 4 vues sont disponibles :

- Teams bureau général à la moyenne ;
- Teams bureau général par points ;
- Teams bureau par phase à la moyenne ;
- Teams bureau par phase par points.

Le bouton **Moyenne team** de l’accueil ouvre le classement Teams bureau général en moyenne.

### SQL

Aucun nouveau patch SQL n’est nécessaire pour cette version.

Le patch précédent `patch_v1_0_18_mini_records_prediction_date.sql` reste nécessaire si la vue `v_mini_record_prediction_counts` n’a pas encore été mise à jour pour les mini-records.

## Déploiement

Publier tous les fichiers sur GitHub Pages. Les assets sont appelés avec :

```txt
?v=1.0.19
```

Le cache PWA est passé en :

```txt
le-nid-des-pronos-v1-0-19
```
