# Le Nid des Pronos — V1.3.37

## V1.3.37 — Reprise après actualisation

- L’application mémorise la dernière page ouverte : accueil, matchs, classements, teams, exploits, profil, etc.
- Après actualisation du navigateur, le joueur revient sur cette même page au lieu de retomber sur l’accueil.
- L’administration mémorise aussi la dernière section ouverte : scores, sauvegardes, santé, joueurs, famille, etc.
- Les paramètres URL restent prioritaires : `app.html?view=matches` ou `admin.html?section=health` forcent toujours une page précise.
- Aucun patch SQL obligatoire.

## V1.3.36 — Labo compté temporairement dans les classements

- Le match labo est maintenant pris en compte temporairement dans les classements pendant qu’il est actif.
- Objectif : tester en live que les classements bougent quand tu changes le score du match labo.
- Classements concernés : joueurs, teams, famille, général et par phase, selon les pronos labo injectés.
- Quand tu retires le match labo, le match et les pronos labo sont supprimés : plus aucune trace dans les vrais classements.
- Santé du Nid garde le voyant “Labo live retiré” pour ne pas oublier de le couper avant validation Coupe du monde.
- Aucun nouveau patch SQL si `patch_v1_3_35_labo_score_status.sql` et `patch_v1_3_34_labo_inject_predictions.sql` sont déjà lancés.

## V1.3.35 — Labo live sans verrou

- Admin > Labo score en direct : ajout des boutons “Remettre à venir” et “Passer en direct”.
- Les boutons de score labo passent par une fonction SQL spéciale qui contourne le verrou de date uniquement pour le match fictif.
- Le match labo peut donc être remis à venir, passé en live et scorer sans être bloqué par “match déjà commencé”.
- Santé du Nid > État Coupe du monde : ajout du voyant “Labo live retiré”, à mettre au vert avant validation Coupe du monde.
- Patch SQL obligatoire : `patch_v1_3_35_labo_score_status.sql`.

## V1.3.34 — Famille général + injection labo

- Corrige le classement Famille général : joueurs et par équipe prennent maintenant en compte les projections live, comme le par phase.
- Les matchs de préparation visibles peuvent être inclus dans le général Famille ; le match labo reste toujours exclu des stats/classements.
- Admin > Labo score en direct : ajout de boutons pour injecter rapidement un score live `0-0`, `1-0`, `1-1`, etc.
- Admin > Labo score en direct : ajout du bouton “Injecter des pronos pour tous” pour remplir le match labo avec des pronos fictifs pour tous les joueurs actifs.
- Les pronos labo sont supprimés quand le match labo est retiré via le bouton admin.
- Patch SQL obligatoire pour l’injection : `patch_v1_3_34_labo_inject_predictions.sql`.

## V1.3.33 — Hotfix classement Famille

- Corrige l’erreur `TypeError: userIds.map is not a function` quand on clique sur Famille dans les classements.
- La fonction de projection live accepte maintenant un tableau, un `Set`, un itérable ou une valeur simple.
- Conserve les corrections V1.3.32 : admin versionné correctement et bloc “Labo score en direct” injecté si l’HTML admin est ancien.
- Aucun patch SQL supplémentaire obligatoire si le patch V1.3.30 du labo live a déjà été lancé.

## V1.3.32 — Hotfix admin labo visible

- Corrige la version affichée dans `admin.html` qui restait bloquée en `v1.3.8`.
- Force les références cache admin/app/service-worker en `1.3.32`.
- Sécurise le bloc “Labo score en direct” : si l’HTML admin chargé est ancien, le bloc est injecté par `admin.js`.
- Le patch SQL du labo reste `patch_v1_3_30_labo_live_match.sql` et doit être lancé pour activer le bouton côté Supabase.

## V1.3.31 — Perchoir teinté par team

- Accueil : les cartes du carrousel “Les chouettes qui font parler le perchoir” prennent la teinte de la team liée au joueur affiché.
- Les cartes de mini-records utilisent la couleur de la team du joueur concerné.
- Les cartes “1er du classement” et “1re équipe” utilisent la couleur de la team correspondante.
- Aucun patch SQL obligatoire.

