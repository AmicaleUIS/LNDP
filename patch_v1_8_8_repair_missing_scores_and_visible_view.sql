-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.8
-- Recalcul super admin + v_visible_predictions sans renommage
-- ============================================================
-- À lancer dans Supabase SQL Editor.
-- Corrige :
-- 1) erreur 42P16 sur v_visible_predictions : ordre des colonnes conservé.
-- 2) bouton Super admin > Scores > Réparer scores manquants + recalculer.
-- 3) prediction_points recalculé selon les colonnes réellement présentes.

drop trigger if exists recalc_match_points_after_result on public.matches;

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
  with s as (
    select
      p_home_score_pred as ph,
      p_away_score_pred as pa,
      p_home_score as rh,
      p_away_score as ra,
      p_qualified_team_pred as qualified_pred,
      p_winner_team_id as winner_team
  ),
  flags as (
    select
      (ph = rh and pa = ra) as exact,
      (
        case when ph > pa then 'home' when pa > ph then 'away' else 'draw' end
        =
        case when rh > ra then 'home' when ra > rh then 'away' else 'draw' end
      ) as good_result,
      ((ph - pa) = (rh - ra)) as good_diff,
      (qualified_pred is not null and winner_team is not null and qualified_pred = winner_team) as good_qualified
    from s
  )
  select
    (
      case
        when exact then 5
        when good_result then 3
        else 0
      end
      + case when not exact and good_diff then 1 else 0 end
      + case when good_qualified then 2 else 0 end
    )::integer as points_total,
    exact,
    good_result,
    good_diff,
    good_qualified
  from flags;
