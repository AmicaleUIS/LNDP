# Le Nid des Pronos — V1.2.4

## Version V1.2.4 — Module préparation masquable

Cette version ajoute un réglage super admin pour désactiver l’affichage du module “préparation” quand tu veux alléger l’application après les tests ou après la Coupe du monde.

### Patch SQL obligatoire

Avant de publier cette version, lancer dans Supabase SQL Editor, dans cet ordre si ce n'est pas déjà fait :

```txt
patch_v1_1_0_mode_famille_super_admin.sql
patch_v1_1_2_admin_role_enum_cast.sql
patch_v1_2_0_chat_du_nid.sql
patch_v1_2_1_reactions_whatsapp.sql
patch_v1_2_3_coupons_famille_super_admin.sql
patch_v1_2_4_module_preparation.sql
```

### Admin

- Dans **Sauvegardes & remise à zéro > Scores de préparation**, le super admin peut désactiver ou réactiver le module préparation.
- Quand le module est désactivé, les matchs test disparaissent des écrans joueurs et admin.
- Les règles et classements par phase liés aux matchs de préparation sont masqués.
- Les 2 badges de préparation restent visibles dans les exploits.
- En desktop/tablette, la barre admin de gauche affiche aussi les icônes Retour app, Rafraîchir et Déconnexion.

### Chat et Famille

- Salons : `Général`, `Ma team`, `Famille`, `Famille team`.
- Réactions PNG : LOL, Chaud, Oups..., Coeur, Approuvé, Casserole.
- Panneau admin Famille : coupons bonus, réinitialisation de coupons et vue des invités.

## Déploiement

Publier tous les fichiers sur GitHub Pages. Les assets sont appelés avec :

```txt
?v=1.2.4
```

Le cache PWA est passé en :

```txt
le-nid-des-pronos-v1-2-4
```


## V1.2.5 — Santé du Nid + Journal super admin

- Ajout d’un onglet admin **Santé du Nid** avec voyants : joueurs, famille, coupons, matchs, sauvegardes, badges, chat et module préparation.
- Ajout d’un onglet admin **Journal du Nid** pour suivre les actions sensibles super admin.
- Ajout des emplacements icônes :
  - `assets/icons/owl-png/sante.png`
  - `assets/icons/owl-png/journal.png`
- Patch SQL à lancer : `patch_v1_2_5_sante_journal_admin.sql`.
