-- ============================================================
-- LE NID DES PRONOS — PATCH V0.26.0
-- Matchs de préparation TEST + classements hors test
-- ============================================================

-- Objectifs :
-- - ajouter 2 matchs de préparation pour tester l'app avant le vrai départ ;
-- - les exclure des classements Coupe du Monde et des exploits normaux ;
-- - garder 2 exploits dédiés aux matchs test côté front ;
-- - permettre à l'admin de remettre à zéro uniquement les scores des matchs test.

-- 1) Colonnes de marquage des matchs test.
alter table public.matches
add column if not exists is_test_match boolean not null default false,
add column if not exists test_match_label text;

-- 2) Teams nécessaires aux matchs de préparation.
insert into public.football_teams (api_team_id, name, short_name, country_code, flag_emoji, flag_url)
select -260001, 'France', 'FRA', 'FR', '🇫🇷', 'https://flagcdn.com/w80/fr.png'
where not exists (
  select 1 from public.football_teams where lower(name) = 'france'
);

insert into public.football_teams (api_team_id, name, short_name, country_code, flag_emoji, flag_url)
select -260002, 'Côte d’Ivoire', 'CIV', 'CI', '🇨🇮', 'https://flagcdn.com/w80/ci.png'
where not exists (
  select 1
  from public.football_teams
  where lower(name) in ('côte d’ivoire', 'côte d''ivoire', 'cote d’ivoire', 'cote d''ivoire', 'ivory coast')
);

insert into public.football_teams (api_team_id, name, short_name, country_code, flag_emoji, flag_url)
select -260003, 'Irlande du Nord', 'NIR', 'GB', '🇬🇧', 'https://flagcdn.com/w80/gb-nir.png'
where not exists (
  select 1
  from public.football_teams
  where lower(name) in ('irlande du nord', 'northern ireland')
);

-- 3) Matchs de préparation.
-- IMPORTANT : api_match_id négatif pour éviter tout conflit avec les vrais matchs API-Football.
with active_competition as (
  select id
  from public.competitions
  where is_active = true
  order by id desc
  limit 1
), france as (
  select id from public.football_teams where lower(name) = 'france' order by api_team_id nulls last limit 1
), cote_ivoire as (
  select id
  from public.football_teams
  where lower(name) in ('côte d’ivoire', 'côte d''ivoire', 'cote d’ivoire', 'cote d''ivoire', 'ivory coast')
  order by api_team_id nulls last
  limit 1
), northern_ireland as (
  select id
  from public.football_teams
  where lower(name) in ('irlande du nord', 'northern ireland')
  order by api_team_id nulls last
  limit 1
), prep_rows as (
  select
    (select id from active_competition) as competition_id,
    -260004::integer as api_match_id,
    (select id from france) as home_team_id,
    (select id from cote_ivoire) as away_team_id,
    '2026-06-04 21:00:00+02'::timestamptz as kickoff_at,
    '2026-06-04'::date as match_day,
    'Stade de la Beaujoire'::text as venue,
    'Nantes'::text as city,
    'group'::public.match_stage as stage,
    'Préparation'::text as group_name,
    null::integer as pool_round,
    'scheduled'::public.match_status as status,
    null::integer as home_score,
    null::integer as away_score,
    null::uuid as winner_team_id,
    'M6 / beIN Sports'::text as tv_channel,
    'manual'::text as tv_channel_source,
    true::boolean as is_test_match,
    'Match de préparation · TEST'::text as test_match_label,
    'FR'::text as venue_country_code,
    'France'::text as venue_country_name,
    'https://flagcdn.com/w80/fr.png'::text as venue_country_flag_url
  union all
  select
    (select id from active_competition),
    -260008::integer,
    (select id from france),
    (select id from northern_ireland),
    '2026-06-08 21:00:00+02'::timestamptz,
    '2026-06-08'::date,
    'Stade Pierre-Mauroy',
    'Lille',
    'group'::public.match_stage,
    'Préparation',
    null::integer,
    'scheduled'::public.match_status,
    null::integer,
    null::integer,
    null::uuid,
    'M6 / beIN Sports',
    'manual',
    true,
    'Match de préparation · TEST',
    'FR',
    'France',
    'https://flagcdn.com/w80/fr.png'
)
insert into public.matches (
  competition_id,
  api_match_id,
  home_team_id,
  away_team_id,
  kickoff_at,
  match_day,
  venue,
  city,
  stage,
  group_name,
  pool_round,
  status,
  home_score,
  away_score,
  winner_team_id,
  tv_channel,
  tv_channel_source,
  is_test_match,
  test_match_label,
  venue_country_code,
  venue_country_name,
  venue_country_flag_url
)
select
  competition_id,
  api_match_id,
  home_team_id,
  away_team_id,
  kickoff_at,
  match_day,
  venue,
  city,
  stage,
  group_name,
  pool_round,
  status,
  home_score,
  away_score,
  winner_team_id,
  tv_channel,
  tv_channel_source,
  is_test_match,
  test_match_label,
  venue_country_code,
  venue_country_name,
  venue_country_flag_url