$$;

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
  select *
  into m
  from public.matches
  where id = p_match_id;

  if m.id is null then
    return 0;
  end if;

  if m.status::text <> 'finished'
     or m.home_score is null
     or m.away_score is null then
    delete from public.prediction_points where match_id = p_match_id;
    return 0;
  end if;

  delete from public.prediction_points where match_id = p_match_id;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='prediction_id') then
    cols := array_append(cols, 'prediction_id');
    exprs := array_append(exprs, 'pr.id');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='user_id') then
    cols := array_append(cols, 'user_id');
    exprs := array_append(exprs, 'pr.user_id');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='match_id') then
    cols := array_append(cols, 'match_id');
    exprs := array_append(exprs, 'pr.match_id');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='home_score') then
    cols := array_append(cols, 'home_score');
    exprs := array_append(exprs, 'm.home_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='away_score') then
    cols := array_append(cols, 'away_score');
    exprs := array_append(exprs, 'm.away_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='actual_home_score') then
    cols := array_append(cols, 'actual_home_score');
    exprs := array_append(exprs, 'm.home_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='actual_away_score') then
    cols := array_append(cols, 'actual_away_score');
    exprs := array_append(exprs, 'm.away_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='real_home_score') then
    cols := array_append(cols, 'real_home_score');
    exprs := array_append(exprs, 'm.home_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='real_away_score') then
    cols := array_append(cols, 'real_away_score');
    exprs := array_append(exprs, 'm.away_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='home_score_actual') then
    cols := array_append(cols, 'home_score_actual');
    exprs := array_append(exprs, 'm.home_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='away_score_actual') then
    cols := array_append(cols, 'away_score_actual');
    exprs := array_append(exprs, 'm.away_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='home_score_pred') then
    cols := array_append(cols, 'home_score_pred');
    exprs := array_append(exprs, 'pr.home_score_pred');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='away_score_pred') then
    cols := array_append(cols, 'away_score_pred');
    exprs := array_append(exprs, 'pr.away_score_pred');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='predicted_home_score') then
    cols := array_append(cols, 'predicted_home_score');
    exprs := array_append(exprs, 'pr.home_score_pred');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='predicted_away_score') then
    cols := array_append(cols, 'predicted_away_score');
    exprs := array_append(exprs, 'pr.away_score_pred');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='home_prediction') then
    cols := array_append(cols, 'home_prediction');
    exprs := array_append(exprs, 'pr.home_score_pred');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='away_prediction') then
    cols := array_append(cols, 'away_prediction');
    exprs := array_append(exprs, 'pr.away_score_pred');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='points_total') then
    cols := array_append(cols, 'points_total');
    exprs := array_append(exprs, 's.points_total');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='is_exact_score') then
    cols := array_append(cols, 'is_exact_score');
    exprs := array_append(exprs, 's.is_exact_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='is_good_result') then
    cols := array_append(cols, 'is_good_result');
    exprs := array_append(exprs, 's.is_good_result');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='is_good_goal_diff') then
    cols := array_append(cols, 'is_good_goal_diff');
    exprs := array_append(exprs, 's.is_good_goal_diff');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='is_good_qualified') then
    cols := array_append(cols, 'is_good_qualified');
    exprs := array_append(exprs, 's.is_good_qualified');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='calculated_at') then
    cols := array_append(cols, 'calculated_at');
    exprs := array_append(exprs, 'now()');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='created_at') then
    cols := array_append(cols, 'created_at');
    exprs := array_append(exprs, 'now()');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='updated_at') then
    cols := array_append(cols, 'updated_at');
    exprs := array_append(exprs, 'now()');
  end if;


  if array_length(cols, 1) is null then
    raise exception 'Aucune colonne compatible trouvée dans prediction_points.';
  end if;

  insert_sql := format(
    'insert into public.prediction_points (%s)
     select %s
     from public.predictions pr
     cross join lateral public.score_prediction_for_match(
       pr.home_score_pred,
       pr.away_score_pred,
       pr.qualified_team_pred,
       $1,
       $2,
       $3
     ) s
     where pr.match_id = $4
       and pr.home_score_pred is not null
       and pr.away_score_pred is not null',
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
    select id
    from public.matches
    where status::text = 'finished'
      and home_score is not null
      and away_score is not null
  loop
    total_recalculated := total_recalculated + public.recalc_match_points(match_row.id);
  end loop;

  return total_recalculated;
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
    exception
      when undefined_function then
        if not public.is_admin() then
          raise exception 'Réservé à l’admin';
        end if;
    end;
  end if;

  recalculated := public.recalc_all_points();

  select count(*)::integer
  into missing_after
  from public.predictions pr
  join public.matches m on m.id = pr.match_id
  left join public.prediction_points pp
    on (
      (to_regclass('public.prediction_points') is not null)
      and (
        (pp.user_id = pr.user_id and pp.match_id = pr.match_id)
        or pp.prediction_id = pr.id
      )
    )
  where m.status::text = 'finished'
    and m.home_score is not null
    and m.away_score is not null
    and pp.match_id is null;

  return jsonb_build_object(
    'recalculated_prediction_points', recalculated,
    'missing_after', missing_after
  );
end;
$$;

-- IMPORTANT : on garde l'ordre historique des colonnes :
-- id, user_id, pseudo... puis prediction_id ajouté en fin de vue.
create or replace view public.v_visible_predictions as
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
  coalesce(
    pp.points_total,
    case
      when m.status::text in ('finished', 'live')
       and m.home_score is not null
       and m.away_score is not null
      then s.points_total
      else null
    end
  ) as points_total,
  coalesce(pp.is_exact_score, case when m.status::text in ('finished', 'live') and m.home_score is not null and m.away_score is not null then s.is_exact_score else false end) as is_exact_score,
  coalesce(pp.is_good_result, case when m.status::text in ('finished', 'live') and m.home_score is not null and m.away_score is not null then s.is_good_result else false end) as is_good_result,
  coalesce(pp.is_good_goal_diff, case when m.status::text in ('finished', 'live') and m.home_score is not null and m.away_score is not null then s.is_good_goal_diff else false end) as is_good_goal_diff,
  coalesce(pp.is_good_qualified, case when m.status::text in ('finished', 'live') then s.is_good_qualified else false end) as is_good_qualified,
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
where
  m.kickoff_at <= now()
  or m.status::text in ('live', 'finished');

grant select on public.v_visible_predictions to authenticated;
grant execute on function public.score_prediction_for_match(integer, integer, uuid, integer, integer, uuid) to authenticated;
grant execute on function public.recalc_match_points(uuid) to authenticated;
grant execute on function public.recalc_all_points() to authenticated;
grant execute on function public.admin_repair_missing_scores() to authenticated;

select public.admin_repair_missing_scores() as repair_result;

select
  'visible_predictions_finished_check_v1_8_8' as check_name,
  m.kickoff_at,
  m.home_score,
  m.away_score,
  vp.pseudo,
  vp.home_score_pred,
  vp.away_score_pred,
  vp.points_total
from public.v_visible_predictions vp
join public.matches m on m.id = vp.match_id
where m.status::text = 'finished'
order by m.kickoff_at desc, vp.pseudo
limit 30;
