-- ============================================================
-- LE NID DES PRONOS — PATCH V1.2.3
-- Super admin : coupons Famille bonus + réinitialisation
-- À lancer après patch_v1_2_0_chat_du_nid.sql et patch_v1_2_1_reactions_whatsapp.sql.
-- ============================================================

-- Créer un coupon bonus pour un joueur UIS précis.
-- Contrairement à create_family_invite(), cette fonction super admin ignore la limite normale de 3.
create or replace function public.admin_create_bonus_family_invite(
  p_inviter_id uuid,
  p_office_team_id uuid default null,
  p_valid_days int default 7
)
returns table(code text, expires_at timestamptz, office_team_id uuid, inviter_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player public.profiles%rowtype;
  target_team_id uuid;
  valid_days int := greatest(1, least(coalesce(p_valid_days, 7), 30));
  new_code text;
  new_expires_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  select * into target_player
  from public.profiles
  where id = p_inviter_id;

  if target_player.id is null then
    raise exception 'Joueur introuvable';
  end if;

  if coalesce(target_player.player_scope, 'uis') = 'family' or target_player.role::text = 'family' then
    raise exception 'Un compte Famille ne peut pas recevoir de coupons à inviter';
  end if;

  target_team_id := coalesce(p_office_team_id, target_player.office_team_id);

  if target_team_id is null then
    raise exception 'Choisis une team pour ce coupon';
  end if;

  if not exists (select 1 from public.office_teams where id = target_team_id) then
    raise exception 'Team introuvable';
  end if;

  new_code := public.generate_family_invite_code();
  new_expires_at := now() + make_interval(days => valid_days);

  insert into public.family_invites (code, inviter_id, office_team_id, expires_at)
  values (new_code, target_player.id, target_team_id, new_expires_at);

  return query select new_code, new_expires_at, target_team_id, target_player.id;
end;
$$;

grant execute on function public.admin_create_bonus_family_invite(uuid, uuid, int) to authenticated;

-- Réinitialiser un coupon existant.
-- Le coupon redevient disponible, avec une nouvelle date d'expiration.
-- Important : le compte qui avait déjà utilisé le coupon n'est pas modifié automatiquement.
create or replace function public.admin_reset_family_invite(
  p_invite_id uuid,
  p_valid_days int default 7
)
returns table(code text, expires_at timestamptz, office_team_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.family_invites%rowtype;
  valid_days int := greatest(1, least(coalesce(p_valid_days, 7), 30));
  new_expires_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  select * into invite_row
  from public.family_invites
  where id = p_invite_id
  for update;

  if invite_row.id is null then
    raise exception 'Coupon introuvable';
  end if;

  new_expires_at := now() + make_interval(days => valid_days);

  return query
  update public.family_invites fi
  set used_by = null,
      used_at = null,
      revoked_at = null,
      expires_at = new_expires_at
  where fi.id = p_invite_id
  returning fi.code, fi.expires_at, fi.office_team_id;
end;
$$;

grant execute on function public.admin_reset_family_invite(uuid, int) to authenticated;