## V1.3.30 — Labo live + classements propres

- Ajout d’un match fictif “Labo live” activable/désactivable depuis Admin > Sauvegardes > Préparation & prévisualisations.
- Le match fictif sert à tester le direct, les scores et l’affichage live.
- Il est exclu de tous les classements, stats, progressions, graphiques et exploits.
- Le bouton admin “Retirer le match fictif live” supprime le match et ses éventuels pronos/points de test.
- Correction du classement joueur par phase qui pouvait ne plus s’afficher.
- Les évolutions sont isolées par univers : joueur officiel sans Famille, teams bureau sans Famille, Famille seulement dans les onglets Famille.
- Patch SQL obligatoire : `patch_v1_3_30_labo_live_match.sql`.

## V1.3.29 — Hotfix match live accueil

- Le bouton “Voir les pronos du Nid” n’apparaît plus dans le bloc principal de l’accueil.
- Il apparaît uniquement sur les fiches de matchs en direct.
- Le clic ouvre l’onglet Matchs, centre le bon match et ouvre la zone des pronos visibles quand elle existe.
- Corrige l’erreur `ReferenceError: matchIds is not defined` dans l’onglet Matchs.
- Aucun patch SQL obligatoire.

## V1.3.28 — Tous les classements live

- Tous les classements joueurs, teams et Famille utilisent les projections live.
- Les classements par phase affichent aussi les matchs en direct.
- Ajout d’un bouton “Voir les pronos du Nid” directement sur l’accueil.
- Le bouton ouvre le match live en priorité et déplie les pronos visibles.
- Aucun patch SQL obligatoire.

## V1.3.27 — Classements live

- Le classement général joueur se recalcule avec les points provisoires du score live.
- Les tuiles d’accueil utilisent le même classement live.
- Les classements Teams bureau général se recalculent aussi en live.
- Les détails par joueur, team et famille peuvent afficher les points provisoires pendant un match en direct.
- Le realtime des pronos rafraîchit aussi l’accueil et les classements.
- Aucun patch SQL obligatoire.

## V1.3.26 — Hotfix live accueil

- Corrige l’erreur `this.homeLiveMatchCardHtml is not a function` sur l’accueil.
- Remet la carte de match en direct dans l’accueil.
- Sécurise le rendu : si une carte live échoue, l’accueil ne plante plus.
- Aucun patch SQL obligatoire.

## V1.3.25 — Admin Famille + mot de passe

- Admin > Joueurs : bouton pour afficher/masquer le mode Famille d’un joueur UIS.
- Admin > Mode Famille : bouton direct “Activer/Masquer” dans la liste de contrôle Famille.
- Admin > Joueurs : bouton “Mot de passe” qui génère un mot de passe temporaire et force le joueur à changer son mot de passe à la prochaine connexion.
- Côté joueur : écran obligatoire “Change ton mot de passe” après connexion avec le mot de passe temporaire.
- Patch SQL obligatoire : `patch_v1_3_25_admin_famille_password.sql`.

## V1.3.24 — Champion officiel + contrôle Famille

- Patch SQL inclus : `patch_v1_3_24_champion_officiel_admin_famille.sql`.
- Corrige définitivement le verrou champion côté Supabase : les matchs de préparation ne verrouillent plus `winner_predictions`.
- Le verrou SQL utilise uniquement le premier match officiel non-test.
- Admin > Famille : ajoute une section “Qui affiche le mode Famille ?” avec les joueurs ayant activé/masqué le mode Famille.
- Admin > Joueurs : ajoute une pastille visible/masqué pour le mode Famille.
- Important : pour corriger le verrou champion existant, le patch SQL V1.3.24 doit être lancé dans Supabase.

## V1.3.23 — Famille via coupon

