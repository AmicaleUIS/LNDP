-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.7
-- v_visible_predictions robuste : détail classement complet
-- ============================================================
-- À lancer dans Supabase SQL Editor.
-- Corrige les matchs visibles dans "Matchs joués" mais absents du détail
-- dans "Classements", quand prediction_points manque ou est incomplet.

create or replace view public.v_visible_predictions as
select
  pr.id,
  pr.id as prediction_id,
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
  coalesce(
    pp.points_total,
    case
      when m.status::text in ('finished', 'live')
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
    end
  ) as points_total,
  coalesce(
    pp.is_exact_score,
    case
      when m.status::text in ('finished', 'live')
       and m.home_score is not null
       and m.away_score is not null
      then (pr.home_score_pred = m.home_score and pr.away_score_pred = m.away_score)
      else false
    end
  ) as is_exact_score,
  coalesce(
    pp.is_good_result,
    case
      when m.status::text in ('finished', 'live')
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
    end
  ) as is_good_result,
  coalesce(
    pp.is_good_goal_diff,
    case
      when m.status::text in ('finished', 'live')
       and m.home_score is not null
       and m.away_score is not null
      then ((pr.home_score_pred - pr.away_score_pred) = (m.home_score - m.away_score))
      else false
    end
  ) as is_good_goal_diff,
  coalesce(
    pp.is_good_qualified,
    case
      when m.status::text in ('finished', 'live')
      then (
        pr.qualified_team_pred is not null
        and m.winner_team_id is not null
        and pr.qualified_team_pred = m.winner_team_id
      )
      else false
    end
  ) as is_good_qualified,
  pr.locked_at,
  pr.created_at,
  pr.updated_at
from public.predictions pr
join public.matches m on m.id = pr.match_id
left join public.prediction_points pp
  on pp.prediction_id = pr.id
  or (pp.user_id = pr.user_id and pp.match_id = pr.match_id)
left join public.profiles prof on prof.id = pr.user_id
left join public.office_teams ot on ot.id = prof.office_team_id
left join public.football_teams qt on qt.id = pr.qualified_team_pred
where
  -- Les pronos deviennent visibles après coup d'envoi, ou si le match est live/terminé.
  (
    m.kickoff_at <= now()
    or m.status::text in ('live', 'finished')
  );

grant select on public.v_visible_predictions to authenticated;

-- Vérification : France/Irak ou tout match terminé doit apparaître avec points_total.
select
  'visible_predictions_finished_check_v1_8_7' as check_name,
  m.kickoff_at,
  m.home_score,
  m.away_score,
  vp.pseudo,
  vp.home_score_pred,
  vp.away_score_pred,
  vp.points_total
from public.v_visible_predictions vp
join public.matches m on m.id = vp.match_id
where m.status::text = 'finished'
order by m.kickoff_at desc, vp.pseudo
limit 30;
