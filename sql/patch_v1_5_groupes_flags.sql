-- ============================================================
-- LE NID DES PRONOS — PATCH V1.5
-- Drapeaux images + classement des groupes
-- ============================================================

-- 1) Renseigne automatiquement flag_url à partir du country_code.
-- Les emojis restent en base, mais l'interface utilise maintenant flag_url/country_code.

update public.football_teams
set flag_url = case
  when short_name = 'ENG' then 'https://flagcdn.com/w80/gb-eng.png'
  when short_name = 'SCO' then 'https://flagcdn.com/w80/gb-sct.png'
  when short_name = 'WAL' then 'https://flagcdn.com/w80/gb-wls.png'
  when short_name = 'NIR' then 'https://flagcdn.com/w80/gb-nir.png'
  when country_code is not null and length(country_code) = 2 then 'https://flagcdn.com/w80/' || lower(country_code) || '.png'
  else null
end,
updated_at = now();

-- 2) Vue de classement des groupes.
-- Règle Coupe du Monde 2026 :
-- - 2 premiers de chaque groupe en zone qualifiée directe
-- - 8 meilleurs troisièmes en zone qualifiée potentielle
-- Le statut devient "qualified" / "eliminated" quand le groupe ou toute la phase de groupes est terminé.

create or replace view public.v_group_standings as
with group_teams as (
  select distinct competition_id, group_name, home_team_id as team_id
  from public.matches
  where stage = 'group'::public.match_stage
    and group_name is not null

  union

  select distinct competition_id, group_name, away_team_id as team_id
  from public.matches
  where stage = 'group'::public.match_stage
    and group_name is not null
),
played_rows as (
  select
    competition_id,
    group_name,
    id as match_id,
    home_team_id as team_id,
    home_score as goals_for,
    away_score as goals_against,
    case when home_score > away_score then 1 else 0 end as wins,
    case when home_score = away_score then 1 else 0 end as draws,
    case when home_score < away_score then 1 else 0 end as losses,
    case
      when home_score > away_score then 3
      when home_score = away_score then 1
      else 0
    end as points
  from public.matches
  where stage = 'group'::public.match_stage
    and status = 'finished'::public.match_status
    and home_score is not null
    and away_score is not null

  union all

  select
    competition_id,
    group_name,
    id as match_id,
    away_team_id as team_id,
    away_score as goals_for,
    home_score as goals_against,
    case when away_score > home_score then 1 else 0 end as wins,
    case when away_score = home_score then 1 else 0 end as draws,
    case when away_score < home_score then 1 else 0 end as losses,
    case
      when away_score > home_score then 3
      when away_score = home_score then 1
      else 0
    end as points
  from public.matches
  where stage = 'group'::public.match_stage
    and status = 'finished'::public.match_status
    and home_score is not null
    and away_score is not null
),
group_progress as (
  select
    competition_id,
    group_name,
    count(*)::int as total_group_matches,
    count(*) filter (where status = 'finished'::public.match_status)::int as finished_group_matches,
    (count(*) = count(*) filter (where status = 'finished'::public.match_status)) as group_finished
  from public.matches
  where stage = 'group'::public.match_stage
    and group_name is not null
  group by competition_id, group_name
),
global_progress as (
  select
    competition_id,
    (count(*) = count(*) filter (where status = 'finished'::public.match_status)) as all_groups_finished
  from public.matches
  where stage = 'group'::public.match_stage
  group by competition_id
),
stats as (
  select
    gt.competition_id,
    gt.group_name,
    gt.team_id,
    coalesce(count(pr.match_id), 0)::int as played,
    coalesce(sum(pr.wins), 0)::int as wins,
    coalesce(sum(pr.draws), 0)::int as draws,
    coalesce(sum(pr.losses), 0)::int as losses,
    coalesce(sum(pr.goals_for), 0)::int as goals_for,
    coalesce(sum(pr.goals_against), 0)::int as goals_against,
    (coalesce(sum(pr.goals_for), 0) - coalesce(sum(pr.goals_against), 0))::int as goal_difference,
    coalesce(sum(pr.points), 0)::int as points
  from group_teams gt
  left join played_rows pr
    on pr.competition_id = gt.competition_id
    and pr.group_name = gt.group_name
    and pr.team_id = gt.team_id
  group by gt.competition_id, gt.group_name, gt.team_id
),
ranked as (
  select
    row_number() over (
      partition by s.competition_id, s.group_name
      order by
        s.points desc,
        s.goal_difference desc,
        s.goals_for desc,
        s.wins desc,
        lower(ft.name) asc
    )::int as group_rank,
    s.*,
    ft.name as team_name,
    ft.short_name,
    ft.country_code,
    ft.flag_url,
    gp.total_group_matches,
    gp.finished_group_matches,
    gp.group_finished,
    glob.all_groups_finished
  from stats s
  join public.football_teams ft on ft.id = s.team_id
  join group_progress gp
    on gp.competition_id = s.competition_id
    and gp.group_name = s.group_name
  join global_progress glob
    on glob.competition_id = s.competition_id
),
thirds as (
  select
    r.competition_id,
    r.team_id,
    row_number() over (
      partition by r.competition_id
      order by
        r.points desc,
        r.goal_difference desc,
        r.goals_for desc,
        r.wins desc,
        lower(r.team_name) asc
    )::int as third_place_rank
  from ranked r
  where r.group_rank = 3
)
select
  r.competition_id,
  r.group_name,
  r.group_rank,
  r.team_id,
  r.team_name,
  r.short_name,
  r.country_code,
  r.flag_url,
  r.played,
  r.wins,
  r.draws,
  r.losses,
  r.goals_for,
  r.goals_against,
  r.goal_difference,
  r.points,
  r.total_group_matches,
  r.finished_group_matches,
  r.group_finished,
  r.all_groups_finished,
  t.third_place_rank,
  case
    when r.group_rank <= 2 and r.group_finished then 'qualified'
    when r.group_rank <= 2 then 'qualification_zone'
    when r.group_rank = 3 and t.third_place_rank <= 8 and r.all_groups_finished then 'qualified_best_third'
    when r.group_rank = 3 and t.third_place_rank <= 8 then 'best_third_zone'
    when r.group_finished then 'eliminated'
    else 'in_progress'
  end as qualification_status
from ranked r
left join thirds t
  on t.competition_id = r.competition_id
  and t.team_id = r.team_id;

grant select on public.v_group_standings to authenticated;

-- Vérification rapide :
select
  group_name,
  group_rank,
  team_name,
  points,
  goal_difference,
  qualification_status
from public.v_group_standings
order by group_name, group_rank;
