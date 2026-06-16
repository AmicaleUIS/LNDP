
-- ============================================================
-- LE NID DES PRONOS — PATCH V1.6.2
-- 2e choix champion après les poules + message temporaire du Hibou masqué
-- ============================================================
-- À lancer dans Supabase SQL Editor avant de publier les fichiers V1.6.2.

-- 1) 2e choix champion : +50 pts, toutes les équipes avant fin des poules puis qualifiées,
-- ouvert jusqu'au premier match des 16èmes / phase à élimination directe.

create table if not exists public.second_winner_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  predicted_team_id uuid not null references public.football_teams(id) on delete restrict,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint second_winner_predictions_unique_user_competition unique (user_id, competition_id)
);

create index if not exists idx_second_winner_predictions_user on public.second_winner_predictions(user_id);
create index if not exists idx_second_winner_predictions_competition on public.second_winner_predictions(competition_id);
create index if not exists idx_second_winner_predictions_team on public.second_winner_predictions(predicted_team_id);

drop trigger if exists set_updated_at_second_winner_predictions on public.second_winner_predictions;
create trigger set_updated_at_second_winner_predictions
before update on public.second_winner_predictions
for each row execute function public.set_updated_at();

create or replace function public.second_winner_prediction_close_at(p_competition_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select min(m.kickoff_at)
  from public.matches m
  where m.competition_id = p_competition_id
    and coalesce(m.is_test_match, false) = false
    and coalesce(m.status, 'scheduled') not in ('cancelled', 'postponed')
    and m.stage in ('round_of_32'::public.match_stage, 'round_of_16'::public.match_stage);
$$;

create or replace function public.is_second_winner_prediction_open(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(now() < public.second_winner_prediction_close_at(p_competition_id), true);
$$;

create or replace view public.v_second_winner_candidate_teams as
with group_progress as (
  select
    m.competition_id,
    count(*)::int as total_group_matches,
    count(*) filter (where m.status = 'finished'::public.match_status)::int as finished_group_matches,
    (
      count(*) > 0
      and count(*) = count(*) filter (where m.status = 'finished'::public.match_status)
    ) as all_groups_finished
  from public.matches m
  where m.stage = 'group'::public.match_stage
    and coalesce(m.is_test_match, false) = false
    and coalesce(m.status::text, '') not in ('cancelled', 'postponed')
  group by m.competition_id
),
group_teams as (
  select distinct
    m.competition_id,
    m.home_team_id as team_id
  from public.matches m
  where m.stage = 'group'::public.match_stage
    and coalesce(m.is_test_match, false) = false
    and m.home_team_id is not null

  union

  select distinct
    m.competition_id,
    m.away_team_id as team_id
  from public.matches m
  where m.stage = 'group'::public.match_stage
    and coalesce(m.is_test_match, false) = false
    and m.away_team_id is not null
),
qualified as (
  select
    gs.competition_id,
    gs.team_id,
    gs.qualification_status::text as qualification_status
  from public.v_group_standings gs
  where gs.qualification_status in ('qualified', 'qualified_best_third')
)
select
  gt.competition_id,
  gt.team_id,
  ft.name as team_name,
  ft.short_name,
  ft.country_code,
  ft.flag_url,
  case
    when coalesce(gp.all_groups_finished, false) then coalesce(q.qualification_status, 'eliminated')
    else 'available_before_groups_end'
  end::text as qualification_status
from group_teams gt
join public.football_teams ft on ft.id = gt.team_id
left join group_progress gp on gp.competition_id = gt.competition_id
left join qualified q on q.competition_id = gt.competition_id and q.team_id = gt.team_id
where
  -- Avant la fin des poules : toutes les équipes réelles de groupes sont disponibles.
  not coalesce(gp.all_groups_finished, false)
  -- Après la fin des poules : seulement les qualifiées.
  or q.team_id is not null;

grant select on public.v_second_winner_candidate_teams to authenticated;

create or replace function public.is_second_winner_candidate(p_competition_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.v_second_winner_candidate_teams q
    where q.competition_id = p_competition_id
      and q.team_id = p_team_id
  );
$$;

create or replace function public.enforce_second_winner_prediction_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_second_winner_prediction_open(new.competition_id) then
    raise exception '2e choix champion verrouillé : le premier match des 16èmes a commencé.';
  end if;

  if not public.is_second_winner_candidate(new.competition_id, new.predicted_team_id) then
    raise exception 'Cette équipe n’est pas disponible pour le 2e choix champion.';
  end if;

  if TG_OP = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Impossible de transférer un 2e choix champion vers un autre joueur.';
    end if;
    if new.competition_id is distinct from old.competition_id then
      raise exception 'Impossible de transférer un 2e choix champion vers une autre compétition.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_second_winner_prediction_rules on public.second_winner_predictions;
create trigger enforce_second_winner_prediction_rules
before insert or update on public.second_winner_predictions
for each row execute function public.enforce_second_winner_prediction_rules();

alter table public.second_winner_predictions enable row level security;

drop policy if exists "second_winner_select_own_or_admin" on public.second_winner_predictions;
create policy "second_winner_select_own_or_admin"
on public.second_winner_predictions
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "second_winner_insert_own_open" on public.second_winner_predictions;
create policy "second_winner_insert_own_open"
on public.second_winner_predictions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_second_winner_prediction_open(competition_id)
  and public.is_second_winner_candidate(competition_id, predicted_team_id)
);

drop policy if exists "second_winner_update_own_open" on public.second_winner_predictions;
create policy "second_winner_update_own_open"
on public.second_winner_predictions
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_second_winner_prediction_open(competition_id)
)
with check (
  user_id = auth.uid()
  and public.is_second_winner_prediction_open(competition_id)
  and public.is_second_winner_candidate(competition_id, predicted_team_id)
);

