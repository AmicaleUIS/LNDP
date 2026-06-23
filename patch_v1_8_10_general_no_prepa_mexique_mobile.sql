-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.10
-- Général/famille alignés + Mexico -> Mexique
-- ============================================================
-- À lancer dans Supabase SQL Editor.
-- Objectif :
-- 1) Le classement général exclut aussi les matchs de préparation/test.
-- 2) Tous les classements repartent de v_visible_predictions.
-- 3) Renommer l'équipe Mexico en Mexique sans toucher aux IDs, pronos ni scores.

-- Renommage sans toucher aux IDs.
update public.football_teams
set name = 'Mexique'
where name = 'Mexico';

-- Certaines installations peuvent avoir des noms dénormalisés dans matches.
do $do$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='matches' and column_name='home_team_name'
  ) then
    execute $sql$update public.matches set home_team_name = 'Mexique' where home_team_name = 'Mexico'$sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='matches' and column_name='away_team_name'
  ) then
    execute $sql$update public.matches set away_team_name = 'Mexique' where away_team_name = 'Mexico'$sql$;
  end if;
end $do$;

drop view if exists public.v_leaderboard_overall;
drop view if exists public.v_leaderboard_by_pool_round;

create view public.v_leaderboard_overall as
with base as (
  select
    p.id as user_id,
    p.pseudo,
    p.office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    ot.color as office_team_color,
    p.avatar_key,
    p.badge_shape,
    p.badge_color,
    p.featured_badge_ids,
    coalesce(sum(vp.points_total), 0)::int as total_points,
    coalesce(sum(case when vp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when vp.is_good_result then 1 else 0 end), 0)::int as good_results,
    coalesce(sum(case when vp.is_good_goal_diff then 1 else 0 end), 0)::int as good_goal_diffs,
    coalesce(sum(case when vp.is_good_qualified then 1 else 0 end), 0)::int as good_qualified,
    count(vp.id)::int as scored_matches
  from public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join public.v_visible_predictions vp on vp.user_id = p.id
  left join public.matches m on m.id = vp.match_id
  where p.is_active = true
    and coalesce(p.is_banned, false) = false
    and coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
    and (
      vp.id is null
      or (
        coalesce(m.is_test_match, false) = false
        and vp.points_total is not null
      )
    )
  group by
    p.id,
    p.pseudo,
    p.office_team_id,
    ot.name,
    ot.slug,
    ot.color,
    p.avatar_key,
    p.badge_shape,
    p.badge_color,
    p.featured_badge_ids
)
select
  rank() over (
    order by total_points desc, exact_scores desc, good_results desc, good_goal_diffs desc, lower(pseudo) asc
  )::int as rank,
  *
from base;

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

grant select on public.v_leaderboard_overall to authenticated;
grant select on public.v_leaderboard_by_pool_round to authenticated;

-- Diagnostic : comparer général SQL et pronos visibles hors préparation.
select
  'general_vs_visible_no_prepa_v1_8_10' as check_name,
  lo.pseudo,
  lo.scored_matches as general_count,
  count(vp.id) filter (where vp.points_total is not null and coalesce(m.is_test_match, false) = false) as visible_no_prepa_count
from public.v_leaderboard_overall lo
left join public.v_visible_predictions vp on vp.user_id = lo.user_id
left join public.matches m on m.id = vp.match_id
group by lo.user_id, lo.pseudo, lo.scored_matches
order by abs(lo.scored_matches - count(vp.id) filter (where vp.points_total is not null and coalesce(m.is_test_match, false) = false)) desc, lo.pseudo
limit 30;

select
  'mexique_rename_v1_8_10' as check_name,
  id,
  name,
  short_name
from public.football_teams
where name in ('Mexique', 'Mexico')
order by name;
