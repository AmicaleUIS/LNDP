-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.9b
-- Exclure les matchs de préparation/test des classements officiels
-- ============================================================
-- À lancer dans Supabase SQL Editor.
-- Objectif : les matchs de préparation/test restent visibles là où prévu,
-- mais ne polluent plus général / phase / teams / famille.

drop view if exists public.v_leaderboard_by_pool_round;

create view public.v_leaderboard_by_pool_round as
with rounds as (
  select distinct competition_id, pool_round
  from public.matches
  where stage::text = 'group'
    and pool_round is not null
    and coalesce(is_test_match, false) = false
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
    and coalesce(is_test_match, false) = false
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
  join round_progress rp
    on rp.competition_id = r.competition_id
   and rp.pool_round = r.pool_round
  cross join public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join public.matches m
    on m.competition_id = r.competition_id
   and m.pool_round = r.pool_round
   and m.stage::text = 'group'
   and coalesce(m.is_test_match, false) = false
  left join public.v_visible_predictions vp
    on vp.user_id = p.id
   and vp.match_id = m.id
   and vp.points_total is not null
  where p.is_active = true
    and coalesce(p.is_banned, false) = false
    and coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
  group by
    r.competition_id,
    r.pool_round,
    rp.total_round_matches,
    rp.finished_round_matches,
    p.id,
    p.pseudo,
    p.office_team_id,
    ot.name,
    ot.slug
)
select
  rank() over (
    partition by competition_id, pool_round
    order by total_points desc, exact_scores desc, good_results desc, good_goal_diffs desc, lower(pseudo) asc
  )::int as rank,
  *
from base;

grant select on public.v_leaderboard_by_pool_round to authenticated;

-- Diagnostic rapide : les matchs test/préparation ne doivent plus être source de points phase.
select
  'phase_no_test_matches_v1_8_9b' as check_name,
  count(*) as test_group_matches_still_existing
from public.matches
where coalesce(is_test_match, false) = true
  and stage::text = 'group'
  and pool_round is not null;
