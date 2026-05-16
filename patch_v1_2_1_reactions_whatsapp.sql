-- ============================================================
-- LE NID DES PRONOS — PATCH V1.2.1
-- Réactions PNG façon WhatsApp : détail des personnes par réaction
-- ============================================================

create or replace function public.get_team_chat_reaction_details(
  p_message_id uuid
)
returns table (
  reaction_key text,
  user_id uuid,
  pseudo text,
  avatar_key text,
  badge_shape text,
  badge_color text,
  office_team_id uuid,
  office_team_name text,
  office_team_slug text,
  office_team_color text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    r.reaction_key,
    r.user_id,
    p.pseudo,
    p.avatar_key,
    p.badge_shape,
    p.badge_color,
    p.office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    ot.color as office_team_color,
    r.created_at
  from public.team_chat_reactions r
  join public.profiles p on p.id = r.user_id
  left join public.office_teams ot on ot.id = p.office_team_id
  where r.message_id = p_message_id
    -- Sécurité : on ne renvoie le détail que si le message est visible par l'utilisateur connecté.
    and exists (
      select 1
      from public.v_team_chat_messages visible_message
      where visible_message.id = p_message_id
    )
    and coalesce(p.is_active, false) = true
    and coalesce(p.is_banned, false) = false
    and not exists (
      select 1
      from public.user_blocks b
      where b.blocker_id = auth.uid()
        and b.blocked_id = r.user_id
    )
  order by r.reaction_key asc, r.created_at asc;
$$;

grant execute on function public.get_team_chat_reaction_details(uuid) to authenticated;
