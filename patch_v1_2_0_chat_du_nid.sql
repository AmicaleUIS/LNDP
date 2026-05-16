-- ============================================================
-- LE NID DES PRONOS — PATCH V1.2.0
-- Chat du Nid : salons Officiel/Famille, réactions PNG, historique.
-- À lancer après les patchs V1.1.0 et V1.1.2.
-- ============================================================


-- Helper super admin : utilisé pour la modération complète du tchat.
create or replace function public.is_super_admin_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role::text = 'super_admin'
      and p.is_active = true
      and coalesce(p.is_banned, false) = false
  );
$$;

grant execute on function public.is_super_admin_profile(uuid) to authenticated;

-- 1) Les scopes du chat évoluent :
-- global       = général UIS
-- team         = team UIS
-- family_global= général Famille
-- family_team  = team Famille
alter table public.team_chat_messages
  drop constraint if exists team_chat_messages_scope_check,
  drop constraint if exists team_chat_messages_scope_team_check;

alter table public.team_chat_messages
  add constraint team_chat_messages_scope_check
  check (scope in ('global', 'team', 'family_global', 'family_team'));

alter table public.team_chat_messages
  add constraint team_chat_messages_scope_team_check
  check (
    (scope in ('global', 'family_global') and office_team_id is null)
    or
    (scope in ('team', 'family_team') and office_team_id is not null)
  );

create index if not exists team_chat_messages_family_scope_created_idx
  on public.team_chat_messages(scope, created_at desc)
  where deleted_at is null;

-- 2) Normalisation / droits d'écriture côté base.
create or replace function public.normalize_team_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_scope text;
  v_show_family boolean;
  v_team uuid;
  v_can_chat boolean;
  v_is_active boolean;
  v_is_banned boolean;
begin
  new.body := trim(new.body);
  new.user_id := auth.uid();

  select
    coalesce(p.role::text, 'user'),
    coalesce(p.player_scope, 'uis'),
    coalesce(p.show_family_players, false),
    p.office_team_id,
    coalesce(p.can_chat, true),
    coalesce(p.is_active, false),
    coalesce(p.is_banned, false)
  into v_role, v_scope, v_show_family, v_team, v_can_chat, v_is_active, v_is_banned
  from public.profiles p
  where p.id = auth.uid();

  if not coalesce(v_is_active, false) or coalesce(v_is_banned, false) then
    raise exception 'Compte désactivé.';
  end if;

  if not coalesce(v_can_chat, true) then
    raise exception 'Les messages sont désactivés sur ce compte.';
  end if;

  if new.scope not in ('global', 'team', 'family_global', 'family_team') then
    new.scope := 'global';
  end if;

  if v_role = 'family' or v_scope = 'family' then
    if new.scope not in ('family_global', 'family_team') then
      raise exception 'Les comptes Famille écrivent dans les salons Famille uniquement.';
    end if;
  else
    if new.scope in ('family_global', 'family_team') and not coalesce(v_show_family, false) then
      raise exception 'Active le mode Famille dans ton profil pour écrire ici.';
    end if;
  end if;

  if new.scope in ('team', 'family_team') then
    if v_team is null then
      raise exception 'Tu dois avoir une team pour écrire dans ce salon.';
    end if;
    new.office_team_id := v_team;
  else
    new.office_team_id := null;
  end if;

  return new;
end;
$$;


-- RLS actualisées pour les nouveaux scopes. La vraie normalisation reste dans le trigger.
drop policy if exists team_chat_messages_select on public.team_chat_messages;
create policy team_chat_messages_select
on public.team_chat_messages
for select
to authenticated
using (public.is_active_profile(auth.uid()));

drop policy if exists team_chat_messages_insert on public.team_chat_messages;
create policy team_chat_messages_insert
on public.team_chat_messages
for insert
to authenticated
with check (
  public.is_active_profile(auth.uid())
  and user_id = auth.uid()
  and scope in ('global', 'team', 'family_global', 'family_team')
);