from prep_rows
where competition_id is not null
  and home_team_id is not null
  and away_team_id is not null
on conflict (api_match_id) do update set
  kickoff_at = excluded.kickoff_at,
  match_day = excluded.match_day,
  venue = excluded.venue,
  city = excluded.city,
  stage = excluded.stage,
  group_name = excluded.group_name,
  pool_round = excluded.pool_round,
  tv_channel = excluded.tv_channel,
  tv_channel_source = excluded.tv_channel_source,
  is_test_match = excluded.is_test_match,
  test_match_label = excluded.test_match_label,
  venue_country_code = excluded.venue_country_code,
  venue_country_name = excluded.venue_country_name,
  venue_country_flag_url = excluded.venue_country_flag_url;

-- 4) Vue matchs enrichie.
-- On garde l'ordre des colonnes déjà exposées et on ajoute les colonnes test à la fin.
create or replace view public.v_matches as
select
  m.id,
  m.competition_id,
  c.name as competition_name,
  c.slug as competition_slug,
  m.api_match_id,
  m.kickoff_at,
  m.match_day,
  m.venue,
  m.city,
  m.stage,
  m.group_name,
  m.status,
  m.home_score,
  m.away_score,
  m.winner_team_id,
  m.tv_channel,
  m.tv_channel_source,
  m.last_api_sync_at,

  ht.id as home_team_id,
  ht.name as home_team_name,
  ht.short_name as home_team_short_name,
  ht.country_code as home_team_country_code,
  ht.flag_emoji as home_team_flag_emoji,
  ht.flag_url as home_team_flag_url,

  at.id as away_team_id,
  at.name as away_team_name,
  at.short_name as away_team_short_name,
  at.country_code as away_team_country_code,
  at.flag_emoji as away_team_flag_emoji,
  at.flag_url as away_team_flag_url,

  m.pool_round,
  m.venue_country_code,
  m.venue_country_name,
  m.venue_country_flag_url,
  m.is_test_match,
  m.test_match_label
from public.matches m
join public.competitions c on c.id = m.competition_id
join public.football_teams ht on ht.id = m.home_team_id
join public.football_teams at on at.id = m.away_team_id;

grant select on public.v_matches to authenticated;

-- 5) Classement général hors matchs de préparation.
create or replace view public.v_leaderboard_overall as
with match_points as (
  select
    p.id as user_id,
    coalesce(sum(pp.points_total) filter (where coalesce(m.is_test_match, false) = false), 0)::int as match_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end) filter (where coalesce(m.is_test_match, false) = false), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end) filter (where coalesce(m.is_test_match, false) = false), 0)::int as good_results,
    coalesce(sum(case when pp.is_good_goal_diff then 1 else 0 end) filter (where coalesce(m.is_test_match, false) = false), 0)::int as good_goal_diffs,
    coalesce(sum(case when pp.is_good_qualified then 1 else 0 end) filter (where coalesce(m.is_test_match, false) = false), 0)::int as good_qualified,
    count(pp.id) filter (where coalesce(m.is_test_match, false) = false)::int as scored_matches
  from public.profiles p
  left join public.prediction_points pp on pp.user_id = p.id
  left join public.matches m on m.id = pp.match_id
  where p.is_active = true
  group by p.id
),
winner_points as (
  select
    user_id,
    coalesce(sum(points_total), 0)::int as winner_points,
    (array_agg(predicted_team_id) filter (where points_total = 100))[1] as winner_team_id,
    max(predicted_team_name) filter (where points_total = 100) as winner_team_name
  from public.v_winner_predictions
  group by user_id
),
base as (
  select
    p.id as user_id,
    p.pseudo,
    p.office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    (coalesce(mp.match_points, 0) + coalesce(wp.winner_points, 0))::int as total_points,
    coalesce(mp.exact_scores, 0)::int as exact_scores,
    coalesce(mp.good_results, 0)::int as good_results,
    coalesce(mp.good_goal_diffs, 0)::int as good_goal_diffs,
    coalesce(mp.good_qualified, 0)::int as good_qualified,
    coalesce(mp.scored_matches, 0)::int as scored_matches,
    coalesce(mp.match_points, 0)::int as match_points,
    coalesce(wp.winner_points, 0)::int as winner_points,
    wp.winner_team_id,
    wp.winner_team_name,
    p.avatar_key,
    p.badge_shape,
    p.badge_color,
    p.featured_badge_ids
  from public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join match_points mp on mp.user_id = p.id
  left join winner_points wp on wp.user_id = p.id
  where p.is_active = true
)
select
  rank() over (
    order by
      total_points desc,
      exact_scores desc,
      good_results desc,
      good_goal_diffs desc,
      lower(pseudo) asc
  )::int as rank,
  *
from base;

grant select on public.v_leaderboard_overall to authenticated;

