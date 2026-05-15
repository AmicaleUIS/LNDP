# Le Nid des Pronos — V1.0.14

## Correctif V1.0.14

Cette version modifie le parcours de connexion/inscription pour éviter l’usage d’une vraie adresse email côté utilisateur.

- Connexion avec identifiant interne au format `prenom.nom` + mot de passe.
- Inscription avec `prenom.nom`, `surnom`, puis mot de passe.
- Le site transforme automatiquement `prenom.nom` en email fictif Supabase : `prenom.nom@uis.fr`.
- Normalisation de l’identifiant : minuscules, accents retirés, espaces remplacés par des points.
- Cache PWA forcé en **1.0.14**.

## Important Supabase

Pour que les nouveaux comptes soient utilisables immédiatement, désactiver la confirmation email dans Supabase :

Authentication → Providers → Email → désactiver la confirmation email.

Aucun patch SQL nécessaire pour cette version.

## Déploiement

Publier tous les fichiers sur GitHub Pages. Les assets sont appelés avec :

```txt
?v=1.0.14
```
