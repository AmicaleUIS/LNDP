# Le Nid des Pronos — V0.25.8

## Nouveautés V0.25.8

- Le joueur choisit lui-même les **3 badges d’exploit** affichés dans les classements.
- Le choix se fait dans **Exploits > Mes exploits**.
- Les autres badges restent visibles dans le détail du joueur et dans le Hall du nid.
- Si un joueur n’a encore rien choisi, l’app garde un aperçu automatique de ses 3 premiers exploits pour éviter un classement vide.
- Ajout du patch SQL `patch_v0_25_8_badges_mis_en_avant.sql` avec la colonne `profiles.featured_badge_ids`.

## À lancer dans Supabase

Si la V0.25.7 est déjà installée, lance uniquement :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```

Ce patch ajoute :

- `profiles.featured_badge_ids text[]` ;
- une limite de 3 badges maximum ;
- l’exposition de ces badges dans `v_public_profiles` ;
- l’exposition de ces badges dans `v_leaderboard_overall`.

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
