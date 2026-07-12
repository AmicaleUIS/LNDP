-- ============================================================
-- LE NID DES PRONOS — PATCH V1.9.15
-- Grande finale : points du match multipliés par 2
-- ============================================================
-- À lancer une seule fois dans Supabase SQL Editor après le déploiement.
-- La petite finale (stage = third_place / M103) conserve le barème normal.
-- Seule la grande finale (stage = final / M104) est doublée.

begin;

create or replace function public.recalc_match_points(p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  inserted_count integer := 0;
  points_multiplier integer := 1;
  cols text[] := array[]::text[];
  exprs text[] := array[]::text[];
  insert_sql text;
begin
  select * into m
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

  -- Grande finale uniquement. La petite finale reste à x1.
  points_multiplier := case when m.stage::text = 'final' then 2 else 1 end;

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
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='prediction_points' and column_name='points_total') then
    cols := array_append(cols, 'points_total');
    exprs := array_append(exprs, '(s.points_total * $5)::integer');
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

  execute insert_sql using
    m.home_score,
    m.away_score,
    m.winner_team_id,
    p_match_id,
    points_multiplier;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Recalcule immédiatement les matchs déjà terminés, notamment la finale si elle l'est déjà.
select public.recalc_all_points();

commit;

-- Vérification facultative : M104 doit afficher des valeurs paires et M103 le barème normal.
select
  m.id as match_id,
  m.stage,
  m.status,
  count(pp.match_id)::integer as pronostics_comptes,
  min(pp.points_total)::integer as points_min,
  max(pp.points_total)::integer as points_max
from public.matches m
left join public.prediction_points pp on pp.match_id = m.id
where m.stage::text in ('final', 'third_place')
group by m.id, m.stage, m.status
order by case when m.stage::text = 'third_place' then 1 else 2 end;
