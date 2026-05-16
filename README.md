# Le Nid des Pronos — V1.2.0

## Version V1.2.0 — Chat du Nid

Cette version ajoute le vrai tchat du Nid : salons officiels / Famille, réactions PNG, historique progressif et auto-refresh.

### Patch SQL obligatoire

Avant de publier cette version, lancer dans Supabase SQL Editor, dans cet ordre si ce n'est pas déjà fait :

```txt
patch_v1_1_0_mode_famille_super_admin.sql
patch_v1_1_2_admin_role_enum_cast.sql
patch_v1_2_0_chat_du_nid.sql
```

### Chat

- Salons : `Général`, `Ma team`, `Famille`, `Famille team`.
- Les comptes Famille ne peuvent pas écrire dans le Général officiel.
- Les joueurs UIS doivent activer le mode Famille pour voir/écrire dans les salons Famille.
- 10 derniers messages au chargement.
- Bouton pour charger 20 messages précédents.
- Auto-refresh toutes les 8 secondes.
- Réactions PNG : Chouette, Bien joué, Chambrage, Chaud, Casserole, Je surveille.
- Une seule réaction par joueur et par message.
- Le blocage individuel masque les messages et réactions du joueur bloqué.
- L'auteur peut masquer son message ; le super admin peut masquer tous les messages.

### Mode Famille

- Ajout d'un bouton d'explication dans le profil.
- Le bloc Famille du profil est clarifié.
- Le panneau admin Famille est visuellement amélioré.
- Le mode Famille reste masqué par défaut pour les joueurs UIS.

## Déploiement

Publier tous les fichiers sur GitHub Pages. Les assets sont appelés avec :

```txt
?v=1.2.0
```

Le cache PWA est passé en :

```txt
le-nid-des-pronos-v1-2-0
```
