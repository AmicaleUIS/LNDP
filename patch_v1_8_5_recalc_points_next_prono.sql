-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.5
-- Recalcul points pronos + sécurité après saisie score
-- ============================================================
-- À lancer dans Supabase SQL Editor.
-- Corrige les pronos validés qui apparaissent à "- pts" parce que prediction_points
-- n'a pas été créé/recalculé après le résultat officiel.

create unique index if not exists prediction_points_unique_user_match
on public.prediction_points(user_id, match_id);

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
begin
  select *
  into m
  from public.matches
  where id = p_match_id;

  if m.id is null then
    return 0;
  end if;

  -- Si le match n'est pas terminé ou score incomplet : on retire les points calculés.
  if m.status::text <> 'finished'
     or m.home_score is null
     or m.away_score is null then
    delete from public.prediction_points
    where match_id = p_match_id;
    return 0;
  end if;

  delete from public.prediction_points
  where match_id = p_match_id;

  insert into public.prediction_points (
    user_id,
    match_id,
    points_total,
    is_exact_score,
    is_good_result,
    is_good_goal_diff,
    is_good_qualified
  )
  select
    pr.user_id,
    pr.match_id,
    s.points_total,
    s.is_exact_score,
    s.is_good_result,
    s.is_good_goal_diff,
    s.is_good_qualified
  from public.predictions pr
  cross join lateral public.score_prediction_for_match(
    pr.home_score_pred,
    pr.away_score_pred,
    pr.qualified_team_pred,
    m.home_score,
    m.away_score,
    m.winner_team_id
  ) s
  where pr.match_id = p_match_id
    and pr.home_score_pred is not null
    and pr.away_score_pred is not null;

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
  match_count integer := 0;
begin
  -- Appel depuis l'interface : admin obligatoire.
  -- Appel système/trigger/restauration : auth.uid() peut être null.
  if auth.uid() is not null then
    begin
      if not public.is_admin() then
        raise exception 'Accès refusé';
      end if;
    exception
      when undefined_function then
        null;
    end;
  end if;

  for match_row in
    select id
    from public.matches
    where status::text = 'finished'
      and home_score is not null
      and away_score is not null
  loop
    total_recalculated := total_recalculated + public.recalc_match_points(match_row.id);
    match_count := match_count + 1;
  end loop;

  begin
    perform public.admin_log_action(
      'recalc_all_points_v1_8_5',
      'score',
      jsonb_build_object('matches', match_count, 'prediction_points', total_recalculated)
    );
  exception
    when undefined_function then null;
  end;

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
  -- Quand un score/statut change, on recalcule ce match.
  perform public.recalc_match_points(new.id);
  return new;
end;
$$;

drop trigger if exists recalc_match_points_after_result on public.matches;

create trigger recalc_match_points_after_result
after insert or update of status, home_score, away_score, winner_team_id
on public.matches
for each row
execute function public.recalc_match_points_after_result();

grant execute on function public.score_prediction_for_match(integer, integer, uuid, integer, integer, uuid) to authenticated;
grant execute on function public.recalc_match_points(uuid) to authenticated;
grant execute on function public.recalc_all_points() to authenticated;

-- Rattrapage immédiat des pronos déjà validés mais non recalculés.
select public.recalc_all_points() as recalculated_prediction_points;

-- Vérification : doit idéalement retourner 0 ligne.
-- Si des lignes restent, ce sont des pronos sur matchs terminés sans score complet ou anomalie de données.
select
  pr.user_id,
  pr.match_id,
  m.home_score,
  m.away_score,
  m.status
from public.predictions pr
join public.matches m on m.id = pr.match_id
left join public.prediction_points pp
  on pp.user_id = pr.user_id
 and pp.match_id = pr.match_id
where m.status::text = 'finished'
  and m.home_score is not null
  and m.away_score is not null
  and pp.match_id is null
order by m.kickoff_at, pr.user_id
limit 50;
