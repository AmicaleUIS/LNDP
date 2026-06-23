-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.9
-- Unifier matchs comptés : général / phase / team / famille
-- ============================================================
-- À lancer dans Supabase SQL Editor.
-- Objectif : toutes les vues repartent des pronos validés et recalculent les points
-- si prediction_points est manquant ou incomplet.

drop trigger if exists recalc_match_points_after_result on public.matches;

drop view if exists public.v_leaderboard_by_pool_round;
drop view if exists public.v_visible_predictions cascade;

drop function if exists public.admin_repair_missing_scores();
drop function if exists public.recalc_match_points(uuid);
drop function if exists public.recalc_all_points();
drop function if exists public.recalc_match_points_after_result();
drop function if exists public.score_prediction_for_match(integer, integer, uuid, integer, integer, uuid);

create or replace function public.score_prediction_for_match(
  p_home_score_pred integer,
  p_away_score_pred integer,
  p_qualified_team_pred uuid,
  p_home_score integer,
  p_away_score integer,
  p_winner_team_id uuid
)
returns table (
  points_total integer,
  is_exact_score boolean,
  is_good_result boolean,
  is_good_goal_diff boolean,
  is_good_qualified boolean
)
language sql
stable
as $$
  with flags as (
    select
      (p_home_score_pred = p_home_score and p_away_score_pred = p_away_score) as exact,
      (
        case when p_home_score_pred > p_away_score_pred then 'home'
             when p_away_score_pred > p_home_score_pred then 'away'
             else 'draw' end
        =
        case when p_home_score > p_away_score then 'home'
             when p_away_score > p_home_score then 'away'
             else 'draw' end
      ) as good_result,
      ((p_home_score_pred - p_away_score_pred) = (p_home_score - p_away_score)) as good_diff,
      (p_qualified_team_pred is not null and p_winner_team_id is not null and p_qualified_team_pred = p_winner_team_id) as good_qualified
  )
  select
    (
      case when exact then 5 when good_result then 3 else 0 end
      + case when not exact and good_diff then 1 else 0 end
      + case when good_qualified then 2 else 0 end
    )::integer,
    exact,
    good_result,
    good_diff,
    good_qualified
  from flags;
$$;

create view public.v_visible_predictions as
select
  pr.id,
  pr.user_id,
  prof.pseudo,
  prof.office_team_id,
  ot.name as office_team_name,
  ot.slug as office_team_slug,
  ot.color as office_team_color,
  prof.avatar_key,
  prof.badge_shape,
  prof.badge_color,
  pr.match_id,
  pr.home_score_pred,
  pr.away_score_pred,
  pr.qualified_team_pred,
  qt.name as qualified_team_name,
  case
    when m.status::text in ('finished', 'live') and m.home_score is not null and m.away_score is not null
      then coalesce(pp.points_total, s.points_total)
    else pp.points_total
  end as points_total,
  case when m.status::text in ('finished', 'live') and m.home_score is not null and m.away_score is not null
    then coalesce(pp.is_exact_score, s.is_exact_score) else coalesce(pp.is_exact_score, false) end as is_exact_score,
  case when m.status::text in ('finished', 'live') and m.home_score is not null and m.away_score is not null
    then coalesce(pp.is_good_result, s.is_good_result) else coalesce(pp.is_good_result, false) end as is_good_result,
  case when m.status::text in ('finished', 'live') and m.home_score is not null and m.away_score is not null
    then coalesce(pp.is_good_goal_diff, s.is_good_goal_diff) else coalesce(pp.is_good_goal_diff, false) end as is_good_goal_diff,
  case when m.status::text in ('finished', 'live') and m.home_score is not null and m.away_score is not null
    then coalesce(pp.is_good_qualified, s.is_good_qualified) else coalesce(pp.is_good_qualified, false) end as is_good_qualified,
  pr.locked_at,
  pr.created_at,
  pr.updated_at,
  pr.id as prediction_id
