-- ============================================================
-- LE NID DES PRONOS — PATCH V1.1
-- Correction vue classement par journée
-- ============================================================
-- À lancer dans Supabase SQL Editor si tu as déjà lancé le schema V1.
-- Cette correction évite que les points de toutes les journées soient additionnés
-- dans chaque journée.

create or replace view public.v_leaderboard_by_match_day as
with days as (
  select distinct match_day
  from public.matches
  where match_day is not null
    and status = 'finished'::public.match_status
),
base as (
  select
    d.match_day,
    p.id as user_id,
    p.pseudo,
    p.office_team_id,
    ot.name as office_team_name,
    coalesce(sum(pp.points_total), 0)::int as total_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end), 0)::int as good_results,
    coalesce(sum(case when pp.is_good_goal_diff then 1 else 0 end), 0)::int as good_goal_diffs
  from days d
  cross join public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join public.matches m
    on m.match_day = d.match_day
    and m.status = 'finished'::public.match_status
  left join public.prediction_points pp
    on pp.user_id = p.id
    and pp.match_id = m.id
  where p.is_active = true
  group by d.match_day, p.id, p.pseudo, p.office_team_id, ot.name
)
select
  rank() over (
    partition by match_day
    order by
      total_points desc,
      exact_scores desc,
      good_results desc,
      good_goal_diffs desc,
      lower(pseudo) asc
  )::int as rank,
  *
from base;

grant select on public.v_leaderboard_by_match_day to authenticated;
