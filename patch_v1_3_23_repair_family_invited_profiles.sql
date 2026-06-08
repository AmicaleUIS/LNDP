-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.23
-- Réparer les profils Famille créés via coupon
-- Ne supprime rien.
-- ============================================================

-- 1) Diagnostic : coupons utilisés et profil associé.
select
  fi.code,
  fi.inviter_id,
  inviter.pseudo as inviter_pseudo,
  fi.used_by,
  invited.pseudo as invited_pseudo,
  invited.email as invited_email,
  invited.role as invited_role,
  invited.player_scope as invited_player_scope,
  invited.invited_by as invited_by_profile,
  invited.office_team_id as invited_team_id,
  fi.office_team_id as coupon_team_id,
  invited.profile_setup_done,
  fi.used_at
from public.family_invites fi
left join public.profiles inviter on inviter.id = fi.inviter_id
left join public.profiles invited on invited.id = fi.used_by
where fi.used_by is not null
order by fi.used_at desc nulls last, fi.created_at desc;

-- 2) Réparation : tout profil ayant utilisé un coupon devient bien un profil Famille.
-- Les admins/super admins ne sont jamais convertis.
update public.profiles p
set
  role = case
    when p.role in ('admin', 'super_admin') then p.role
    else 'family'
  end,
  player_scope = 'family',
  invited_by = coalesce(p.invited_by, fi.inviter_id),
  office_team_id = coalesce(p.office_team_id, fi.office_team_id),
  is_active = coalesce(p.is_active, true),
  can_chat = coalesce(p.can_chat, true),
  can_predict = coalesce(p.can_predict, true),
  updated_at = now()
from public.family_invites fi
where fi.used_by = p.id
  and fi.used_by is not null
  and coalesce(p.role, 'user') not in ('admin', 'super_admin');

-- 3) Vérification après réparation.
select
  'family_invited_profiles_repaired' as check_name,
  count(*) as repaired_or_already_ok
from public.family_invites fi
join public.profiles p on p.id = fi.used_by
where fi.used_by is not null
  and (p.role = 'family' or p.player_scope = 'family');
