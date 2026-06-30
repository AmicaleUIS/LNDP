-- V1.9.11 — Phase finale : qualifié cohérent avec le score + recalcul points
-- À lancer une fois dans Supabase SQL Editor.

-- 1) Si le score réel n'est pas nul, le qualifié réel doit suivre le score.
update public.matches
set winner_team_id = case
  when home_score > away_score then home_team_id
  when away_score > home_score then away_team_id
  else winner_team_id
end
where stage::text <> 'group'
  and status::text in ('live', 'finished')
  and home_score is not null
  and away_score is not null
  and home_score <> away_score
  and winner_team_id is distinct from case
    when home_score > away_score then home_team_id
    when away_score > home_score then away_team_id
    else winner_team_id
  end;

-- 2) Si un joueur a pronostiqué un vainqueur au score, son qualifié doit être ce vainqueur.
-- Exemple impossible corrigé : 1-2 + qualifié équipe domicile -> qualifié équipe extérieur.
update public.predictions pr
set qualified_team_pred = case
  when pr.home_score_pred > pr.away_score_pred then m.home_team_id
  when pr.away_score_pred > pr.home_score_pred then m.away_team_id
  else pr.qualified_team_pred
end
from public.matches m
where m.id = pr.match_id
  and m.stage::text <> 'group'
  and pr.home_score_pred is not null
  and pr.away_score_pred is not null
  and pr.home_score_pred <> pr.away_score_pred
  and pr.qualified_team_pred is distinct from case
    when pr.home_score_pred > pr.away_score_pred then m.home_team_id
    when pr.away_score_pred > pr.home_score_pred then m.away_team_id
    else pr.qualified_team_pred
  end;

-- 3) Recalcule tous les points avec les données corrigées.
select public.recalc_all_points();
