-- ============================================================
-- LE NID DES PRONOS — PATCH V1.4.1
-- Super admin : changer quelqu’un en Famille modifie réellement
-- le rôle et le player_scope, pas seulement l’affichage Famille.
-- ============================================================

alter type public.app_role add value if not exists 'family';

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
  next_is_family boolean := coalesce(p_enabled, false);
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

  if coalesce(target_profile.role::text, 'user') in ('admin', 'super_admin') then
    raise exception 'Impossible de modifier la catégorie Famille d’un admin';
  end if;

  update public.profiles
  set role = case when next_is_family then 'family'::public.app_role else 'user'::public.app_role end,
      player_scope = case when next_is_family then 'family' else 'uis' end,
      show_family_players = false,
      updated_at = now()
  where id = p_user_id;

  perform public.admin_log_action(
    'set_user_family_role',
    'family',
    jsonb_build_object(
      'user_id', p_user_id,
      'enabled', next_is_family,
      'role', case when next_is_family then 'family' else 'user' end,
      'player_scope', case when next_is_family then 'family' else 'uis' end
    )
  );
end;
$$;

grant execute on function public.admin_set_user_family_mode(uuid, boolean) to authenticated;

create or replace function public.admin_update_profile_controls(
  p_user_id uuid,
  p_role text,
  p_office_team_id uuid,
  p_is_banned boolean,
  p_can_chat boolean,
  p_can_predict boolean,
  p_can_change_avatar boolean,
  p_can_change_pseudo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_role text := coalesce(nullif(trim(p_role), ''), 'user');
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  if next_role not in ('super_admin', 'admin', 'user', 'family') then
    raise exception 'Rôle invalide';
  end if;

  update public.profiles
  set role = next_role::public.app_role,
      player_scope = case when next_role = 'family' then 'family' else 'uis' end,
      show_family_players = false,
      office_team_id = case
        -- Si on passe en Famille, on conserve la team existante pour les tableaux Famille.
        when next_role = 'family' then coalesce(office_team_id, p_office_team_id)
        else p_office_team_id
      end,
      is_banned = coalesce(p_is_banned, false),
      can_chat = coalesce(p_can_chat, true),
      can_predict = coalesce(p_can_predict, true),
      can_change_avatar = coalesce(p_can_change_avatar, true),
      can_change_pseudo = coalesce(p_can_change_pseudo, true),
      updated_at = now()
  where id = p_user_id;

  perform public.admin_log_action(
    'update_profile_controls',
    'user',
    jsonb_build_object(
      'user_id', p_user_id,
      'role', next_role,
      'player_scope', case when next_role = 'family' then 'family' else 'uis' end
    )
  );
end;
$$;

grant execute on function public.admin_update_profile_controls(uuid, text, uuid, boolean, boolean, boolean, boolean, boolean) to authenticated;

select
  'patch_v1_4_1_ready' as check_name,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='admin_set_user_family_mode') as function_exists;
