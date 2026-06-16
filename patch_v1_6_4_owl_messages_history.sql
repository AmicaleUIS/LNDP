-- ============================================================
-- LE NID DES PRONOS — PATCH V1.6.4
-- Historique des messages du Hibou masqué
-- ============================================================
-- À lancer dans Supabase SQL Editor avant de publier les fichiers V1.6.4.

create table if not exists public.owl_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Message du Hibou masqué',
  body text not null,
  importance text not null default 'info' check (importance in ('info', 'fun', 'warning', 'urgent')),
  start_at timestamptz not null default now(),
  end_at timestamptz not null default (now() + interval '1 day'),
  duration_days numeric not null default 1,
  enabled boolean not null default true,
  show_in_history boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owl_messages_body_length check (char_length(body) <= 4000),
  constraint owl_messages_title_length check (char_length(title) <= 120)
);

create index if not exists idx_owl_messages_start_at on public.owl_messages(start_at desc);
create index if not exists idx_owl_messages_enabled_history on public.owl_messages(enabled, show_in_history, start_at desc);

drop trigger if exists set_updated_at_owl_messages on public.owl_messages;
create trigger set_updated_at_owl_messages
before update on public.owl_messages
for each row execute function public.set_updated_at();

alter table public.owl_messages enable row level security;

drop policy if exists "owl_messages_select_visible_or_admin" on public.owl_messages;
create policy "owl_messages_select_visible_or_admin"
on public.owl_messages
for select
to authenticated
using (
  public.is_super_admin()
  or (
    enabled = true
    and show_in_history = true
    and start_at <= now()
  )
);

drop policy if exists "owl_messages_super_admin_insert" on public.owl_messages;
create policy "owl_messages_super_admin_insert"
on public.owl_messages
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "owl_messages_super_admin_update" on public.owl_messages;
create policy "owl_messages_super_admin_update"
on public.owl_messages
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "owl_messages_super_admin_delete" on public.owl_messages;
create policy "owl_messages_super_admin_delete"
on public.owl_messages
for delete
to authenticated
using (public.is_super_admin());

grant select on public.owl_messages to authenticated;
grant insert, update, delete on public.owl_messages to authenticated;

-- Migration douce de l’ancien message unique app_settings -> nouvelle table.
insert into public.owl_messages (
  title,
  body,
  importance,
  start_at,
  end_at,
  duration_days,
  enabled,
  show_in_history,
  created_at,
  updated_at
)
select
  coalesce(value->>'title', 'Message du Hibou masqué'),
  coalesce(value->>'body', value->>'message', ''),
  coalesce(nullif(value->>'importance', ''), 'info'),
  coalesce((value->>'start_at')::timestamptz, now()),
  coalesce((value->>'end_at')::timestamptz, now() + interval '1 day'),
  coalesce((value->>'duration_days')::numeric, 1),
  coalesce((value->>'enabled')::boolean, true),
  true,
  coalesce((value->>'updated_at')::timestamptz, now()),
  coalesce((value->>'updated_at')::timestamptz, now())
from public.app_settings
where key = 'login_owl_message'
  and jsonb_typeof(value) = 'object'
  and length(coalesce(value->>'body', value->>'message', '')) > 0
  and not exists (
    select 1 from public.owl_messages om
    where om.body = coalesce(public.app_settings.value->>'body', public.app_settings.value->>'message', '')
  );

do $$
begin
  begin
    alter publication supabase_realtime add table public.owl_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;



-- ============================================================
-- Rattrapage badge champion choisi
-- ============================================================
-- Certains joueurs avaient choisi leur champion avant la compétition
-- avant que le badge "Champion choisi" ne soit correctement attribué.
-- On ajoute donc le badge souvenir sans modifier leur prono.

create table if not exists public.manual_user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  reason text,
  primary key (user_id, badge_id)
);

alter table public.manual_user_badges enable row level security;

drop policy if exists "manual badges readable by authenticated" on public.manual_user_badges;
create policy "manual badges readable by authenticated"
on public.manual_user_badges
for select
to authenticated
using (true);

drop policy if exists "manual badges super admin write" on public.manual_user_badges;
create policy "manual badges super admin write"
on public.manual_user_badges
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

insert into public.manual_user_badges (user_id, badge_id, granted_by, granted_at, reason)
select
  wp.user_id,
  'champion-picked',
  null,
  coalesce(wp.locked_at, wp.updated_at, wp.created_at, now()),
  'Rattrapage automatique V1.6.4 : champion choisi avant compétition'
from public.winner_predictions wp
where wp.predicted_team_id is not null
on conflict (user_id, badge_id) do update
set reason = coalesce(public.manual_user_badges.reason, excluded.reason),
    granted_at = least(public.manual_user_badges.granted_at, excluded.granted_at);

-- On élargit aussi la fonction super admin existante pour pouvoir restaurer ce badge à la main si besoin.
create or replace function public.admin_grant_manual_badge(
  p_user_id uuid,
  p_badge_id text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  if p_badge_id not in (
    'preparation-two-picks',
    'prep-good-pick',
    'champion-picked',
    'second-champion-picked'
  ) then
    raise exception 'Badge manuel non autorisé';
  end if;

  insert into public.manual_user_badges (user_id, badge_id, granted_by, reason, granted_at)
  values (p_user_id, p_badge_id, auth.uid(), p_reason, now())
  on conflict (user_id, badge_id) do update
  set granted_by = excluded.granted_by,
      reason = excluded.reason,
      granted_at = now();

  begin
    perform public.admin_log_action(
      'manual_badge_grant',
      'badges',
      jsonb_build_object('user_id', p_user_id, 'badge_id', p_badge_id, 'reason', p_reason)
    );
  exception
    when undefined_function then null;
  end;
end;
$$;

grant select on public.manual_user_badges to authenticated;
grant execute on function public.admin_grant_manual_badge(uuid, text, text) to authenticated;


select
  'patch_v1_6_4_owl_messages_ready' as check_name,
  (select count(*) from public.owl_messages) as owl_messages_count,
  (select count(*) from public.manual_user_badges where badge_id = 'champion-picked') as champion_badges_count;
