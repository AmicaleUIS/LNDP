# Le Nid des Pronos — V0.25.9

## Nouveautés V0.25.9

- Le popup d’exploit s’ouvre **immédiatement** quand un nouvel exploit est détecté, sans attendre `requestAnimationFrame`.
- Dans le popup, l’image du badge remplit maintenant **tout le rond**.
- Suppression complète du bloc **Récap rapide** dans l’onglet Matchs.
- L’onglet **Les teams** devient **Les teams du nid**.
- Sur mobile, la barre de navigation du bas est remplacée par un **menu burger** avec tous les onglets.

## À lancer dans Supabase

Aucun nouveau patch SQL pour la V0.25.9.

Si tu viens d’une version avant V0.25.8, pense toujours à lancer :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```

Ce patch permet à chaque joueur de choisir les 3 badges affichés dans les classements.

## Images des exploits

Les nouveaux exploits utilisent le même système d’image que les anciens : ajoute simplement un PNG nommé comme l’identifiant du badge dans `assets/badges/`.

Fichiers PNG attendus pour les derniers exploits ajoutés :

- `assets/badges/egg-hatched.png`
- `assets/badges/young-feathers.png`
- `assets/badges/half-nest.png`
- `assets/badges/three-quarter-perch.png`
- `assets/badges/all-picks-in.png`
- `assets/badges/night-owl.png`
- `assets/badges/three-day-ritual.png`
- `assets/badges/seven-day-streak.png`
- `assets/badges/many-active-days.png`
- `assets/badges/last-wingbeat.png`
- `assets/badges/final-winner-oracle.png`
- `assets/badges/final-perfect-score.png`