from public.predictions pr
join public.matches m on m.id = pr.match_id
left join lateral (
  select pp.*
  from public.prediction_points pp
  where pp.prediction_id = pr.id
     or (pp.user_id = pr.user_id and pp.match_id = pr.match_id)
  order by case when pp.prediction_id = pr.id then 0 else 1 end
  limit 1
) pp on true
left join lateral public.score_prediction_for_match(
  pr.home_score_pred,
  pr.away_score_pred,
  pr.qualified_team_pred,
  m.home_score,
  m.away_score,
  m.winner_team_id
) s on true
left join public.profiles prof on prof.id = pr.user_id
left join public.office_teams ot on ot.id = prof.office_team_id
left join public.football_teams qt on qt.id = pr.qualified_team_pred
where m.kickoff_at <= now()
   or m.status::text in ('live', 'finished');

grant select on public.v_visible_predictions to authenticated;

create or replace function public.recalc_match_points(p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  inserted_count integer := 0;
  cols text[] := array[]::text[];
  exprs text[] := array[]::text[];
  insert_sql text;
begin
  select * into m from public.matches where id = p_match_id;
  if m.id is null then return 0; end if;

  if m.status::text <> 'finished' or m.home_score is null or m.away_score is null then
    delete from public.prediction_points where match_id = p_match_id;
    return 0;
  end if;

  delete from public.prediction_points where match_id = p_match_id;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='prediction_id') then cols := array_append(cols, 'prediction_id'); exprs := array_append(exprs, 'pr.id'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='user_id') then cols := array_append(cols, 'user_id'); exprs := array_append(exprs, 'pr.user_id'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='match_id') then cols := array_append(cols, 'match_id'); exprs := array_append(exprs, 'pr.match_id'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='points_total') then cols := array_append(cols, 'points_total'); exprs := array_append(exprs, 's.points_total'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='is_exact_score') then cols := array_append(cols, 'is_exact_score'); exprs := array_append(exprs, 's.is_exact_score'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='is_good_result') then cols := array_append(cols, 'is_good_result'); exprs := array_append(exprs, 's.is_good_result'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='is_good_goal_diff') then cols := array_append(cols, 'is_good_goal_diff'); exprs := array_append(exprs, 's.is_good_goal_diff'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='is_good_qualified') then cols := array_append(cols, 'is_good_qualified'); exprs := array_append(exprs, 's.is_good_qualified'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='calculated_at') then cols := array_append(cols, 'calculated_at'); exprs := array_append(exprs, 'now()'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='created_at') then cols := array_append(cols, 'created_at'); exprs := array_append(exprs, 'now()'); end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='updated_at') then cols := array_append(cols, 'updated_at'); exprs := array_append(exprs, 'now()'); end if;

  insert_sql := format(
    'insert into public.prediction_points (%s)
     select %s
     from public.predictions pr
     cross join lateral public.score_prediction_for_match(pr.home_score_pred, pr.away_score_pred, pr.qualified_team_pred, $1, $2, $3) s
     where pr.match_id = $4 and pr.home_score_pred is not null and pr.away_score_pred is not null',
     array_to_string(cols, ', '),
     array_to_string(exprs, ', ')
  );

  execute insert_sql using m.home_score, m.away_score, m.winner_team_id, p_match_id;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.recalc_all_points()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row record;
  total_recalculated integer := 0;
begin
  for match_row in
    select id from public.matches
    where status::text = 'finished'
      and home_score is not null
      and away_score is not null
  loop
    total_recalculated := total_recalculated + public.recalc_match_points(match_row.id);
  end loop;
  return total_recalculated;
end;
$$;

create or replace function public.admin_repair_missing_scores()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recalculated integer := 0;
  missing_after integer := 0;