- Classement Famille : les profils créés via coupon sont maintenant reconnus comme Famille même si `role` ou `player_scope` n’ont pas été normalisés.
- Ajout de `invited_by` dans le fallback de profils publics.
- Les comptes Famille invités ne sont plus écartés du classement Famille uniquement parce que `profile_setup_done` est faux/manquant.
- Patch SQL inclus : `patch_v1_3_23_repair_family_invited_profiles.sql` pour réparer en base les profils déjà invités par coupon.

## V1.3.22 — Champion ouvert pendant la préparation

- Corrige le verrouillage du choix champion / équipe favorite.
- Les matchs de préparation ne bloquent plus le choix du champion.
- Le verrouillage se fait uniquement au coup d’envoi du premier match officiel non-test.
- Les libellés du profil précisent maintenant “premier match officiel”.
- Aucun patch SQL obligatoire.

## V1.3.21 — Hotfix mobile première connexion

- Corrige le modal “Entre dans le Nid” sur mobile : le joueur peut enfin scroller jusqu’aux avatars et aux boutons.
- Les boutons du bas restent accessibles avec une zone sticky propre.
- Corrige le service worker : les erreurs `Failed to fetch` ne remontent plus en `Uncaught promise` dans la console.
- Aucun patch SQL obligatoire.

## V1.3.20 — Hotfix perchoir

- Accueil : les cartes “1er du classement” et “1re équipe” du carrousel n’affichent plus “Date à confirmer”.
- Elles affichent maintenant “Classement actuel”.
- Aucun patch SQL obligatoire.

## V1.3.19 — Hotfix accueil

- Corrige l’erreur `this.myRankFromRows is not a function` au chargement de l’accueil.
- Sécurise le calcul du rang joueur dans l’accueil quand le classement live est utilisé.
- Aucun patch SQL obligatoire.

## V1.3.18 — Leaders dans le perchoir

- Accueil : le carrousel “Les chouettes qui font parler le perchoir” affiche aussi le 1er joueur du classement général.
- Accueil : le même carrousel affiche aussi la 1re équipe du classement par moyenne.
- Les leaders sont intégrés dans l’affichage déroulant, avec les mini-records existants.
- Si une projection live est active côté accueil, la carte du 1er joueur utilise aussi ce classement provisoire.
- Pas de patch SQL obligatoire.

## V1.3.17 — Mode live

- Accueil : ajout des cartes “En direct” en plus du prochain match, jusqu’à 2 matchs live affichés en même temps.
- Matchs : pendant un live, les pronos visibles affichent une projection de points selon le score courant.
- Classement général : projection provisoire des points live pour les matchs officiels en cours, hors matchs test.
- Admin : au chargement/rafraîchissement, un match dont l’heure de coup d’envoi est passée est automatiquement passé en direct avec 0 - 0 si aucun score n’est saisi.
- Realtime : les changements de score continuent de rafraîchir les écrans joueurs.
- Aucun patch SQL obligatoire.

## V1.3.16 — Copier les coupons Famille

- Profil : ajout d’un bouton “Copier” sur chaque coupon Famille disponible.
- Les coupons utilisés restent affichés comme utilisés, sans bouton inutile.
- Copie via presse-papiers moderne avec fallback pour les navigateurs plus capricieux.
- Pas de patch SQL obligatoire.

## V1.3.15 — Préparation France + TF1

- Matchs de préparation : affichage du pays France si aucune donnée pays n’est encore enregistrée.
- Ajout des icônes locales `assets/icons/flags/fr.png` et `assets/icons/tf1.png`.
- Affichage TF1 pour les matchs de préparation côté joueurs.
- Admin : le choix TF1 est proposé uniquement sur les matchs de préparation ; les matchs officiels gardent beIN/M6/W9.
- Correction desktop du modal de première connexion : la partie droite scrolle correctement et les boutons restent accessibles.
- Patch SQL optionnel : `patch_v1_3_15_preparation_france_tf1.sql` pour mettre à jour les matchs test existants en base.

## V1.3.14 — Tutoriel PWA

