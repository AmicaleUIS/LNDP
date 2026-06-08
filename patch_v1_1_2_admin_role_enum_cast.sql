-- ============================================================
-- LE NID DES PRONOS — PATCH V1.1.2
-- Fix : changement de rôle depuis l'admin avec colonne role en enum app_role.
-- À lancer si l'admin affiche :
-- column "role" is of type app_role but expression is of type text
-- ============================================================

-- Sécurité : les valeurs doivent exister dans l'enum avant de caster.
alter type public.app_role add value if not exists 'super_admin';
alter type public.app_role add value if not exists 'family';

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
      office_team_id = case
        -- Une personne famille garde sa team de rattachement si elle en a déjà une.
        when next_role = 'family' then coalesce(office_team_id, p_office_team_id)
        else p_office_team_id
      end,
      is_banned = coalesce(p_is_banned, false),
      can_chat = coalesce(p_can_chat, true),
      can_predict = coalesce(p_can_predict, true),
      can_change_avatar = coalesce(p_can_change_avatar, true),
      can_change_pseudo = coalesce(p_can_change_pseudo, true)
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_update_profile_controls(uuid, text, uuid, boolean, boolean, boolean, boolean, boolean) to authenticated;
