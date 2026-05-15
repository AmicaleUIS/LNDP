-- ============================================================
-- LE NID DES PRONOS — PATCH V1.17
-- Choix du champion du monde + bonus 100 points
-- ============================================================

-- Objectif :
-- - chaque joueur peut choisir l'équipe qui remportera la compétition ;
-- - choix modifiable jusqu'au coup d'envoi du premier match ;
-- - après le début de la compétition, le choix est verrouillé ;
-- - si l'équipe choisie gagne la finale, le joueur gagne +100 points ;
-- - le bonus est intégré au classement général et aux classements teams.

-- ============================================================
-- 1. Table des choix vainqueur
-- ============================================================

create table if not exists public.winner_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  predicted_team_id uuid not null references public.football_teams(id) on delete restrict,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint winner_predictions_unique_user_competition unique (user_id, competition_id)
);

create index if not exists idx_winner_predictions_user on public.winner_predictions(user_id);
create index if not exists idx_winner_predictions_competition on public.winner_predictions(competition_id);
create index if not exists idx_winner_predictions_team on public.winner_predictions(predicted_team_id);

-- updated_at

drop trigger if exists set_updated_at_winner_predictions on public.winner_predictions;
create trigger set_updated_at_winner_predictions
before update on public.winner_predictions
for each row execute function public.set_updated_at();

-- ============================================================
-- 2. Fonctions de verrouillage
-- ============================================================

create or replace function public.competition_start_at(p_competition_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select min(m.kickoff_at)
  from public.matches m
  where m.competition_id = p_competition_id;
$$;

create or replace function public.is_winner_prediction_open(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(now() < public.competition_start_at(p_competition_id), true);
$$;

create or replace function public.enforce_winner_prediction_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  start_at timestamptz;
begin
  select public.competition_start_at(new.competition_id)
  into start_at;

  if start_at is not null and now() >= start_at then
    raise exception 'Choix du champion verrouillé : la compétition a déjà commencé.';
  end if;

  if TG_OP = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Impossible de transférer un choix champion vers un autre joueur.';
    end if;

    if new.competition_id is distinct from old.competition_id then
      raise exception 'Impossible de transférer un choix champion vers une autre compétition.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_winner_prediction_deadline on public.winner_predictions;
create trigger enforce_winner_prediction_deadline
before insert or update on public.winner_predictions
for each row execute function public.enforce_winner_prediction_deadline();

-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.winner_predictions enable row level security;

drop policy if exists "winner_predictions_select_own_or_admin" on public.winner_predictions;
create policy "winner_predictions_select_own_or_admin"
on public.winner_predictions
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "winner_predictions_insert_own_before_start" on public.winner_predictions;
create policy "winner_predictions_insert_own_before_start"
on public.winner_predictions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_winner_prediction_open(competition_id)
);

drop policy if exists "winner_predictions_update_own_before_start" on public.winner_predictions;
create policy "winner_predictions_update_own_before_start"
on public.winner_predictions
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_winner_prediction_open(competition_id)
)
with check (
  user_id = auth.uid()
  and public.is_winner_prediction_open(competition_id)
);

drop policy if exists "winner_predictions_admin_all" on public.winner_predictions;
create policy "winner_predictions_admin_all"
on public.winner_predictions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 4. Vues : choix champion et bonus
-- ============================================================

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
    then 100
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
where
  wp.user_id = auth.uid()
  or public.is_admin()
  or not public.is_winner_prediction_open(wp.competition_id);

grant select on public.v_winner_predictions to authenticated;

-- ============================================================
-- 5. Classement général avec bonus champion
-- ============================================================

create or replace view public.v_leaderboard_overall as
with match_points as (
  select
    p.id as user_id,
    coalesce(sum(pp.points_total), 0)::int as match_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end), 0)::int as good_results,
    coalesce(sum(case when pp.is_good_goal_diff then 1 else 0 end), 0)::int as good_goal_diffs,
    coalesce(sum(case when pp.is_good_qualified then 1 else 0 end), 0)::int as good_qualified,
    count(pp.id)::int as scored_matches
  from public.profiles p
  left join public.prediction_points pp on pp.user_id = p.id
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
    wp.winner_team_name
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

-- ============================================================
-- 6. Classements teams avec bonus champion
-- ============================================================

create or replace view public.v_team_leaderboard_total as
with player_points as (
  select
    p.id as user_id,
    p.office_team_id,
    coalesce(sum(pp.points_total), 0)::int as match_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end), 0)::int as good_results
  from public.profiles p
  left join public.prediction_points pp on pp.user_id = p.id
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
    coalesce(sum(pp.points_total), 0)::int as match_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end), 0)::int as good_results
  from public.profiles p
  left join public.prediction_points pp on pp.user_id = p.id
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

-- ============================================================
-- 7. Realtime + réglages
-- ============================================================

do $$
begin
  alter publication supabase_realtime add table public.winner_predictions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

insert into public.app_settings (key, value)
values
  ('champion_bonus_points', '100'::jsonb)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

-- ============================================================
-- 8. Vérifications rapides
-- ============================================================

select
  'winner_prediction_ready' as check_name,
  public.competition_start_at((select id from public.competitions where is_active = true limit 1)) as competition_start_at,
  public.is_winner_prediction_open((select id from public.competitions where is_active = true limit 1)) as pick_open;

select *
from public.v_leaderboard_overall
order by rank
limit 10;

-- ============================================================
-- FIN PATCH V1.17
-- ============================================================
