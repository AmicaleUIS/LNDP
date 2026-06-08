-- ============================================================
-- LE NID DES PRONOS — PATCH V0.25.1
-- Fiches joueurs dans Les teams + modération du chat + chargement progressif
-- À lancer après patch_v0_25_0_les_teams_chat.sql
-- ============================================================

-- 1) Colonnes de modération : on masque les messages au lieu de les supprimer physiquement.
alter table public.team_chat_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_reason text;

create index if not exists team_chat_messages_visible_scope_created_idx
  on public.team_chat_messages(scope, created_at desc)
  where deleted_at is null;

create index if not exists team_chat_messages_deleted_at_idx
  on public.team_chat_messages(deleted_at desc)
  where deleted_at is not null;

-- 2) Fonction admin : masquer un message.
create or replace function public.moderate_team_chat_message(
  p_message_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_profile(auth.uid()) then
    raise exception 'Action réservée aux admins.';
  end if;

  update public.team_chat_messages
     set deleted_at = coalesce(deleted_at, now()),
         deleted_by = auth.uid(),
         deleted_reason = left(coalesce(nullif(trim(p_reason), ''), 'Message masqué par admin'), 240),
         updated_at = now()
   where id = p_message_id;

  if not found then
    raise exception 'Message introuvable.';
  end if;
end;
$$;

grant execute on function public.moderate_team_chat_message(uuid, text) to authenticated;

-- 3) RLS : seul un admin peut modifier/supprimer les messages.
-- Les joueurs peuvent toujours insérer et lire selon les règles du patch V0.25.0.
drop policy if exists team_chat_messages_update_own_or_admin on public.team_chat_messages;
drop policy if exists team_chat_messages_delete_own_or_admin on public.team_chat_messages;

drop policy if exists team_chat_messages_update_admin_only on public.team_chat_messages;
create policy team_chat_messages_update_admin_only
on public.team_chat_messages
for update
to authenticated
using (
  public.is_active_profile(auth.uid())
  and public.is_admin_profile(auth.uid())
)
with check (
  public.is_active_profile(auth.uid())
  and public.is_admin_profile(auth.uid())
);

drop policy if exists team_chat_messages_delete_admin_only on public.team_chat_messages;
create policy team_chat_messages_delete_admin_only
on public.team_chat_messages
for delete
to authenticated
using (
  public.is_active_profile(auth.uid())
  and public.is_admin_profile(auth.uid())
);

-- 4) Vue publique du chat : les messages modérés disparaissent côté joueurs.
create or replace view public.v_team_chat_messages
as
select
  m.id,
  m.user_id,
  m.scope,
  m.office_team_id,
  m.body,
  m.created_at,
  m.updated_at,
  p.pseudo as author_pseudo,
  p.office_team_id as author_office_team_id,
  author_team.name as author_office_team_name,
  author_team.slug as author_office_team_slug,
  author_team.color as author_office_team_color,
  p.avatar_key,
  p.badge_shape,
  p.badge_color,
  target_team.name as office_team_name,
  target_team.slug as office_team_slug,
  target_team.color as office_team_color
from public.team_chat_messages m
join public.profiles p on p.id = m.user_id
left join public.office_teams author_team on author_team.id = p.office_team_id
left join public.office_teams target_team on target_team.id = m.office_team_id
where p.is_active = true
  and m.deleted_at is null
  and public.is_active_profile(auth.uid())
  and (
    m.scope = 'global'
    or m.office_team_id = public.current_office_team_id()
    or public.is_admin_profile(auth.uid())
  );

grant select on public.v_team_chat_messages to authenticated;

-- 5) Vue admin : voir les derniers messages, y compris ceux déjà masqués.
create or replace view public.v_admin_team_chat_messages
as
select
  m.id,
  m.user_id,
  m.scope,
  m.office_team_id,
  m.body,
  m.created_at,
  m.updated_at,
  m.deleted_at,
  m.deleted_by,
  m.deleted_reason,
  p.pseudo as author_pseudo,
  p.email as author_email,
  p.office_team_id as author_office_team_id,
  author_team.name as author_office_team_name,
  author_team.slug as author_office_team_slug,
  author_team.color as author_office_team_color,
  p.avatar_key,
  p.badge_shape,
  p.badge_color,
  target_team.name as office_team_name,
  target_team.slug as office_team_slug,
  target_team.color as office_team_color,
  moderator.pseudo as deleted_by_pseudo
from public.team_chat_messages m
join public.profiles p on p.id = m.user_id
left join public.office_teams author_team on author_team.id = p.office_team_id
left join public.office_teams target_team on target_team.id = m.office_team_id
left join public.profiles moderator on moderator.id = m.deleted_by
where public.is_admin_profile(auth.uid());

grant select on public.v_admin_team_chat_messages to authenticated;

-- 6) Vue publique des choix champions pour les fiches joueurs de l'onglet Les teams.
-- Contrairement à v_winner_predictions, cette vue expose volontairement le choix champion
-- de tous les joueurs actifs, car l'onglet Les teams sert d'annuaire/fiche joueur.
create or replace view public.v_team_public_winner_predictions
as
with final_winner as (
  select distinct on (m.competition_id)
    m.competition_id,
    m.winner_team_id as actual_winner_team_id
  from public.matches m
  where m.stage = 'final'::public.match_stage
    and m.status = 'finished'::public.match_status
    and m.winner_team_id is not null
  order by m.competition_id, m.kickoff_at desc
)
select
  wp.id,
  wp.user_id,
  p.pseudo,
  wp.competition_id,
  c.name as competition_name,
  public.competition_start_at(wp.competition_id) as competition_start_at,
  not public.is_winner_prediction_open(wp.competition_id) as is_locked,
  wp.predicted_team_id,
  ft.name as predicted_team_name,
  ft.short_name as predicted_team_short_name,
  ft.country_code as predicted_team_country_code,
  ft.flag_url as predicted_team_flag_url,
  fw.actual_winner_team_id,
  actual.name as actual_winner_team_name,
  case
    when fw.actual_winner_team_id is not null
      and fw.actual_winner_team_id = wp.predicted_team_id
    then 100
    else 0
  end::int as points_total,
  wp.created_at,
  wp.updated_at
from public.winner_predictions wp
join public.profiles p on p.id = wp.user_id
join public.competitions c on c.id = wp.competition_id
join public.football_teams ft on ft.id = wp.predicted_team_id
left join final_winner fw on fw.competition_id = wp.competition_id
left join public.football_teams actual on actual.id = fw.actual_winner_team_id
where p.is_active = true
  and public.is_active_profile(auth.uid());

grant select on public.v_team_public_winner_predictions to authenticated;

-- 7) Vérification rapide.
select
  'teams_details_moderation_ready' as check_name,
  (select count(*) from public.team_chat_messages where deleted_at is null) as visible_messages,
  (select count(*) from public.team_chat_messages where deleted_at is not null) as moderated_messages;
