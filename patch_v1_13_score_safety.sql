-- ============================================================
-- LE NID DES PRONOS — PATCH V1.13
-- Sécurité : impossible de valider un score avant le coup d’envoi
-- ============================================================

-- 1) Nettoyage immédiat : remet à zéro les matchs futurs qui auraient été
-- accidentellement passés en direct / terminés ou avec un score renseigné.
-- Les points liés à ces matchs sont supprimés.

with reset_matches as (
  update public.matches
  set
    status = 'scheduled'::public.match_status,
    home_score = null,
    away_score = null,
    winner_team_id = null,
    updated_at = now()
  where kickoff_at > now()
    and (
      status in ('live'::public.match_status, 'finished'::public.match_status)
      or home_score is not null
      or away_score is not null
      or winner_team_id is not null
    )
  returning id
)
delete from public.prediction_points pp
where pp.match_id in (select id from reset_matches);

-- 2) Verrou base de données.
-- Même si l’interface admin se trompe, Supabase refusera :
-- - de passer un match futur en En direct / Terminé ;
-- - de mettre un score ou un vainqueur sur un match futur.

create or replace function public.prevent_future_match_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kickoff_at is not null and new.kickoff_at > now() then
    if new.status in ('live'::public.match_status, 'finished'::public.match_status) then
      raise exception 'Match pas encore commencé : impossible de le passer en direct ou terminé avant le coup d’envoi.';
    end if;

    if new.home_score is not null
      or new.away_score is not null
      or new.winner_team_id is not null then
      raise exception 'Match pas encore commencé : impossible d’enregistrer un score ou un vainqueur avant le coup d’envoi.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_future_match_result on public.matches;

create trigger prevent_future_match_result
before insert or update on public.matches
for each row
execute function public.prevent_future_match_result();

-- 3) Vérification : cette requête doit retourner 0 ligne.

select
  id,
  kickoff_at,
  status,
  home_score,
  away_score,
  winner_team_id
from public.matches
where kickoff_at > now()
  and (
    status in ('live'::public.match_status, 'finished'::public.match_status)
    or home_score is not null
    or away_score is not null
    or winner_team_id is not null
  )
order by kickoff_at;