drop policy if exists team_chat_messages_update_admin_only on public.team_chat_messages;
drop policy if exists team_chat_messages_update_own_or_admin on public.team_chat_messages;
drop policy if exists team_chat_messages_update_super_admin_only on public.team_chat_messages;
create policy team_chat_messages_update_super_admin_only
on public.team_chat_messages
for update
to authenticated
using (public.is_active_profile(auth.uid()) and public.is_super_admin_profile(auth.uid()))
with check (public.is_active_profile(auth.uid()) and public.is_super_admin_profile(auth.uid()));

drop policy if exists team_chat_messages_delete_admin_only on public.team_chat_messages;
drop policy if exists team_chat_messages_delete_own_or_admin on public.team_chat_messages;
drop policy if exists team_chat_messages_delete_super_admin_only on public.team_chat_messages;
create policy team_chat_messages_delete_super_admin_only
on public.team_chat_messages
for delete
to authenticated
using (public.is_active_profile(auth.uid()) and public.is_super_admin_profile(auth.uid()));

grant select, insert, update, delete on public.team_chat_messages to authenticated;

-- 3) Table des réactions : une seule réaction par joueur et par message.
create table if not exists public.team_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.team_chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_key text not null,
  created_at timestamptz not null default now(),
  constraint team_chat_reactions_key_check check (reaction_key in ('owl','ball','laugh','fire','cry','eyes')),
  constraint team_chat_reactions_one_per_user unique (message_id, user_id)
);

create index if not exists team_chat_reactions_message_idx
  on public.team_chat_reactions(message_id);

alter table public.team_chat_reactions enable row level security;

drop policy if exists team_chat_reactions_select on public.team_chat_reactions;
create policy team_chat_reactions_select
on public.team_chat_reactions
for select
to authenticated
using (public.is_active_profile(auth.uid()));

drop policy if exists team_chat_reactions_insert on public.team_chat_reactions;
create policy team_chat_reactions_insert
on public.team_chat_reactions
for insert
to authenticated
with check (public.is_active_profile(auth.uid()) and user_id = auth.uid());

drop policy if exists team_chat_reactions_update_own on public.team_chat_reactions;
create policy team_chat_reactions_update_own
on public.team_chat_reactions
for update
to authenticated
using (public.is_active_profile(auth.uid()) and user_id = auth.uid())
with check (public.is_active_profile(auth.uid()) and user_id = auth.uid());

drop policy if exists team_chat_reactions_delete_own on public.team_chat_reactions;
create policy team_chat_reactions_delete_own
on public.team_chat_reactions
for delete
to authenticated
using (public.is_active_profile(auth.uid()) and user_id = auth.uid());

grant select, insert, update, delete on public.team_chat_reactions to authenticated;

-- 4) Visibilité des messages selon le profil courant.
drop view if exists public.v_admin_team_chat_messages;
drop view if exists public.v_team_chat_messages;

create or replace view public.v_team_chat_messages
as
with current_profile as (
  select
    p.id,
    coalesce(p.role::text, 'user') as role,
    coalesce(p.player_scope, 'uis') as player_scope,
    coalesce(p.show_family_players, false) as show_family_players,
    p.office_team_id,
    coalesce(p.is_active, false) as is_active,
    coalesce(p.is_banned, false) as is_banned
  from public.profiles p
  where p.id = auth.uid()
)
select
  m.id,
  m.user_id,
  m.scope,
  m.office_team_id,
  m.body,
  m.created_at,
  m.updated_at,
  p.pseudo as author_pseudo,
  p.role as author_role,
  p.player_scope as author_player_scope,
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
  coalesce((
    select jsonb_agg(jsonb_build_object('reaction_key', grouped.reaction_key, 'count', grouped.reaction_count) order by grouped.reaction_key)
    from (
      select r.reaction_key, count(*)::int as reaction_count
      from public.team_chat_reactions r
      join public.profiles rp on rp.id = r.user_id
      where r.message_id = m.id
        and rp.is_active = true
        and coalesce(rp.is_banned, false) = false
        and not exists (
          select 1 from public.user_blocks b
          where b.blocker_id = auth.uid()
            and b.blocked_id = r.user_id
        )
      group by r.reaction_key
    ) grouped
  ), '[]'::jsonb) as reaction_counts,
  (
    select r.reaction_key
    from public.team_chat_reactions r
    where r.message_id = m.id and r.user_id = auth.uid()
    limit 1
  ) as my_reaction
