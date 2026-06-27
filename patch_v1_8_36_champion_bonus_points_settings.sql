-- ============================================================
-- Le Nid des Pronos — V1.8.36
-- Réglage super admin des points bonus champion
-- ============================================================

-- 1) Valeurs par défaut dans app_settings.
insert into public.app_settings (key, value, updated_at)
values
  ('champion_bonus_initial_points', '100'::jsonb, now()),
  ('champion_bonus_second_points', '50'::jsonb, now())
on conflict (key) do nothing;

-- 2) Lecture sûre d'un réglage numérique.
create or replace function public.app_setting_int(p_key text, p_default integer)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  raw text;
begin
  select value into v
  from public.app_settings
  where key = p_key;

  if v is null then
    return greatest(0, coalesce(p_default, 0));
  end if;

  if jsonb_typeof(v) = 'number' then
    raw := v::text;
  elsif jsonb_typeof(v) = 'string' then
    raw := trim(both '"' from v::text);
  elsif jsonb_typeof(v) = 'object' then
    raw := coalesce(v->>'points', v->>'value', v->>'amount');
  else
    raw := null;
  end if;

  if raw ~ '^\s*-?\d+\s*$' then
    return greatest(0, raw::integer);
  end if;

  return greatest(0, coalesce(p_default, 0));
end;
$$;

grant execute on function public.app_setting_int(text, integer) to authenticated;

-- 3) RPC super admin pour modifier les deux valeurs.
create or replace function public.admin_set_champion_bonus_points(
  p_initial_points integer,
  p_second_points integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_points integer := greatest(0, least(500, coalesce(p_initial_points, 100)));
  second_points integer := greatest(0, least(500, coalesce(p_second_points, 50)));
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values
    ('champion_bonus_initial_points', to_jsonb(initial_points), now()),
    ('champion_bonus_second_points', to_jsonb(second_points), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

  perform public.admin_log_action(
    'set_champion_bonus_points',
    'settings',
    jsonb_build_object(
      'initial_points', initial_points,
      'second_points', second_points
    )
  );
end;
$$;

grant execute on function public.admin_set_champion_bonus_points(integer, integer) to authenticated;

-- 4) Vue champion initial : points_total lit le réglage.
create or replace view public.v_winner_predictions as
with final_winner as (
  select distinct on (m.competition_id)
    m.competition_id,
    m.winner_team_id as actual_winner_team_id
  from public.matches m
  where m.stage = 'final'::public.match_stage
    and m.status = 'finished'::public.match_status
    and m.winner_team_id is not null
  order by m.competition_id, m.kickoff_at desc
),
settings as (
  select public.app_setting_int('champion_bonus_initial_points', 100) as bonus_points
)
select
  wp.id,
  wp.user_id,
  p.pseudo,
  wp.competition_id,
  c.name as competition_name,
  public.competition_start_at(wp.competition_id) as competition_start_at,
  not public.is_winner_prediction_open(wp.competition_id) as is_locked,
  wp.predicted_team_id,
  pt.name as predicted_team_name,
  pt.short_name as predicted_team_short_name,
  pt.country_code as predicted_team_country_code,
  pt.flag_url as predicted_team_flag_url,
  fw.actual_winner_team_id,
  aw.name as actual_winner_team_name,
  case
    when fw.actual_winner_team_id is not null
      and fw.actual_winner_team_id = wp.predicted_team_id
    then settings.bonus_points
    else 0
  end::int as points_total,
  wp.created_at,
  wp.updated_at
from public.winner_predictions wp
join public.profiles p on p.id = wp.user_id
join public.competitions c on c.id = wp.competition_id
join public.football_teams pt on pt.id = wp.predicted_team_id
left join final_winner fw on fw.competition_id = wp.competition_id
left join public.football_teams aw on aw.id = fw.actual_winner_team_id
cross join settings
where
  wp.user_id = auth.uid()
  or public.is_admin()
  or not public.is_winner_prediction_open(wp.competition_id);

grant select on public.v_winner_predictions to authenticated;

-- 5) Vue 2e champion : points_total lit le réglage.
create or replace view public.v_second_winner_predictions as
with final_winner as (
  select distinct on (m.competition_id)
    m.competition_id,
    m.winner_team_id as actual_winner_team_id
  from public.matches m
  where m.stage = 'final'::public.match_stage
    and m.status = 'finished'::public.match_status
    and m.winner_team_id is not null
  order by m.competition_id, m.kickoff_at desc
),
settings as (
  select public.app_setting_int('champion_bonus_second_points', 50) as bonus_points
)
select
  swp.id,
  swp.user_id,
  p.pseudo,
  swp.competition_id,
  c.name as competition_name,
  public.second_winner_prediction_close_at(swp.competition_id) as second_winner_close_at,
  not public.is_second_winner_prediction_open(swp.competition_id) as is_locked,
  swp.predicted_team_id,
  pt.name as predicted_team_name,
  pt.short_name as predicted_team_short_name,
  pt.country_code as predicted_team_country_code,
  pt.flag_url as predicted_team_flag_url,
  fw.actual_winner_team_id,
  aw.name as actual_winner_team_name,
  case
    when fw.actual_winner_team_id is not null
      and fw.actual_winner_team_id = swp.predicted_team_id
    then settings.bonus_points
    else 0
  end::int as points_total,
  swp.created_at,
  swp.updated_at