drop policy if exists "second_winner_admin_all" on public.second_winner_predictions;
create policy "second_winner_admin_all"
on public.second_winner_predictions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop function if exists public.save_second_winner_prediction(uuid, uuid);

create or replace function public.save_second_winner_prediction(
  p_predicted_team_id uuid,
  p_competition_id uuid default null
)
returns table (
  saved_user_id uuid,
  saved_competition_id uuid,
  saved_predicted_team_id uuid,
  saved_created_at timestamptz,
  saved_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition_id uuid;
  current_user_id uuid := auth.uid();
begin
  target_competition_id := p_competition_id;

  if current_user_id is null then
    raise exception 'Utilisateur non connecté';
  end if;

  if target_competition_id is null then
    select c.id into target_competition_id
    from public.competitions c
    where c.is_active = true
    order by c.id desc
    limit 1;
  end if;

  if target_competition_id is null then
    raise exception 'Compétition active introuvable';
  end if;

  if not public.is_second_winner_prediction_open(target_competition_id) then
    raise exception '2e choix champion verrouillé : le premier match des 16èmes a commencé.';
  end if;

  if not public.is_second_winner_candidate(target_competition_id, p_predicted_team_id) then
    raise exception 'Cette équipe n’est pas disponible pour le 2e choix champion.';
  end if;

  return query
  insert into public.second_winner_predictions as swp (
    user_id,
    competition_id,
    predicted_team_id
  ) values (
    current_user_id,
    target_competition_id,
    p_predicted_team_id
  )
  on conflict on constraint second_winner_predictions_unique_user_competition
  do update
  set predicted_team_id = excluded.predicted_team_id,
      updated_at = now()
  returning
    swp.user_id as saved_user_id,
    swp.competition_id as saved_competition_id,
    swp.predicted_team_id as saved_predicted_team_id,
    swp.created_at as saved_created_at,
    swp.updated_at as saved_updated_at;
end;
$$;

grant execute on function public.save_second_winner_prediction(uuid, uuid) to authenticated;

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
    then 50
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
where
  swp.user_id = auth.uid()
  or public.is_admin()
  or not public.is_second_winner_prediction_open(swp.competition_id);

grant select on public.v_second_winner_predictions to authenticated;

-- 2) Classement général avec bonus champion initial + 2e champion.
-- IMPORTANT :
-- On conserve les colonnes historiques de v_leaderboard_overall dans le même ordre.
-- Sinon Postgres refuse `create or replace view` avec :
-- "cannot drop columns from view".
-- Les nouvelles colonnes du 2e choix sont ajoutées à la fin.

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
    (array_agg(wp.predicted_team_id) filter (where wp.points_total = 100))[1] as winner_team_id,
    max(wp.predicted_team_name) filter (where wp.points_total = 100) as winner_team_name
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
    (array_agg(swp.predicted_team_id) filter (where swp.points_total = 50))[1] as second_winner_team_id,
    max(swp.predicted_team_name) filter (where swp.points_total = 50) as second_winner_team_name
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

-- 3) Message temporaire du Hibou masqué.

insert into public.app_settings (key, value, updated_at)
values ('login_owl_message', '{"enabled":false}'::jsonb, now())
on conflict (key) do nothing;

create or replace function public.admin_set_login_owl_message(p_message jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('login_owl_message', coalesce(p_message, '{"enabled":false}'::jsonb), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

  perform public.admin_log_action(
    'set_login_owl_message',
    'settings',
    jsonb_build_object('message', coalesce(p_message, '{"enabled":false}'::jsonb))
  );
end;
$$;

grant execute on function public.admin_set_login_owl_message(jsonb) to authenticated;

-- Realtime optionnel
do $$
begin
  alter publication supabase_realtime add table public.second_winner_predictions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

select
  'patch_v1_6_2_ready' as check_name,
  public.second_winner_prediction_close_at((select id from public.competitions where is_active = true limit 1)) as second_choice_close_at,
  public.is_second_winner_prediction_open((select id from public.competitions where is_active = true limit 1)) as second_choice_open;