from public.team_chat_messages m
join public.profiles p on p.id = m.user_id
left join public.office_teams author_team on author_team.id = p.office_team_id
left join public.office_teams target_team on target_team.id = m.office_team_id
cross join current_profile cp
where p.is_active = true
  and coalesce(p.is_banned, false) = false
  and m.deleted_at is null
  and cp.is_active = true
  and cp.is_banned = false
  and not exists (
    select 1 from public.user_blocks b
    where b.blocker_id = auth.uid()
      and b.blocked_id = m.user_id
  )
  and (
    (m.scope = 'global' and cp.player_scope <> 'family' and cp.role <> 'family')
    or (m.scope = 'team' and cp.player_scope <> 'family' and cp.role <> 'family' and m.office_team_id = cp.office_team_id)
    or (m.scope = 'family_global' and (cp.player_scope = 'family' or cp.role = 'family' or cp.show_family_players = true))
    or (m.scope = 'family_team' and (cp.player_scope = 'family' or cp.role = 'family' or cp.show_family_players = true) and m.office_team_id = cp.office_team_id)
  );

grant select on public.v_team_chat_messages to authenticated;

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
  p.role as author_role,
  p.player_scope as author_player_scope,
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
where public.is_super_admin_profile(auth.uid());

grant select on public.v_admin_team_chat_messages to authenticated;

-- 5) Fonction réaction : remplace l'ancienne réaction ou la retire si on reclique dessus.
create or replace function public.toggle_team_chat_reaction(
  p_message_id uuid,
  p_reaction_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
begin
  if p_reaction_key not in ('owl','ball','laugh','fire','cry','eyes') then
    raise exception 'Réaction inconnue.';
  end if;

  if not exists (select 1 from public.v_team_chat_messages where id = p_message_id) then
    raise exception 'Message inaccessible.';
  end if;

  select reaction_key into v_existing
  from public.team_chat_reactions
  where message_id = p_message_id and user_id = auth.uid();

  if v_existing = p_reaction_key then
    delete from public.team_chat_reactions
    where message_id = p_message_id and user_id = auth.uid();
  else
    insert into public.team_chat_reactions(message_id, user_id, reaction_key)
    values (p_message_id, auth.uid(), p_reaction_key)
    on conflict (message_id, user_id)
    do update set reaction_key = excluded.reaction_key,
                  created_at = now();
  end if;
end;
$$;

grant execute on function public.toggle_team_chat_reaction(uuid, text) to authenticated;

-- 6) Suppression : l'auteur masque son message ; le super admin peut tout masquer.
create or replace function public.delete_own_or_moderate_chat_message(
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select user_id into v_author
  from public.team_chat_messages
  where id = p_message_id;

  if v_author is null then
    raise exception 'Message introuvable.';
  end if;

  if v_author <> auth.uid() and not public.is_super_admin_profile(auth.uid()) then
    raise exception 'Action non autorisée.';
  end if;

  update public.team_chat_messages
     set deleted_at = coalesce(deleted_at, now()),
         deleted_by = auth.uid(),
         deleted_reason = case when v_author = auth.uid() then 'Message masqué par son auteur' else 'Message masqué par super admin' end,
         updated_at = now()
   where id = p_message_id;
end;
$$;

grant execute on function public.delete_own_or_moderate_chat_message(uuid) to authenticated;

-- 7) Realtime.
do $$
begin
  begin
    alter publication supabase_realtime add table public.team_chat_reactions;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
