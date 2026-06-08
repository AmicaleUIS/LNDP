# Le Nid des Pronos — Brancher API-Football

Cette V1.3 ajoute une Edge Function Supabase `sync-football`.

Elle récupère les vrais matchs depuis API-Football / API-Sports, puis remplit les tables :

- `football_teams`
- `matches`
- scores live / finaux
- statuts : prévu, live, terminé, reporté, annulé
- stade / ville quand l'API les fournit

Les chaînes TV restent manuelles dans l'admin, car l'API score ne garantit pas les diffuseurs TV.

---

## 1. Récupérer une clé API-Football

Créer un compte API-Football / API-Sports et récupérer la clé API.

Endpoint utilisé par la fonction :

```txt
GET /fixtures?league=1&season=2026
GET /fixtures?league=1&season=2026&live=all
```

Pour la Coupe du Monde, API-Football indique que `league=1&season=2026` permet de récupérer les 104 matchs.

---

## 2. Lancer le patch SQL

Dans Supabase SQL Editor, lance :

```txt
sql/patch_v1_3_api_sync.sql
```

---

## 3. Installer / connecter Supabase CLI

Dans le dossier du projet :

```bash
supabase login
supabase link --project-ref TON_PROJECT_REF
```

Le `project-ref` est visible dans l'URL de ton dashboard Supabase.

---

## 4. Ajouter les secrets

```bash
supabase secrets set API_FOOTBALL_KEY="TA_CLE_API_FOOTBALL"
supabase secrets set SYNC_SECRET="UNE_PHRASE_SECRETE_LONGUE"
supabase secrets set API_FOOTBALL_LEAGUE_ID="1"
supabase secrets set API_FOOTBALL_SEASON="2026"
supabase secrets set COMPETITION_SLUG="world-cup-2026"
supabase secrets set APP_TIMEZONE="Europe/Paris"
```

Normalement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent déjà dans l'environnement des Edge Functions Supabase.
Si la fonction dit que `SUPABASE_SERVICE_ROLE_KEY` manque, ajoute-le aussi depuis Supabase Dashboard > Project Settings > API.

---

## 5. Déployer la fonction

```bash
supabase functions deploy sync-football --no-verify-jwt
```

Le `--no-verify-jwt` est volontaire : la fonction fait sa propre sécurité.
Elle accepte :

- un utilisateur connecté admin depuis l'application ;
- ou le header `x-sync-secret` pour les appels Cron.

---

## 6. Tester depuis l'admin

Dans `/admin.html`, utilise :

- `Importer / synchroniser les matchs API`
- puis `Mettre à jour les scores live`

Si tout va bien, les vrais matchs apparaîtront dans l'app.

---

## 7. Tester avec curl

Remplace les valeurs :

```bash
curl -X POST "https://TON_PROJECT_REF.functions.supabase.co/sync-football" \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: UNE_PHRASE_SECRETE_LONGUE" \
  -d '{"mode":"fixtures"}'
```

Puis :

```bash
curl -X POST "https://TON_PROJECT_REF.functions.supabase.co/sync-football" \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: UNE_PHRASE_SECRETE_LONGUE" \
  -d '{"mode":"live"}'
```

---

## 8. Automatiser plus tard avec Cron

Pour le MVP, commence par le bouton admin.

Ensuite, on pourra programmer :

- hors tournoi : 1 synchro par jour ;
- jours de match : toutes les 15 minutes ;
- pendant les matchs : toutes les 1 à 2 minutes si le quota API le permet.

Attention au quota du plan gratuit API-Football : évite la synchro toutes les minutes si tu restes en gratuit.

---

## 9. Notes importantes

- Les pronos restent dans Supabase.
- Les scores API mettent à jour `matches`.
- Le trigger SQL recalcule les points automatiquement quand un score passe à `finished`.
- Si une chaîne TV est mise manuellement dans l'admin, la synchro API ne l'écrase pas.
- Les vrais diffuseurs TV doivent rester corrigeables à la main.
