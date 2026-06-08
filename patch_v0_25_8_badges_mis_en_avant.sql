-- ============================================================
-- LE NID DES PRONOS — PATCH V0.25.8
-- Choix joueur des 3 badges d'exploit affichés dans les classements
-- ============================================================

-- 1) Chaque joueur peut stocker jusqu'à 3 identifiants de badges à mettre en avant.
alter table public.profiles
  add column if not exists featured_badge_ids text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_featured_badge_ids_max_3'
  ) then
    alter table public.profiles
      add constraint profiles_featured_badge_ids_max_3
      check (featured_badge_ids is null or cardinality(featured_badge_ids) <= 3);
  end if;
end $$;

-- 2) Vue publique profils : on expose uniquement les ids des badges mis en avant,
-- sans donnée sensible supplémentaire.
create or replace view public.v_public_profiles as
select
  p.id,
  p.pseudo,
  p.office_team_id,
  ot.name as office_team_name,
  ot.slug as office_team_slug,
  ot.color as office_team_color,
  ot.avatar_url as office_team_avatar_url,
  p.is_active,
  p.created_at,
  p.avatar_key,
  p.badge_shape,
  p.badge_color,
  p.profile_setup_done,
  p.featured_badge_ids
from public.profiles p
left join public.office_teams ot on ot.id = p.office_team_id;

grant select on public.v_public_profiles to authenticated;

-- 3) Classement général : on ajoute les badges mis en avant en fin de vue.
create or replace view public.v_leaderboard_overall as
with match_points as (
  select
    p.id as user_id,
    coalesce(sum(pp.points_total), 0)::int as match_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end), 0)::int as good_results,
    coalesce(sum(case when pp.is_good_goal_diff then 1 else 0 end), 0)::int as good_goal_diffs,
    coalesce(sum(case when pp.is_good_qualified then 1 else 0 end), 0)::int as good_qualified,
    count(pp.id)::int as scored_matches
  from public.profiles p
  left join public.prediction_points pp on pp.user_id = p.id
  where p.is_active = true
  group by p.id
),
winner_points as (
  select
    user_id,
    coalesce(sum(points_total), 0)::int as winner_points,
    (array_agg(predicted_team_id) filter (where points_total = 100))[1] as winner_team_id,
    max(predicted_team_name) filter (where points_total = 100) as winner_team_name
  from public.v_winner_predictions
  group by user_id
),
base as (
  select
    p.id as user_id,
    p.pseudo,
    p.office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    (coalesce(mp.match_points, 0) + coalesce(wp.winner_points, 0))::int as total_points,
    coalesce(mp.exact_scores, 0)::int as exact_scores,
    coalesce(mp.good_results, 0)::int as good_results,
    coalesce(mp.good_goal_diffs, 0)::int as good_goal_diffs,
    coalesce(mp.good_qualified, 0)::int as good_qualified,
    coalesce(mp.scored_matches, 0)::int as scored_matches,
    coalesce(mp.match_points, 0)::int as match_points,
    coalesce(wp.winner_points, 0)::int as winner_points,
    wp.winner_team_id,
    wp.winner_team_name,
    p.avatar_key,
    p.badge_shape,
    p.badge_color,
    p.featured_badge_ids
  from public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join match_points mp on mp.user_id = p.id
  left join winner_points wp on wp.user_id = p.id
  where p.is_active = true
)
select
  rank() over (
    order by
      total_points desc,
      exact_scores desc,
      good_results desc,
      good_goal_diffs desc,
      lower(pseudo) asc
  )::int as rank,
  *
from base;

grant select on public.v_leaderboard_overall to authenticated;

-- 4) Mémo version.
insert into public.app_settings (key, value)
values
  ('changelog_0_25_8', '{
    "version": "0.25.8",
    "title": "Badges mis en avant",
    "changes": [
      "Ajout du choix joueur des 3 badges affichés dans les classements",
      "Ajout de la colonne profiles.featured_badge_ids",
      "Exposition des badges choisis dans v_public_profiles et v_leaderboard_overall"
    ]
  }'::jsonb)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

-- 5) Vérification rapide.
select
  'featured_badges_ready' as check_name,
  count(*) as profiles_count,
  count(*) filter (where featured_badge_ids is not null and cardinality(featured_badge_ids) > 0) as profiles_with_featured_badges
from public.profiles;
