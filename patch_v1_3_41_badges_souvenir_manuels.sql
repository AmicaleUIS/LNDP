-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.41
-- Badges souvenir manuels super admin
-- ============================================================

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

  if p_badge_id not in ('preparation-two-picks', 'prep-good-pick') then
    raise exception 'Badge manuel non autorisé';
  end if;

  insert into public.manual_user_badges (user_id, badge_id, granted_by, reason, granted_at)
  values (p_user_id, p_badge_id, auth.uid(), p_reason, now())
  on conflict (user_id, badge_id) do update
  set granted_by = excluded.granted_by,
      reason = excluded.reason,
      granted_at = now();

  perform public.admin_log_action(
    'manual_badge_grant',
    'badges',
    jsonb_build_object('user_id', p_user_id, 'badge_id', p_badge_id, 'reason', p_reason)
  );
end;
$$;

create or replace function public.admin_revoke_manual_badge(
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

  delete from public.manual_user_badges
  where user_id = p_user_id
    and badge_id = p_badge_id;

  perform public.admin_log_action(
    'manual_badge_revoke',
    'badges',
    jsonb_build_object('user_id', p_user_id, 'badge_id', p_badge_id, 'reason', p_reason)
  );
end;
$$;

grant select on public.manual_user_badges to authenticated;
grant execute on function public.admin_grant_manual_badge(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_manual_badge(uuid, text, text) to authenticated;

-- Optionnel : pour restaurer d’un coup les deux badges à un joueur connu,
-- utilise les boutons dans Admin > Joueurs, ou :
-- select public.admin_grant_manual_badge('<UUID_DU_JOUEUR>', 'prep-good-pick', 'Badge préparation restauré');

select
  'patch_v1_3_41_ready' as check_name,
  to_regclass('public.manual_user_badges') is not null as table_exists;
