-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.24
-- Champion : verrouillage uniquement au premier match officiel
-- Admin : diagnostic mode Famille
-- À lancer dans Supabase SQL Editor.
-- Ne supprime rien.
-- ============================================================

-- 1) Début de compétition = premier match OFFICIEL uniquement.
-- Les matchs de préparation/test ne verrouillent plus le choix champion.
create or replace function public.competition_start_at(p_competition_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select min(m.kickoff_at)
  from public.matches m
  where m.competition_id = p_competition_id
    and coalesce(m.is_test_match, false) = false
    and coalesce(m.status, 'scheduled') not in ('cancelled', 'postponed');
$$;

create or replace function public.is_winner_prediction_open(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(now() < public.competition_start_at(p_competition_id), true);
$$;

create or replace function public.enforce_winner_prediction_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  start_at timestamptz;
begin
  select public.competition_start_at(new.competition_id)
  into start_at;

  if start_at is not null and now() >= start_at then
    raise exception 'Choix du champion verrouillé : le premier match officiel a commencé.';
  end if;

  if TG_OP = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Impossible de transférer un choix champion vers un autre joueur.';
    end if;

    if new.competition_id is distinct from old.competition_id then
      raise exception 'Impossible de transférer un choix champion vers une autre compétition.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_winner_prediction_deadline on public.winner_predictions;
create trigger enforce_winner_prediction_deadline
before insert or update on public.winner_predictions
for each row execute function public.enforce_winner_prediction_deadline();

-- 2) Recrée les policies pour s’assurer qu’elles utilisent bien la fonction corrigée.
alter table public.winner_predictions enable row level security;

drop policy if exists "winner_predictions_insert_own_before_start" on public.winner_predictions;
create policy "winner_predictions_insert_own_before_start"
on public.winner_predictions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_winner_prediction_open(competition_id)
);

drop policy if exists "winner_predictions_update_own_before_start" on public.winner_predictions;
create policy "winner_predictions_update_own_before_start"
on public.winner_predictions
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_winner_prediction_open(competition_id)
)
with check (
  user_id = auth.uid()
  and public.is_winner_prediction_open(competition_id)
);

-- 3) Fonction optionnelle appelée par le front si tu veux l’utiliser plus tard.
-- Elle garde la même règle officielle et renvoie la ligne enregistrée.
create or replace function public.save_winner_prediction(
  p_predicted_team_id uuid,
  p_competition_id uuid default null
)
returns table (
  user_id uuid,
  competition_id uuid,
  predicted_team_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition_id uuid;
begin
  target_competition_id := p_competition_id;

  if target_competition_id is null then
    select id
    into target_competition_id
    from public.competitions
    where is_active = true
    order by id desc
    limit 1;
  end if;

  if target_competition_id is null then
    raise exception 'Compétition active introuvable';
  end if;

  if not public.is_winner_prediction_open(target_competition_id) then
    raise exception 'Choix du champion verrouillé : le premier match officiel a commencé.';
  end if;

  return query
  insert into public.winner_predictions as wp (
    user_id,
    competition_id,
    predicted_team_id
  )
  values (
    auth.uid(),
    target_competition_id,
    p_predicted_team_id
  )
  on conflict (user_id, competition_id) do update
  set predicted_team_id = excluded.predicted_team_id,
      updated_at = now()
  returning wp.user_id, wp.competition_id, wp.predicted_team_id, wp.created_at, wp.updated_at;
end;
$$;

grant execute on function public.save_winner_prediction(uuid, uuid) to authenticated;

-- 4) Diagnostic : montre la date qui verrouille vraiment le champion.
select
  c.id as competition_id,
  c.name as competition_name,
  public.competition_start_at(c.id) as first_official_match_at,
  public.is_winner_prediction_open(c.id) as champion_pick_open
from public.competitions c
where c.is_active = true
order by c.id desc
limit 1;

-- 5) Diagnostic admin : qui affiche le mode Famille.
select
  p.id,
  p.pseudo,
  p.email,
  p.role,
  p.player_scope,
  p.show_family_players,
  p.invited_by,
  case
    when p.role = 'family' or p.player_scope = 'family' or p.invited_by is not null then 'compte_famille'
    when coalesce(p.show_family_players, false) = true then 'mode_famille_affiche'
    else 'mode_famille_masque'
  end as family_visibility_status
from public.profiles p
where coalesce(p.is_active, true) = true
order by
  family_visibility_status,
  p.pseudo nulls last,
  p.email nulls last;
