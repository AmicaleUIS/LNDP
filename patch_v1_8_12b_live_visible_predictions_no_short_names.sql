-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.12b
-- Live : pronos visibles manquants — diagnostic compatible
-- ============================================================
-- À lancer dans Supabase SQL Editor.
-- Objectif : si un prono existe sur un match live, il doit apparaître dans le live,
-- même si v_visible_predictions ou prediction_points ne l'avait pas remonté.

drop view if exists public.v_live_visible_predictions;

create view public.v_live_visible_predictions as
select
  pr.id,
  pr.user_id,
  prof.pseudo,
  prof.office_team_id,
  ot.name as office_team_name,
  ot.slug as office_team_slug,
  ot.color as office_team_color,
  prof.avatar_key,
  prof.badge_shape,
  prof.badge_color,
  pr.match_id,
  pr.home_score_pred,
  pr.away_score_pred,
  pr.qualified_team_pred,
  qt.name as qualified_team_name,
  case
    when m.status::text = 'live'
     and m.home_score is not null
     and m.away_score is not null
    then (
      case
        when pr.home_score_pred = m.home_score and pr.away_score_pred = m.away_score then 5
        when (
          case when pr.home_score_pred > pr.away_score_pred then 'home'
               when pr.away_score_pred > pr.home_score_pred then 'away'
               else 'draw' end
          =
          case when m.home_score > m.away_score then 'home'
               when m.away_score > m.home_score then 'away'
               else 'draw' end
        ) then 3
        else 0
      end
      + case
          when not (pr.home_score_pred = m.home_score and pr.away_score_pred = m.away_score)
           and (pr.home_score_pred - pr.away_score_pred) = (m.home_score - m.away_score)
          then 1 else 0
        end
      + case
          when pr.qualified_team_pred is not null
           and m.winner_team_id is not null
           and pr.qualified_team_pred = m.winner_team_id
          then 2 else 0
        end
    )::int
    else null
  end as points_total,
  case
    when m.status::text = 'live'
     and m.home_score is not null
     and m.away_score is not null
    then (pr.home_score_pred = m.home_score and pr.away_score_pred = m.away_score)
    else false
  end as is_exact_score,
  case
    when m.status::text = 'live'
     and m.home_score is not null
     and m.away_score is not null
    then (
      case when pr.home_score_pred > pr.away_score_pred then 'home'
           when pr.away_score_pred > pr.home_score_pred then 'away'
           else 'draw' end
      =
      case when m.home_score > m.away_score then 'home'
           when m.away_score > m.home_score then 'away'
           else 'draw' end
    )
    else false
  end as is_good_result,
  case
    when m.status::text = 'live'
     and m.home_score is not null
     and m.away_score is not null
    then ((pr.home_score_pred - pr.away_score_pred) = (m.home_score - m.away_score))
    else false
  end as is_good_goal_diff,
  case
    when m.status::text = 'live'
    then (
      pr.qualified_team_pred is not null
      and m.winner_team_id is not null
      and pr.qualified_team_pred = m.winner_team_id
    )
    else false
  end as is_good_qualified,
  pr.locked_at,
  pr.created_at,
  pr.updated_at,
  pr.id as prediction_id
from public.predictions pr
join public.matches m on m.id = pr.match_id
left join public.profiles prof on prof.id = pr.user_id
left join public.office_teams ot on ot.id = prof.office_team_id
left join public.football_teams qt on qt.id = pr.qualified_team_pred
where m.status::text = 'live'
  and coalesce(m.is_test_match, false) = false
  and pr.home_score_pred is not null
  and pr.away_score_pred is not null;

grant select on public.v_live_visible_predictions to authenticated;

-- Diagnostic : Portugal - Ouzbékistan ou autre live doit lister tous les pronos.
select
  'live_predictions_check_v1_8_12b' as check_name,
  v.match_id,
  m.status,
  m.home_score,
  m.away_score,
  v.pseudo,
  v.home_score_pred,
  v.away_score_pred,
  v.points_total
from public.v_live_visible_predictions v
join public.matches m on m.id = v.match_id
order by m.kickoff_at desc, v.pseudo
limit 50;
