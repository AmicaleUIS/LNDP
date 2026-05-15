-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8
-- Journées de poule + classement par journée de poule
-- ============================================================

-- Objectif :
-- - ne plus regrouper les matchs de poule par date simple ;
-- - créer une vraie notion de "Journée de poule 1 / 2 / 3" ;
-- - calculer un classement joueurs pour chaque journée de poule ;
-- - garder les phases finales séparées.

-- 1) Colonne pool_round sur les matchs.
-- Pour les matchs de groupe : 1, 2 ou 3.
-- Pour les phases finales : null.

alter table public.matches
add column if not exists pool_round integer;

-- 2) Fonction de recalcul automatique des journées de poule.
-- Hypothèse Coupe du Monde / groupes de 4 équipes :
-- chaque groupe joue 6 matchs :
-- - matchs 1 et 2 du groupe = journée de poule 1
-- - matchs 3 et 4 du groupe = journée de poule 2
-- - matchs 5 et 6 du groupe = journée de poule 3
-- Le classement se fait par ordre kickoff_at dans chaque groupe.

create or replace function public.recompute_pool_rounds()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ranked_group_matches as (
    select
      id,
      ceil(row_number() over (
        partition by competition_id, group_name
        order by kickoff_at asc, id asc
      )::numeric / 2)::int as computed_pool_round
    from public.matches
    where stage = 'group'::public.match_stage
      and group_name is not null
  )
  update public.matches m
  set
    pool_round = rgm.computed_pool_round,
    updated_at = now()
  from ranked_group_matches rgm
  where m.id = rgm.id;

  update public.matches
  set pool_round = null,
      updated_at = now()
  where stage <> 'group'::public.match_stage
    and pool_round is not null;
end;
$$;

select public.recompute_pool_rounds();

grant execute on function public.recompute_pool_rounds() to authenticated;

-- 3) Vue des matchs enrichie avec pool_round.
-- Elle remplace v_matches pour exposer la nouvelle colonne au front.

create or replace view public.v_matches as
select
  m.id,
  m.competition_id,
  c.name as competition_name,
  c.slug as competition_slug,
  m.api_match_id,
  m.kickoff_at,
  m.match_day,
  m.pool_round,
  m.venue,
  m.city,
  m.stage,
  m.group_name,
  m.status,
  m.home_score,
  m.away_score,
  m.winner_team_id,
  m.tv_channel,
  m.tv_channel_source,
  m.last_api_sync_at,

  ht.id as home_team_id,
  ht.name as home_team_name,
  ht.short_name as home_team_short_name,
  ht.country_code as home_team_country_code,
  ht.flag_emoji as home_team_flag_emoji,
  ht.flag_url as home_team_flag_url,

  at.id as away_team_id,
  at.name as away_team_name,
  at.short_name as away_team_short_name,
  at.country_code as away_team_country_code,
  at.flag_emoji as away_team_flag_emoji,
  at.flag_url as away_team_flag_url
from public.matches m
join public.competitions c on c.id = m.competition_id
join public.football_teams ht on ht.id = m.home_team_id
join public.football_teams at on at.id = m.away_team_id;

grant select on public.v_matches to authenticated;

-- 4) Classement par journée de poule.
-- Les joueurs inactifs sont exclus.
-- Les matchs pris en compte sont uniquement les matchs de groupe.

create or replace view public.v_leaderboard_by_pool_round as
with rounds as (
  select distinct competition_id, pool_round
  from public.matches
  where stage = 'group'::public.match_stage
    and pool_round is not null
),
round_progress as (
  select
    competition_id,
    pool_round,
    count(*)::int as total_round_matches,
    count(*) filter (where status = 'finished'::public.match_status)::int as finished_round_matches
  from public.matches
  where stage = 'group'::public.match_stage
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
    coalesce(sum(pp.points_total), 0)::int as total_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end), 0)::int as good_results,
    coalesce(sum(case when pp.is_good_goal_diff then 1 else 0 end), 0)::int as good_goal_diffs,
    coalesce(sum(case when pp.is_good_qualified then 1 else 0 end), 0)::int as good_qualified,
    count(pp.id)::int as scored_matches
  from rounds r
  join round_progress rp
    on rp.competition_id = r.competition_id
    and rp.pool_round = r.pool_round
  cross join public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join public.matches m
    on m.competition_id = r.competition_id
    and m.pool_round = r.pool_round
    and m.stage = 'group'::public.match_stage
  left join public.prediction_points pp
    on pp.user_id = p.id
    and pp.match_id = m.id
  where p.is_active = true
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
    order by
      total_points desc,
      exact_scores desc,
      good_results desc,
      good_goal_diffs desc,
      lower(pseudo) asc
  )::int as rank,
  *
from base;

grant select on public.v_leaderboard_by_pool_round to authenticated;

-- 5) Vérification rapide.

select
  'pool_rounds' as check_name,
  pool_round,
  count(*) as matches_count,
  min(kickoff_at) as first_match,
  max(kickoff_at) as last_match
from public.matches
where stage = 'group'::public.match_stage
group by pool_round
order by pool_round;

select
  'leaderboard_pool_round' as check_name,
  pool_round,
  rank,
  pseudo,
  total_points
from public.v_leaderboard_by_pool_round
order by pool_round, rank
limit 30;
