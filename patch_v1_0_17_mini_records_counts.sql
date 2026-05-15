-- ============================================================
-- LE NID DES PRONOS — PATCH V1.0.17
-- Mini-records : compteur public de pronos validés
-- ============================================================
-- But : permettre au mini-record "Greffier du grimoire" de classer
-- tous les joueurs sans révéler les scores pronostiqués.
--
-- À lancer dans Supabase > SQL Editor.

create or replace view public.v_mini_record_prediction_counts as
with active_competition as (
  select id
  from public.competitions
  where is_active = true
  limit 1
)
select
  p.id as user_id,
  p.pseudo,
  p.office_team_id,
  ot.name as office_team_name,
  ac.id as competition_id,
  count(pr.id) filter (
    where m.competition_id = ac.id
      and coalesce(m.status, '') not in ('cancelled', 'postponed')
  )::int as prediction_count,
  min(coalesce(pr.locked_at, pr.updated_at, pr.created_at)) filter (
    where m.competition_id = ac.id
      and coalesce(m.status, '') not in ('cancelled', 'postponed')
  ) as first_prediction_at,
  max(coalesce(pr.locked_at, pr.updated_at, pr.created_at)) filter (
    where m.competition_id = ac.id
      and coalesce(m.status, '') not in ('cancelled', 'postponed')
  ) as latest_prediction_at
from public.profiles p
cross join active_competition ac
left join public.office_teams ot on ot.id = p.office_team_id
left join public.predictions pr on pr.user_id = p.id
left join public.matches m on m.id = pr.match_id
where p.is_active = true
group by p.id, p.pseudo, p.office_team_id, ot.name, ac.id;

grant select on public.v_mini_record_prediction_counts to authenticated;

-- Vérification rapide : le Top 10 du Greffier du grimoire
select
  row_number() over (order by prediction_count desc, latest_prediction_at asc nulls last, lower(pseudo) asc) as rang,
  pseudo,
  office_team_name,
  prediction_count,
  latest_prediction_at
from public.v_mini_record_prediction_counts
where prediction_count > 0
order by prediction_count desc, latest_prediction_at asc nulls last, lower(pseudo) asc
limit 10;
