-- ============================================================
-- LE NID DES PRONOS — PATCH V0.25.0
-- Onglet Les teams + chat global / chat par team
-- À lancer dans Supabase SQL Editor avant d'utiliser le chat.
-- ============================================================

-- 1) Table des messages.
create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null default 'global',
  office_team_id uuid references public.office_teams(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_chat_messages_scope_check check (scope in ('global', 'team')),
  constraint team_chat_messages_body_length_check check (char_length(trim(body)) between 1 and 600),
  constraint team_chat_messages_scope_team_check check (
    (scope = 'global' and office_team_id is null)
    or
    (scope = 'team' and office_team_id is not null)
  )
);

create index if not exists team_chat_messages_scope_created_idx
  on public.team_chat_messages(scope, created_at desc);

create index if not exists team_chat_messages_office_team_created_idx
  on public.team_chat_messages(office_team_id, created_at desc)
  where scope = 'team';

-- 2) Helpers RLS.
create or replace function public.is_active_profile(p_user_id uuid)
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
      and p.is_active = true
  );
$$;

create or replace function public.is_admin_profile(p_user_id uuid)
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
      and p.role = 'admin'
      and p.is_active = true
  );
$$;

create or replace function public.current_office_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.office_team_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

-- 3) Normalisation : on évite qu'un joueur se fasse passer pour un autre
-- ou écrive dans une team qui n'est pas la sienne.
create or replace function public.normalize_team_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.body := trim(new.body);
  new.user_id := auth.uid();

  if new.scope = 'team' then
    select p.office_team_id
      into new.office_team_id
    from public.profiles p
    where p.id = auth.uid();
  else
    new.scope := 'global';
    new.office_team_id := null;
  end if;

  return new;
end;
$$;

create or replace function public.set_team_chat_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_team_chat_message_before_insert on public.team_chat_messages;
create trigger normalize_team_chat_message_before_insert
before insert on public.team_chat_messages
for each row execute function public.normalize_team_chat_message();

drop trigger if exists set_team_chat_updated_at_before_update on public.team_chat_messages;
create trigger set_team_chat_updated_at_before_update
before update on public.team_chat_messages
for each row execute function public.set_team_chat_updated_at();

-- 4) RLS.
alter table public.team_chat_messages enable row level security;

drop policy if exists team_chat_messages_select on public.team_chat_messages;
create policy team_chat_messages_select
on public.team_chat_messages
for select
to authenticated
using (
  public.is_active_profile(auth.uid())
  and (
    scope = 'global'
    or office_team_id = public.current_office_team_id()
    or public.is_admin_profile(auth.uid())
  )
);

drop policy if exists team_chat_messages_insert on public.team_chat_messages;
create policy team_chat_messages_insert
on public.team_chat_messages
for insert
to authenticated
with check (
  public.is_active_profile(auth.uid())
  and user_id = auth.uid()
  and (
    (scope = 'global' and office_team_id is null)
    or
    (scope = 'team' and office_team_id = public.current_office_team_id())
  )
);

drop policy if exists team_chat_messages_update_own_or_admin on public.team_chat_messages;
create policy team_chat_messages_update_own_or_admin
on public.team_chat_messages
for update
to authenticated
using (
  public.is_active_profile(auth.uid())
  and (user_id = auth.uid() or public.is_admin_profile(auth.uid()))
)
with check (
  public.is_active_profile(auth.uid())
  and (user_id = auth.uid() or public.is_admin_profile(auth.uid()))
);

drop policy if exists team_chat_messages_delete_own_or_admin on public.team_chat_messages;
create policy team_chat_messages_delete_own_or_admin
on public.team_chat_messages
for delete
to authenticated
using (
  public.is_active_profile(auth.uid())
  and (user_id = auth.uid() or public.is_admin_profile(auth.uid()))
);

-- 5) Vue de lecture pour le front.
-- La vue filtre elle-même selon auth.uid() pour éviter d'exposer le chat d'une autre team.
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
  and public.is_active_profile(auth.uid())
  and (
    m.scope = 'global'
    or m.office_team_id = public.current_office_team_id()
    or public.is_admin_profile(auth.uid())
  );

grant select on public.v_team_chat_messages to authenticated;
grant select, insert, update, delete on public.team_chat_messages to authenticated;

-- 6) Realtime pour réception instantanée.
do $$
begin
  begin
    alter publication supabase_realtime add table public.team_chat_messages;
  exception when duplicate_object then
    null;
  end;
end $$;

-- 7) Vérification rapide.
select
  'team_chat_ready' as check_name,
  count(*) as messages_count
from public.team_chat_messages;