from public.second_winner_predictions swp
join public.profiles p on p.id = swp.user_id
join public.competitions c on c.id = swp.competition_id
join public.football_teams pt on pt.id = swp.predicted_team_id
left join final_winner fw on fw.competition_id = swp.competition_id
left join public.football_teams aw on aw.id = fw.actual_winner_team_id
cross join settings
where
  swp.user_id = auth.uid()
  or public.is_admin()
  or not public.is_second_winner_prediction_open(swp.competition_id);

grant select on public.v_second_winner_predictions to authenticated;

-- 6) Classement général : somme les deux vues dynamiques.
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
    and coalesce(p.is_banned, false) = false
    and coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
  group by p.id
),
first_winner_points as (
  select
    wp.user_id,
    coalesce(sum(wp.points_total), 0)::int as first_winner_points,
    (array_agg(wp.predicted_team_id) filter (where wp.points_total > 0))[1] as winner_team_id,
    max(wp.predicted_team_name) filter (where wp.points_total > 0) as winner_team_name
  from public.v_winner_predictions wp
  join public.profiles p on p.id = wp.user_id
  where coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
  group by wp.user_id
),
second_winner_points as (
  select
    swp.user_id,
    coalesce(sum(swp.points_total), 0)::int as second_winner_points,
    (array_agg(swp.predicted_team_id) filter (where swp.points_total > 0))[1] as second_winner_team_id,
    max(swp.predicted_team_name) filter (where swp.points_total > 0) as second_winner_team_name
  from public.v_second_winner_predictions swp
  join public.profiles p on p.id = swp.user_id
  where coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
  group by swp.user_id
),
base as (
  select
    p.id as user_id,
    p.pseudo,
    p.role,
    p.player_scope,
    p.office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    ot.color as office_team_color,
    (coalesce(mp.match_points, 0) + coalesce(fwp.first_winner_points, 0) + coalesce(swp.second_winner_points, 0))::int as total_points,
    coalesce(mp.exact_scores, 0)::int as exact_scores,
    coalesce(mp.good_results, 0)::int as good_results,
    coalesce(mp.good_goal_diffs, 0)::int as good_goal_diffs,
    coalesce(mp.good_qualified, 0)::int as good_qualified,
    coalesce(mp.scored_matches, 0)::int as scored_matches,
    coalesce(mp.match_points, 0)::int as match_points,
    (coalesce(fwp.first_winner_points, 0) + coalesce(swp.second_winner_points, 0))::int as winner_points,
    fwp.winner_team_id,
    fwp.winner_team_name,
    p.avatar_key,
    p.badge_shape,
    p.badge_color,
    p.featured_badge_ids,
    coalesce(fwp.first_winner_points, 0)::int as first_winner_points,
    coalesce(swp.second_winner_points, 0)::int as second_winner_points,
    swp.second_winner_team_id,
    swp.second_winner_team_name
  from public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join match_points mp on mp.user_id = p.id
  left join first_winner_points fwp on fwp.user_id = p.id
  left join second_winner_points swp on swp.user_id = p.id
  where p.is_active = true
    and coalesce(p.is_banned, false) = false
    and coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
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
