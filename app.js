# DEBUG API SYNC — Le Nid des Pronos V1.3.1

## 1. Vérifier si la fonction répond

Dans Supabase Dashboard :

Edge Functions → sync-football → Tester / Invoke

Body :

```json
{ "mode": "debug" }
```

Si tout est OK, la réponse doit contenir :

```json
{
  "ok": true,
  "mode": "debug",
  "debug": {
    "httpStatus": 200,
    "apiErrors": "",
    "apiResults": 104,
    "responseLength": 104,
    "firstFixture": {}
  }
}
```

## 2. Interprétation rapide

- `apiErrors` rempli : clé API invalide, quota, abonnement, endpoint non autorisé, etc.
- `apiResults: 0` : l'API ne renvoie aucun match pour league=1 season=2026 avec ta clé/ton plan.
- `apiResults: 104` mais pas de matchs dans l'app : problème d'insertion Supabase ou affichage front.
- `httpStatus` différent de 200 : problème HTTP/API.

## 3. Vérifier la base après synchro

Dans SQL Editor :

```sql
select * from public.v_api_sync_status;

select
  kickoff_at,
  home_team_name,
  away_team_name,
  status,
  home_score,
  away_score,
  tv_channel,
  api_match_id
from public.v_matches
order by kickoff_at
limit 30;
```
