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
?v=1.3.0
```

Le cache PWA est passé en :

```txt
le-nid-des-pronos-v1-2-4
```


## V1.3.0 — Santé du Nid + Journal super admin

- Ajout d’un onglet admin **Santé du Nid** avec voyants : joueurs, famille, coupons, matchs, sauvegardes, badges, chat et module préparation.
- Ajout d’un onglet admin **Journal du Nid** pour suivre les actions sensibles super admin.
- Ajout des emplacements icônes :
  - `assets/icons/owl-png/sante.png`
  - `assets/icons/owl-png/journal.png`
- Patch SQL à lancer : `patch_v1_2_5_sante_journal_admin.sql`.


## V1.3.0 — Bilan PDF final

- Ajout d’un onglet admin **Bilan PDF** avec aperçu temps réel par joueur.
- Ajout de `bilan.html` imprimable en PDF : couverture, résumé, badges, records, graphiques, historique des pronos et diplôme.
- Ajout des emplacements : `assets/icons/owl-png/bilan.png`, `assets/icons/owl-png/diplome.png` et dossier `assets/reports/` pour les futurs fonds.
- Patch SQL à lancer : `patch_v1_2_6_bilan_pdf_final.sql`.


## V1.3.0 — Reset lancement + bilan PDF collector

- Ajout d’un bouton super admin ultra sécurisé **Reset complet lancement** dans Admin > Sauvegardes.
- Le reset supprime l’activité de test : pronos, points, champion, coupons, sauvegardes, messages, réactions, blocages et journal admin.
- Les matchs et leurs informations modifiées restent conservés.
- Le Bilan PDF est réservé à l’admin desktop et masqué sur mobile.
- Le diplôme final passe en format paysage.
- Les fonds PDF sont câblés dans `assets/reports/`.
- Les infos Famille sont masquées dans le PDF si le joueur n’a pas activé le mode Famille.
- Le journal admin remplace les UUID joueurs par les pseudos quand ils sont connus.
- Patch SQL à lancer : `patch_v1_3_0_lancement_bilan.sql`.