- Ajout d’un modal “Installer l’application” avec instructions Chrome Android, Safari iPhone/iPad et Chrome ordinateur.
- Bouton “Installer l’app” dans le profil.
- Bouton “Installer l’app” dans le modal de première connexion.
- Le tutoriel reste simple, visuel et adapté mobile.
- Pas de patch SQL obligatoire.

## V1.3.13 — Première connexion guidée

- Ajout d’un modal obligatoire “Entrer dans le Nid” tant que le profil n’est pas prêt.
- Le joueur choisit son surnom, sa team et son avatar dans un parcours clair.
- Le modal revient automatiquement si le joueur tente de naviguer sans profil complet.
- Bouton “Rentrer dans le Nid” qui valide le profil et envoie ensuite vers l’accueil.
- Le joueur peut se déconnecter depuis le modal s’il s’est trompé de compte.
- Pas de patch SQL obligatoire si les colonnes profil récentes existent déjà.

## V1.3.12 — Hall fermé + MP top conversations

- Hall du Nid : les cartes joueurs sont fermées par défaut et affichent seulement 3 badges + le total d’exploits.
- Suppression du message technique “Le Hall recalcule…” dans l’interface.
- Onglets Exploits/Teams du Nid retravaillés en style carré arrondi propre.
- Dans Teams du Nid, le bloc Famille reste sombre/noir quand il est sélectionné.
- Annuaire : le bouton MP ouvre directement l’onglet MP sur la bonne personne.
- Messages : possibilité d’envoyer directement un sticker hibou comme message dans Général, Team, Famille, Team Famille et MP.
- MP : affichage des 5 conversations les plus actives en haut, puis menu déroulant avec avatar, nom, team, nombre de MP et classement.
- MP : les points rouges restent visibles sur les conversations avec nouveaux messages.

## V1.3.11 — Teams du Nid UX

- Remplace le menu déroulant des salons par des onglets clairs : Général, Team, Famille, MP.
- Le bloc Famille contient les sous-choix Général famille et Team famille quand le mode Famille est visible.
- Refonte des MP : un seul panneau destinataires avec avatar, nom et team, plus une conversation dédiée à droite.
- Choisir un joueur sans historique ouvre une conversation vide prête à écrire ; choisir un joueur existant réouvre l’historique.
- Suppression du gros doublon de conversation MP qui faisait une carte inutile.
- Les bulles de messages restent teintées par la couleur de la team dans les salons et les MP.
- Aucun patch SQL obligatoire si le socle MP V1.3.6 est déjà installé.

## V1.3.10 — Bilan PDF + Hall du Nid

- Reprend les corrections du bilan PDF : fonds non coupés, diplôme paysage, champion choisi récupéré en fallback, exploits PDF enrichis.
- Corrige le Hall du Nid : les exploits des autres joueurs sont recalculés depuis les données Supabase publiques/partagées, et plus depuis un état local du joueur connecté.
- Le Hall combine les profils publics, le classement, les compteurs publics de pronos, les choix champion et les pronos visibles.
- Aucun patch SQL obligatoire si les vues existantes sont déjà présentes.

## V1.3.9 — Bilan PDF corrigé

- Corrige l’impression du diplôme paysage : vraie page A4 paysage et plus de fond coupé.
- Force les fonds PDF en `100% 100%` pour éviter les découpes d’images de fond.
- Récupère plus solidement le champion choisi via `v_winner_predictions` ou `winner_predictions` si le rapport SQL ne le renvoie pas.
- Le Mur des exploits du PDF tient compte des pronos posés, du champion choisi, des matchs test et des résultats déjà comptabilisés.
- Aucun patch SQL obligatoire.

## V1.3.8 — Chat simplifié + Hall complet

- Matchs : suppression de la capsule visible “Auto-enregistré”.
- Exploits : dans le Hall du Nid, les exploits visibles ne se limitent plus aux 3 mis en avant.
- Teams du Nid : choix du salon transformé en sélecteur plus léger.
- MP : conversations accessibles via un menu déroulant avec avatar/nom, affichage d’une seule conversation à la fois, points rouges par conversation non lue.
- MP : les réactions/émoticônes fonctionnent aussi sur les messages privés.
- Messages : fond teinté selon la couleur de la team de l’auteur.

