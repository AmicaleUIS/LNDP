-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.25
-- Admin : mode Famille par joueur + reset mot de passe forcé
-- À lancer après la V1.3.24.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists force_password_change boolean not null default false;

alter table public.profiles
  add column if not exists password_force_requested_at timestamptz;

alter table public.profiles
  add column if not exists password_changed_at timestamptz;

-- ------------------------------------------------------------
-- 1) Admin : afficher / masquer le mode Famille pour un joueur UIS
-- ------------------------------------------------------------
create or replace function public.admin_set_user_family_mode(
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_user_id
  for update;

  if target_profile.id is null then
    raise exception 'Joueur introuvable';
  end if;

  if coalesce(target_profile.role, 'user') in ('admin', 'super_admin') then
    raise exception 'Impossible de modifier le mode Famille d’un admin';
  end if;

  if coalesce(target_profile.player_scope, 'uis') = 'family' or coalesce(target_profile.role, 'user') = 'family' then
    raise exception 'Compte Famille : le mode Famille est déjà implicite';
  end if;

  update public.profiles
  set show_family_players = coalesce(p_enabled, false),
      updated_at = now()
  where id = p_user_id;

  perform public.admin_log_action(
    'set_user_family_mode',
    'family',
    jsonb_build_object('user_id', p_user_id, 'enabled', coalesce(p_enabled, false))
  );
end;
$$;

grant execute on function public.admin_set_user_family_mode(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 2) Admin : imposer un mot de passe temporaire
-- Le joueur devra ensuite le changer à la prochaine connexion.
-- ------------------------------------------------------------
create or replace function public.admin_force_password_change(
  p_user_id uuid,
  p_temporary_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target_profile public.profiles%rowtype;
  clean_password text := trim(coalesce(p_temporary_password, ''));
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  if length(clean_password) < 8 then
    raise exception 'Mot de passe temporaire trop court';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_user_id
  for update;

  if target_profile.id is null then
    raise exception 'Joueur introuvable';
  end if;

  if coalesce(target_profile.role, 'user') = 'super_admin' then
    raise exception 'Impossible de réinitialiser le mot de passe d’un super admin depuis l’application';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(clean_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Compte auth introuvable';
  end if;

  update public.profiles
  set force_password_change = true,
      password_force_requested_at = now(),
      updated_at = now()
  where id = p_user_id;

  perform public.admin_log_action(
    'force_password_change',
    'user',
    jsonb_build_object('user_id', p_user_id)
  );
end;
$$;

grant execute on function public.admin_force_password_change(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3) Joueur : enlever le verrou après changement du mot de passe
-- ------------------------------------------------------------
create or replace function public.clear_force_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;

  update public.profiles
  set force_password_change = false,
      password_changed_at = now(),
      updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.clear_force_password_change() to authenticated;

-- Diagnostic rapide
select
  'patch_v1_3_25_ready' as check_name,
  count(*) filter (where force_password_change = true) as players_waiting_password_change,
  count(*) filter (where show_family_players = true) as players_showing_family_mode
from public.profiles;
