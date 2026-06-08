-- ============================================================
-- LE NID DES PRONOS — PATCH V1.1.0
-- Mini-record Greffier du grimoire : date du trophée + égalités stables
-- ============================================================
-- But : compter les pronos validés de tous les joueurs sans révéler les scores,
-- puis fournir la date à laquelle le joueur a atteint son total actuel.
-- En cas d'égalité, celui qui a atteint le total en premier conserve le trophée.
--
-- À lancer dans Supabase > SQL Editor.

create or replace view public.v_mini_record_prediction_counts as
with active_competition as (
  select id
  from public.competitions
  where is_active = true
  limit 1
), filtered_predictions as (
  select
    pr.user_id,
    m.competition_id,
    coalesce(pr.locked_at, pr.updated_at, pr.created_at) as prediction_activity_at
  from public.predictions pr
  join public.matches m on m.id = pr.match_id
  cross join active_competition ac
  where m.competition_id = ac.id
    and coalesce(m.status::text, '') not in ('cancelled', 'postponed')
), user_counts as (
  select
    fp.user_id,
    fp.competition_id,
    count(*)::int as prediction_count,
    min(fp.prediction_activity_at) as first_prediction_at,
    max(fp.prediction_activity_at) as latest_prediction_at,
    max(fp.prediction_activity_at) as record_unlocked_at
  from filtered_predictions fp
  group by fp.user_id, fp.competition_id
)
select
  p.id as user_id,
  p.pseudo,
  p.office_team_id,
  ot.name as office_team_name,
  ac.id as competition_id,
  coalesce(uc.prediction_count, 0)::int as prediction_count,
  uc.first_prediction_at,
  uc.latest_prediction_at,
  uc.record_unlocked_at
from public.profiles p
cross join active_competition ac
left join public.office_teams ot on ot.id = p.office_team_id
left join user_counts uc on uc.user_id = p.id and uc.competition_id = ac.id
where p.is_active = true;

grant select on public.v_mini_record_prediction_counts to authenticated;

-- Vérification rapide : top 10 du Greffier du grimoire.
-- À valeur égale, record_unlocked_at le plus ancien garde la place.
select
  row_number() over (
    order by prediction_count desc, record_unlocked_at asc nulls last, lower(pseudo) asc
  ) as rang,
  pseudo,
  office_team_name,
  prediction_count,
  record_unlocked_at
from public.v_mini_record_prediction_counts
where prediction_count > 0
order by prediction_count desc, record_unlocked_at asc nulls last, lower(pseudo) asc
limit 10;