## V1.3.7 — Graphs en boutons + MP par conversation

- Les graphs ne s’empilent plus sous les classements : ils deviennent de vrais boutons dans les sélecteurs.
- Joueurs : Général / Par phase / Évolution.
- Teams bureau : Moyenne / Par points / Évolution moyenne / Évolution points.
- Famille joueurs : Général / Par phase / Évolution général.
- Team Famille : Moyenne / Par points / Évolution moyenne / Évolution points.
- Les MP sont rangés par conversation : une fenêtre de discussion par joueur.
- Aucun nouveau patch SQL obligatoire si le patch V1.3.6 a déjà été lancé.

## V1.3.6 — Graphs intégrés + accueil nettoyé + messages privés

- 4 graphs d’évolution intégrés dans les bons classements : général, teams bureau, Famille, team Famille.
- Couleurs des joueurs/teams appliquées sur les courbes et la légende.
- Boutons Jour/Semaine corrigés dans les graphs intégrés.
- Accueil : suppression du cartouche Pronos manquants, tuiles classement sans bouton Voir, flèche recentrée.
- Accueil : progression des pronos réglable avec ou sans matchs test depuis l’admin.
- Teams du Nid : messages privés depuis l’annuaire et depuis le popup réaction d’un message.
- Sécurité chat : impossible de bloquer un admin ou super admin.
- Admin : bloc Charger une sauvegarde plus compact.
- Bilan PDF : CSS d’impression renforcé pour conserver les fonds quand le navigateur imprime les arrière-plans.
- Patch SQL à lancer : `patch_v1_3_6_graphs_mp_pdf.sql`.

## V1.3.5 — Maquette graph + santé lancement sécurisé

- Admin : ajoute une maquette graph fictive pour tester les courbes avant le premier match test, sans toucher à Supabase.
- Sauvegardes & remise à zéro devient plus clair avec des zones non destructives et des zones danger.
- Santé du Nid affiche un état Coupe du monde basé sur les réglages à couper, sans demander de reset si des joueurs ont déjà posé des pronos.
- Patch SQL à lancer : `patch_v1_3_5_graph_mock_health.sql`.

## V1.3.4 — Prévisualisation graphs avec matchs test

- Admin > Sauvegardes : bouton super admin pour inclure temporairement les matchs test dans les graphs d’évolution.
- Quand le bouton est coupé, les graphs reviennent aux règles normales : matchs officiels terminés uniquement.
- Une pastille prévient quand la prévisualisation est active.
- Patch SQL à lancer : `patch_v1_3_4_graph_preview.sql`.

## V1.3.3 — Progression pronos + actus du Nid

- Accueil : progression visible des pronos posés avec barre et bouton Continuer mes pronos.
- Le carrousel d’accueil mélange les records uniques avec des actus du Nid : hibou en feu, casserole du jour, dernier score exact et match qui a rapporté gros.
- Les actus défilent toutes les 10 secondes comme les mini-records.

## V1.3.2 — Points rouges chat + accueil compact

- Les salons de chat affichent un point rouge par catégorie non lue : Général, Team, Famille ou Team Famille.
- Sur l’accueil, le décompte du prochain match passe dans une pastille à côté du titre.
- Sur l’accueil, l’état du prono devient une petite pastille compacte.

## V1.3.1 — Accueil cliquable + modales UX

- La carte Prochain match de l’accueil ouvre directement le prono du match.
- Elle indique si le prono est déjà posé ou à faire.
- Elle affiche un décompte avant le coup d’envoi.
- Les tuiles de classement de l’accueil ouvrent directement le bon classement.
- Les modales importantes utilisent une croix visible en haut à droite.

## Version V1.3.0 — Reset lancement + bilan PDF collector

Voir aussi l'historique V1.2.4 plus bas.

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
