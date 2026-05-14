# Le Nid des Pronos — V0.26.1

## Nouveautés V0.26.1

- Règles du nid clarifiées dans la modal d’accueil.
- Bonus phase finale expliqué clairement : bon qualifié = +2 pts, y compris après prolongation ou tirs au but.
- Matchs de préparation expliqués comme tests hors classement et hors exploits normaux.

## Nouveautés V0.26.0

Cette version prépare le site pour les tests grandeur nature avant le début de la Coupe du Monde.

### Matchs de préparation TEST

Ajout de 2 matchs de préparation :

- France - Côte d’Ivoire, jeudi 4 juin 2026 à Nantes ;
- France - Irlande du Nord, lundi 8 juin 2026 à Lille.

Ces matchs sont clairement indiqués comme **matchs test**. Ils ne comptent pas dans le vrai classement Coupe du Monde et ne déclenchent pas les exploits normaux.

### Exploits préparation

Ajout de 2 exploits dédiés au test :

- `preparation-two-picks` : les 2 matchs de préparation sont pronostiqués ;
- `prep-good-pick` : au moins 1 bon résultat sur les 2 matchs de préparation.

### Classements

La page Classements est réorganisée :

- **Classement joueurs** avec Général et Par phase ;
- **Teams bureau** par phase, avec choix Moyenne ou Par points ;
- **Évolution** conservé pour les graphiques.

Les exploits ne sont plus affichés dans la ligne principale du classement pour éviter l’effet fouillis.

### Mobile et phase finale

- Les cartes matchs mobiles affichent les deux équipes sur une seule ligne pour réduire le scroll.
- Le tableau de phase finale peut être déplacé horizontalement au doigt ou à la souris.
- Les chaînes TV sont affichées dans les cartouches de phase finale.

### Admin

Ajout d’un bouton de reset des **scores de préparation uniquement**. Les pronos des joueurs sont conservés.

## SQL

À lancer dans Supabase SQL Editor :

```sql
patch_v0_26_0_preparation_classements.sql
```

Si tu viens d’une version avant V0.25.10, lance aussi :

```sql
patch_v0_25_10_reset_messages_backup.sql
```

Si tu viens d’une version avant V0.25.8, lance aussi :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```
