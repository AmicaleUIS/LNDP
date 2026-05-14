# Edge Function sync-football

Synchronise les matchs API-Football vers Supabase.

Déploiement :

```bash
supabase functions deploy sync-football --no-verify-jwt
```

Test :

```bash
curl -X POST "https://TON_PROJECT_REF.functions.supabase.co/sync-football" \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: TON_SYNC_SECRET" \
  -d '{"mode":"fixtures"}'
```
