-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3 API SYNC
-- ============================================================
-- À lancer dans Supabase SQL Editor avant de brancher l'Edge Function.
-- Ce patch ne casse rien : il ajoute juste des réglages utiles.

insert into public.app_settings (key, value)
values
  ('api_provider', '"api-football"'::jsonb),
  ('api_football_league_id', '1'::jsonb),
  ('api_football_season', '2026'::jsonb),
  ('api_sync_note', '"Les matchs sont synchronisés par Supabase Edge Function sync-football."'::jsonb)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

-- Petite vue pratique pour vérifier rapidement l'état API.
create or replace view public.v_api_sync_status as
select
  count(*) filter (where api_match_id is not null) as api_matches,
  count(*) filter (where status = 'scheduled') as scheduled_matches,
  count(*) filter (where status = 'live') as live_matches,
  count(*) filter (where status = 'finished') as finished_matches,
  max(last_api_sync_at) as last_api_sync_at
from public.matches;

grant select on public.v_api_sync_status to authenticated;

-- Vérification rapide après synchro :
-- select * from public.v_api_sync_status;
-- select kickoff_at, home_team_name, away_team_name, status, home_score, away_score, tv_channel
-- from public.v_matches
-- order by kickoff_at;