begin
  if auth.uid() is not null then
    begin
      if not public.is_super_admin() then
        raise exception 'Réservé au super admin';
      end if;
    exception when undefined_function then
      if not public.is_admin() then
        raise exception 'Réservé à l’admin';
      end if;
    end;
  end if;

  recalculated := public.recalc_all_points();

  select count(*)::integer into missing_after
  from public.predictions pr
  join public.matches m on m.id = pr.match_id
  left join public.v_visible_predictions vp on vp.prediction_id = pr.id
  where m.status::text = 'finished'
    and m.home_score is not null
    and m.away_score is not null
    and vp.points_total is null;

  return jsonb_build_object('recalculated_prediction_points', recalculated, 'missing_after', missing_after);
end;
$$;

create or replace function public.recalc_match_points_after_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_match_points(new.id);
  return new;
end;
$$;

create trigger recalc_match_points_after_result
after insert or update of status, home_score, away_score, winner_team_id
on public.matches
for each row
execute function public.recalc_match_points_after_result();

create view public.v_leaderboard_by_pool_round as
with rounds as (
  select distinct competition_id, pool_round
  from public.matches
  where stage::text = 'group'
    and pool_round is not null
),
round_progress as (
  select
    competition_id,
    pool_round,
    count(*)::int as total_round_matches,
    count(*) filter (where status::text = 'finished')::int as finished_round_matches
  from public.matches
  where stage::text = 'group'
    and pool_round is not null
  group by competition_id, pool_round
),
base as (
  select
    r.competition_id,
    r.pool_round,
    rp.total_round_matches,
    rp.finished_round_matches,
    p.id as user_id,
    p.pseudo,
    p.office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    coalesce(sum(vp.points_total), 0)::int as total_points,
    coalesce(sum(case when vp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when vp.is_good_result then 1 else 0 end), 0)::int as good_results,
    coalesce(sum(case when vp.is_good_goal_diff then 1 else 0 end), 0)::int as good_goal_diffs,
    coalesce(sum(case when vp.is_good_qualified then 1 else 0 end), 0)::int as good_qualified,
    count(vp.id)::int as scored_matches
  from rounds r
  join round_progress rp on rp.competition_id = r.competition_id and rp.pool_round = r.pool_round
  cross join public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join public.matches m on m.competition_id = r.competition_id and m.pool_round = r.pool_round and m.stage::text = 'group'
  left join public.v_visible_predictions vp on vp.user_id = p.id and vp.match_id = m.id and vp.points_total is not null
  where p.is_active = true
    and coalesce(p.is_banned, false) = false
    and coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
  group by r.competition_id, r.pool_round, rp.total_round_matches, rp.finished_round_matches, p.id, p.pseudo, p.office_team_id, ot.name, ot.slug
)
select
  rank() over (
    partition by competition_id, pool_round
    order by total_points desc, exact_scores desc, good_results desc, good_goal_diffs desc, lower(pseudo) asc
  )::int as rank,
  *
from base;

grant select on public.v_leaderboard_by_pool_round to authenticated;
grant execute on function public.score_prediction_for_match(integer, integer, uuid, integer, integer, uuid) to authenticated;
grant execute on function public.recalc_match_points(uuid) to authenticated;
grant execute on function public.recalc_all_points() to authenticated;
grant execute on function public.admin_repair_missing_scores() to authenticated;

select public.admin_repair_missing_scores() as repair_result;

-- Diagnostic : compare les comptes par joueur entre visible_predictions et leaderboard général si disponible.
select
  'visible_predictions_counts_v1_8_9' as check_name,
  p.pseudo,
  count(vp.id) filter (where vp.points_total is not null) as visible_count,
  coalesce(max(lo.scored_matches), 0) as leaderboard_count
from public.profiles p
left join public.v_visible_predictions vp on vp.user_id = p.id and vp.points_total is not null
left join public.v_leaderboard_overall lo on lo.user_id = p.id
where p.is_active = true
group by p.id, p.pseudo
order by abs(count(vp.id) filter (where vp.points_total is not null) - coalesce(max(lo.scored_matches), 0)) desc, p.pseudo
limit 30;
