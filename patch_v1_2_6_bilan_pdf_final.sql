-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.0
-- Bilan PDF final : rapport joueur temps réel pour super admin
-- À lancer après patch_v1_2_5_sante_journal_admin.sql.
-- ============================================================

create or replace function public.admin_get_final_player_report(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_json jsonb;
  leaderboard_json jsonb;
  team_json jsonb;
  family_rank_json jsonb;
  family_team_json jsonb;
  champion_json jsonb;
  predictions_json jsonb;
  generated_at timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'pseudo', p.pseudo,
    'role', p.role,
    'player_scope', p.player_scope,
    'show_family_players', p.show_family_players,
    'office_team_id', p.office_team_id,
    'office_team_name', ot.name,
    'office_team_slug', ot.slug,
    'office_team_color', ot.color,
    'avatar_key', p.avatar_key,
    'badge_shape', p.badge_shape,
    'badge_color', p.badge_color,
    'featured_badge_ids', p.featured_badge_ids,
    'created_at', p.created_at
  )
  into profile_json
  from public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  where p.id = p_user_id;

  if profile_json is null then
    raise exception 'Joueur introuvable';
  end if;

  select to_jsonb(lb)
  into leaderboard_json
  from public.v_leaderboard_overall lb
  where lb.user_id = p_user_id;

  select to_jsonb(tt)
  into team_json
  from public.profiles p
  join public.v_team_leaderboard_total tt on tt.office_team_id = p.office_team_id
  where p.id = p_user_id;

  with participants as (
    select p.id, p.pseudo, p.office_team_id, ot.name as office_team_name
    from public.profiles p
    left join public.office_teams ot on ot.id = p.office_team_id
    where p.is_active = true
      and coalesce(p.is_banned, false) = false
      and (coalesce(p.player_scope, 'uis') = 'family' or p.role = 'family' or p.show_family_players = true)
  ), points as (
    select
      part.id as user_id,
      part.pseudo,
      part.office_team_id,
      part.office_team_name,
      coalesce(sum(pp.points_total) filter (where m.status = 'finished' and coalesce(m.is_test_match, false) = false), 0)::int as total_points,
      coalesce(sum(case when pp.is_exact_score then 1 else 0 end) filter (where m.status = 'finished' and coalesce(m.is_test_match, false) = false), 0)::int as exact_scores,
      coalesce(sum(case when pp.is_good_result then 1 else 0 end) filter (where m.status = 'finished' and coalesce(m.is_test_match, false) = false), 0)::int as good_results,
      count(pp.id) filter (where m.status = 'finished' and coalesce(m.is_test_match, false) = false)::int as scored_matches
    from participants part
    left join public.prediction_points pp on pp.user_id = part.id
    left join public.matches m on m.id = pp.match_id
    group by part.id, part.pseudo, part.office_team_id, part.office_team_name
  ), ranked as (
    select
      rank() over (order by total_points desc, exact_scores desc, good_results desc, lower(pseudo) asc)::int as rank,
      *
    from points
  )
  select to_jsonb(ranked)
  into family_rank_json
  from ranked
  where user_id = p_user_id;

  with participants as (
    select p.id, p.office_team_id, ot.name as office_team_name, ot.color as office_team_color
    from public.profiles p
    left join public.office_teams ot on ot.id = p.office_team_id
    where p.is_active = true
      and coalesce(p.is_banned, false) = false
      and p.office_team_id is not null
      and (coalesce(p.player_scope, 'uis') = 'family' or p.role = 'family' or p.show_family_players = true)
  ), player_points as (
    select
      part.office_team_id,
      part.office_team_name,
      part.office_team_color,
      part.id as user_id,
      coalesce(sum(pp.points_total) filter (where m.status = 'finished' and coalesce(m.is_test_match, false) = false), 0)::int as total_points,
      coalesce(sum(case when pp.is_exact_score then 1 else 0 end) filter (where m.status = 'finished' and coalesce(m.is_test_match, false) = false), 0)::int as exact_scores,
      coalesce(sum(case when pp.is_good_result then 1 else 0 end) filter (where m.status = 'finished' and coalesce(m.is_test_match, false) = false), 0)::int as good_results
    from participants part
    left join public.prediction_points pp on pp.user_id = part.id
    left join public.matches m on m.id = pp.match_id
    group by part.office_team_id, part.office_team_name, part.office_team_color, part.id
  ), teams as (
    select
      office_team_id,
      office_team_name,
      office_team_color,
      count(user_id)::int as active_players,
      sum(total_points)::int as total_points,
      sum(exact_scores)::int as exact_scores,
      sum(good_results)::int as good_results,
      round((sum(total_points)::numeric / greatest(count(user_id), 1)), 2) as average_points
    from player_points
    group by office_team_id, office_team_name, office_team_color
  ), ranked as (
    select
      rank() over (order by average_points desc, total_points desc, exact_scores desc, lower(office_team_name) asc)::int as rank,
      *
    from teams
  )
  select to_jsonb(ranked)
  into family_team_json
  from ranked
  join public.profiles p on p.office_team_id = ranked.office_team_id
  where p.id = p_user_id;

  with active_competition as (
    select id from public.competitions where is_active = true order by id desc limit 1
  ), final_winner as (
    select distinct on (m.competition_id)
      m.competition_id,
      m.winner_team_id as actual_winner_team_id
    from public.matches m
    where m.stage = 'final'::public.match_stage
      and m.status = 'finished'::public.match_status
      and m.winner_team_id is not null
    order by m.competition_id, m.kickoff_at desc
  )
  select jsonb_build_object(
    'user_id', wp.user_id,
    'competition_id', wp.competition_id,
    'predicted_team_id', wp.predicted_team_id,
    'predicted_team_name', ft.name,
    'predicted_team_short_name', ft.short_name,
    'predicted_team_country_code', ft.country_code,
    'predicted_team_flag_url', ft.flag_url,
    'actual_winner_team_id', fw.actual_winner_team_id,
    'actual_winner_team_name', actual.name,
    'points_total', case when fw.actual_winner_team_id is not null and fw.actual_winner_team_id = wp.predicted_team_id then 100 else 0 end,
    'created_at', wp.created_at,
    'updated_at', wp.updated_at
  )
  into champion_json
  from public.winner_predictions wp
  join public.football_teams ft on ft.id = wp.predicted_team_id
  left join final_winner fw on fw.competition_id = wp.competition_id
  left join public.football_teams actual on actual.id = fw.actual_winner_team_id
  where wp.user_id = p_user_id
    and (wp.competition_id = (select id from active_competition) or not exists (select 1 from active_competition))
  order by wp.updated_at desc nulls last, wp.created_at desc nulls last
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'prediction_id', pr.id,
    'user_id', pr.user_id,
    'match_id', pr.match_id,
    'competition_id', m.competition_id,
    'kickoff_at', m.kickoff_at,
    'match_day', m.match_day,
    'stage', m.stage,
    'group_name', m.group_name,
    'pool_round', m.pool_round,
    'status', m.status,
    'is_test_match', coalesce(m.is_test_match, false),
    'home_team_id', m.home_team_id,
    'home_team_name', m.home_team_name,
    'home_team_short_name', m.home_team_short_name,
    'home_team_country_code', m.home_team_country_code,
    'home_team_flag_url', m.home_team_flag_url,
    'away_team_id', m.away_team_id,
    'away_team_name', m.away_team_name,
    'away_team_short_name', m.away_team_short_name,
    'away_team_country_code', m.away_team_country_code,
    'away_team_flag_url', m.away_team_flag_url,
    'home_score', m.home_score,
    'away_score', m.away_score,
    'winner_team_id', m.winner_team_id,
    'home_score_pred', pr.home_score_pred,
    'away_score_pred', pr.away_score_pred,
    'qualified_team_pred', pr.qualified_team_pred,
    'qualified_team_name', qft.name,
    'points_total', pp.points_total,
    'is_exact_score', coalesce(pp.is_exact_score, false),
    'is_good_result', coalesce(pp.is_good_result, false),
    'is_good_goal_diff', coalesce(pp.is_good_goal_diff, false),
    'is_good_qualified', coalesce(pp.is_good_qualified, false),
    'prediction_created_at', pr.created_at,
    'prediction_updated_at', pr.updated_at
  ) order by m.kickoff_at asc), '[]'::jsonb)
  into predictions_json
  from public.predictions pr
  join public.v_matches m on m.id = pr.match_id
  left join public.prediction_points pp on pp.user_id = pr.user_id and pp.match_id = pr.match_id
  left join public.football_teams qft on qft.id = pr.qualified_team_pred
  where pr.user_id = p_user_id;

  if to_regprocedure('public.admin_log_action(text,text,jsonb,jsonb)') is not null then
    perform public.admin_log_action('view_final_player_report', 'system', jsonb_build_object('user_id', p_user_id));
  end if;

  return jsonb_build_object(
    'generated_at', generated_at,
    'profile', profile_json,
    'leaderboard', coalesce(leaderboard_json, '{}'::jsonb),
    'team_leaderboard', coalesce(team_json, '{}'::jsonb),
    'family_rank', coalesce(family_rank_json, '{}'::jsonb),
    'family_team_rank', coalesce(family_team_json, '{}'::jsonb),
    'champion_prediction', champion_json,
    'predictions', coalesce(predictions_json, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.admin_get_final_player_report(uuid) to authenticated;

insert into public.app_settings (key, value, updated_at)
values (
  'changelog_1_2_6',
  '{"version":"1.3.0","title":"Bilan PDF final","changes":["Aperçu super admin du carnet de vol joueur en temps réel","Page imprimable en PDF avec couverture, stats, badges, records, graphiques, pronos et diplôme","Emplacements prévus pour les images de fond de la surprise finale"]}'::jsonb,
  now()
)
on conflict (key) do update set value = excluded.value, updated_at = now();
