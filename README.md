# Le Nid des Pronos — V1.0.16

## Correctif V1.0.16

Cette version finalise le fonctionnement des mini-records et conserve le parcours d’inscription avec identifiant interne UIS.

### Mini-records

- Les mini-records sont calculés sur **tous les joueurs**.
- Pour chaque mini-record, **un seul joueur détient le trophée** : le détenteur actuel.
- Le mini-record apparaît comme un badge uniquement chez son détenteur actuel.
- Au clic sur un mini-record, le popup affiche le détail du record et le **classement Top 3** de ce mini-record.
- Le carrousel de l’accueil continue de faire défiler les détenteurs actuels des mini-records.

### Connexion / inscription UIS

- Connexion avec identifiant interne au format `prenom.nom` + mot de passe.
- Inscription avec `prenom.nom`, `surnom`, puis mot de passe.
- Le site transforme automatiquement `prenom.nom` en email fictif Supabase : `prenom.nom@uis.fr`.
- Normalisation de l’identifiant : minuscules, accents retirés, espaces remplacés par des points.

## Important Supabase

Pour que les nouveaux comptes soient utilisables immédiatement, désactiver la confirmation email dans Supabase :

Authentication → Providers → Email → désactiver la confirmation email.

Aucun patch SQL nécessaire pour cette version.

## Déploiement

Publier tous les fichiers sur GitHub Pages. Les assets sont appelés avec :

```txt
?v=1.0.16
```
