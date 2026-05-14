# Le Nid des Pronos — V0.25.11

## Nouveautés V0.25.11

- Popup d’exploit ajusté : l’image est un peu plus petite et reste complète dans le rond.
- Le popup d’exploit affiche maintenant la date d’obtention quand elle est connue.
- Après validation d’un prono, les nouveaux exploits sont comparés avant/après et mis en file de popup directement.
- Dans l’admin, la zone **Charger une sauvegarde** garde uniquement le menu déroulant + le bouton de chargement.
- Sur mobile, le header reste visible en haut avec le bouton burger.
- Ajout d’un bouton flottant “chouette volante” pour revenir rapidement en haut de page.
- Même bouton de retour en haut ajouté côté admin mobile.

## Base de données

Aucun nouveau patch SQL pour la V0.25.11.

Si tu viens d’une version avant V0.25.10, lance toujours :

```sql
patch_v0_25_10_reset_messages_backup.sql
```

Si tu viens d’une version avant V0.25.8, lance aussi :

```sql
patch_v0_25_8_badges_mis_en_avant.sql
```

## Exploits

Les 54 exploits présents dans le catalogue sont câblés dans `computeBadgesForUser()`.

Les images des exploits utilisent le même système que les anciens badges : ajoute un PNG nommé comme l’identifiant du badge dans `assets/badges/`.

Derniers fichiers PNG attendus :

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
