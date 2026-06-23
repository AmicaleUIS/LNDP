-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.6b
-- Recalcul points dynamique + fix array_append
-- ============================================================
-- À lancer dans Supabase SQL Editor.
-- Objectif : recalculer prediction_points sans supposer exactement
-- quelles colonnes existent dans la table.

drop trigger if exists recalc_match_points_after_result on public.matches;

drop function if exists public.recalc_match_points(uuid);
drop function if exists public.recalc_all_points();
drop function if exists public.recalc_match_points_after_result();
drop function if exists public.score_prediction_for_match(integer, integer, uuid, integer, integer, uuid);

create unique index if not exists prediction_points_unique_user_match
on public.prediction_points(user_id, match_id);

create unique index if not exists prediction_points_unique_prediction_id
on public.prediction_points(prediction_id);

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
    exact as is_exact_score,
    good_result as is_good_result,
    good_diff as is_good_goal_diff,
    good_qualified as is_good_qualified
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
  -- V1.8.6b : on utilise array_append, pas cols || 'valeur',
  -- car PostgreSQL attendrait sinon un littéral de tableau.
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

  -- Colonnes obligatoires connues.
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

  -- Colonnes de score réelles possibles selon les anciennes versions.
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='home_score') then
    cols := array_append(cols, 'home_score');
    exprs := array_append(exprs, 'm.home_score');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='away_score') then
    cols := array_append(cols, 'away_score');
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

grant execute on function public.score_prediction_for_match(integer, integer, uuid, integer, integer, uuid) to authenticated;
grant execute on function public.recalc_match_points(uuid) to authenticated;
grant execute on function public.recalc_all_points() to authenticated;

select public.recalc_all_points() as recalculated_prediction_points;

-- Diagnostic : s'il reste des lignes ici, elles n'ont toujours pas de point en base.
select
  pr.id as prediction_id,
  pr.user_id,
  pr.match_id,
  pr.home_score_pred,
  pr.away_score_pred,
  m.home_score,
  m.away_score,
  m.status,
  pp.points_total
from public.predictions pr
join public.matches m on m.id = pr.match_id
left join public.prediction_points pp
  on pp.prediction_id = pr.id
where m.status::text = 'finished'
  and m.home_score is not null
  and m.away_score is not null
  and pp.prediction_id is null
order by m.kickoff_at, pr.user_id
limit 50;

select
  'prediction_points_columns_v1_8_6' as check_name,
  column_name,
  is_nullable,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'prediction_points'
order by ordinal_position;