-- 6) Classements teams hors matchs test.
create or replace view public.v_team_leaderboard_total as
with player_points as (
  select
    p.id as user_id,
    p.office_team_id,
    coalesce(sum(pp.points_total) filter (where coalesce(m.is_test_match, false) = false), 0)::int as match_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end) filter (where coalesce(m.is_test_match, false) = false), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end) filter (where coalesce(m.is_test_match, false) = false), 0)::int as good_results
  from public.profiles p
  left join public.prediction_points pp on pp.user_id = p.id
  left join public.matches m on m.id = pp.match_id
  where p.is_active = true
  group by p.id, p.office_team_id
),
winner_points as (
  select
    user_id,
    coalesce(sum(points_total), 0)::int as winner_points
  from public.v_winner_predictions
  group by user_id
),
base as (
  select
    ot.id as office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    ot.color as office_team_color,
    ot.avatar_url as office_team_avatar_url,
    count(pp.user_id)::int as active_players,
    (coalesce(sum(pp.match_points), 0) + coalesce(sum(wp.winner_points), 0))::int as total_points,
    coalesce(sum(pp.exact_scores), 0)::int as exact_scores,
    coalesce(sum(pp.good_results), 0)::int as good_results,
    coalesce(sum(pp.match_points), 0)::int as match_points,
    coalesce(sum(wp.winner_points), 0)::int as winner_points
  from public.office_teams ot
  join player_points pp on pp.office_team_id = ot.id
  left join winner_points wp on wp.user_id = pp.user_id
  group by ot.id, ot.name, ot.slug, ot.color, ot.avatar_url
)
select
  rank() over (
    order by
      total_points desc,
      exact_scores desc,
      good_results desc,
      lower(office_team_name) asc
  )::int as rank,
  *
from base;

grant select on public.v_team_leaderboard_total to authenticated;

create or replace view public.v_team_leaderboard_average as
with player_points as (
  select
    p.id as user_id,
    p.office_team_id,
    coalesce(sum(pp.points_total) filter (where coalesce(m.is_test_match, false) = false), 0)::int as match_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end) filter (where coalesce(m.is_test_match, false) = false), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end) filter (where coalesce(m.is_test_match, false) = false), 0)::int as good_results
  from public.profiles p
  left join public.prediction_points pp on pp.user_id = p.id
  left join public.matches m on m.id = pp.match_id
  where p.is_active = true
  group by p.id, p.office_team_id
),
winner_points as (
  select
    user_id,
    coalesce(sum(points_total), 0)::int as winner_points
  from public.v_winner_predictions
  group by user_id
),
base as (
  select
    ot.id as office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    ot.color as office_team_color,
    ot.avatar_url as office_team_avatar_url,
    count(pp.user_id)::int as active_players,
    (coalesce(sum(pp.match_points), 0) + coalesce(sum(wp.winner_points), 0))::int as total_points,
    round((coalesce(sum(pp.match_points), 0) + coalesce(sum(wp.winner_points), 0))::numeric / nullif(count(pp.user_id), 0), 2) as average_points,
    coalesce(sum(pp.exact_scores), 0)::int as exact_scores,
    coalesce(sum(pp.good_results), 0)::int as good_results,
    coalesce(sum(pp.match_points), 0)::int as match_points,
    coalesce(sum(wp.winner_points), 0)::int as winner_points
  from public.office_teams ot
  join player_points pp on pp.office_team_id = ot.id
  left join winner_points wp on wp.user_id = pp.user_id
  group by ot.id, ot.name, ot.slug, ot.color, ot.avatar_url
)
select
  rank() over (
    order by
      average_points desc,
      total_points desc,
      exact_scores desc,
      good_results desc,
      lower(office_team_name) asc
  )::int as rank,
  *
from base;

grant select on public.v_team_leaderboard_average to authenticated;

-- 7) Reset manuel des scores de préparation uniquement.
create or replace function public.reset_preparation_scores_secure()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  delete from public.prediction_points pp
  using public.matches m
  where pp.match_id = m.id
    and coalesce(m.is_test_match, false) = true;

  update public.matches
  set
    status = 'scheduled'::public.match_status,
    home_score = null,
    away_score = null,
    winner_team_id = null
  where coalesce(is_test_match, false) = true;
end;
$$;

grant execute on function public.reset_preparation_scores_secure() to authenticated;

-- 8) Mémo version.
insert into public.app_settings (key, value)
values
  ('changelog_0_26_0', '{
    "version": "0.26.0",
    "title": "Matchs de préparation et classements clarifiés",
    "items": [
      "Ajout de 2 matchs de préparation test France - Côte d’Ivoire et France - Irlande du Nord.",
      "Les matchs test sont exclus des classements Coupe du Monde et des exploits normaux.",
      "Ajout d’un reset admin uniquement pour les scores des matchs de préparation.",
      "Les classements joueurs et teams bureau sont clarifiés côté application."
    ]
  }'::jsonb)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
