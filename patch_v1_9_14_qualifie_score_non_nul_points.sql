-- V1.9.14 — Réparation qualifié incohérent si le score pronostiqué n’est pas nul
-- À lancer dans Supabase SQL Editor après déploiement.
-- Objectif : un prono 1-2 doit forcément avoir l’équipe extérieure comme qualifiée.
-- Cela corrige les cas historiques du type USA 1-2 BEL mais Qualifié : Angleterre.

begin;

-- Le trigger de verrouillage protège les pronos après coup d’envoi.
-- Ici on fait une réparation admin historique, donc on le contourne uniquement dans la transaction.
alter table public.predictions disable trigger user;

-- 1) Répare le qualifié pronostiqué dès que le score pronostiqué désigne un vainqueur.
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
  and (
    case
      when pr.home_score_pred > pr.away_score_pred then m.home_team_id
      when pr.away_score_pred > pr.home_score_pred then m.away_team_id
      else pr.qualified_team_pred
    end
  ) is not null
  and pr.qualified_team_pred is distinct from case
    when pr.home_score_pred > pr.away_score_pred then m.home_team_id
    when pr.away_score_pred > pr.home_score_pred then m.away_team_id
    else pr.qualified_team_pred
  end;

-- 2) Répare aussi le vainqueur réel si un score réel non nul existe.
update public.matches m
set winner_team_id = case
  when m.home_score > m.away_score then m.home_team_id
  when m.away_score > m.home_score then m.away_team_id
  else m.winner_team_id
end
where m.stage::text <> 'group'
  and m.home_score is not null
  and m.away_score is not null
  and m.home_score <> m.away_score
  and (
    case
      when m.home_score > m.away_score then m.home_team_id
      when m.away_score > m.home_score then m.away_team_id
      else m.winner_team_id
    end
  ) is not null
  and m.winner_team_id is distinct from case
    when m.home_score > m.away_score then m.home_team_id
    when m.away_score > m.home_score then m.away_team_id
    else m.winner_team_id
  end;

-- 3) Recalcule les points stockés.
select public.recalc_all_points();

alter table public.predictions enable trigger user;

commit;

-- Vérification : doit retourner 0 ligne.
select
  pr.id,
  pr.user_id,
  pr.match_id,
  pr.home_score_pred,
  pr.away_score_pred,
  pr.qualified_team_pred,
  case
    when pr.home_score_pred > pr.away_score_pred then m.home_team_id
    when pr.away_score_pred > pr.home_score_pred then m.away_team_id
    else pr.qualified_team_pred
  end as qualified_should_be
from public.predictions pr
join public.matches m on m.id = pr.match_id
where m.stage::text <> 'group'
  and pr.home_score_pred is not null
  and pr.away_score_pred is not null
  and pr.home_score_pred <> pr.away_score_pred
  and pr.qualified_team_pred is distinct from case
    when pr.home_score_pred > pr.away_score_pred then m.home_team_id
    when pr.away_score_pred > pr.home_score_pred then m.away_team_id
    else pr.qualified_team_pred
  end;
