# Le Nid des Pronos — V1.1.3

## Version V1.1.3

Correctif SQL : lancer `patch_v1_1_2_admin_role_enum_cast.sql` si le changement de rôle admin affiche une erreur `app_role` / `text`.

Cette version ajoute le **mode Famille** et sépare les droits d'administration.

### Rôles

- `super_admin` : tous les droits de l'ancien admin.
- `admin` : gestion des matchs / scores uniquement.
- `user` : joueur UIS classique.
- `family` : joueur Famille, hors concours officiel.

### Mode Famille

- Les joueurs UIS peuvent générer jusqu'à **3 invitations Famille** depuis leur profil.
- Une invitation = une personne.
- Le code expire après **7 jours**.
- Le membre Famille est rattaché à la team du joueur qui invite.
- La team Famille est figée après inscription.
- Les membres Famille peuvent jouer et obtenir les badges classiques.
- Les membres Famille ne comptent pas dans le classement officiel, les classements Teams bureau, les moyennes officielles ou les mini-records.
- Chaque joueur UIS peut activer ou désactiver l'affichage Famille depuis son profil. Par défaut, c'est masqué.
- Blocage individuel possible dans le chat : un joueur peut masquer les messages d'une personne précise.

### Connexion / inscription

- Compte UIS : `prenom.nom@uis.fr`
- Compte Famille : `prenom.nom.famille@uis.fr`

### Patch SQL obligatoire

Avant de publier cette version, lancer dans Supabase SQL Editor :

```txt
patch_v1_1_0_mode_famille_super_admin.sql
```

Ce patch ajoute les colonnes, tables, fonctions RPC et vues nécessaires.

## Déploiement

Publier tous les fichiers sur GitHub Pages. Les assets sont appelés avec :

```txt
?v=1.1.3
```

Le cache PWA est passé en :

```txt
le-nid-des-pronos-v1-1-3
```
