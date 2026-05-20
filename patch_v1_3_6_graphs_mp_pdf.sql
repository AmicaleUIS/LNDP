-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.6
-- Graphs intégrés + progression accueil + messages privés + PDF print
-- ============================================================

-- 1) Réglage : la progression de l’accueil inclut ou non les matchs test.
insert into public.app_settings (key, value, updated_at)
values ('home_progress_include_test_matches', 'false'::jsonb, now())
on conflict (key) do nothing;

create or replace function public.admin_set_home_progress_test_matches(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('home_progress_include_test_matches', to_jsonb(coalesce(p_enabled, false)), now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  begin
    perform public.admin_log_action(
      'set_home_progress_test_matches',
      'preparation',
      jsonb_build_object('enabled', coalesce(p_enabled, false))
    );
  exception when undefined_function then
    null;
  end;
end;
$$;

grant execute on function public.admin_set_home_progress_test_matches(boolean) to authenticated;

-- 2) Messages privés dans le chat du Nid.
alter table public.team_chat_messages
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null;

create index if not exists team_chat_messages_private_recipient_created_idx
  on public.team_chat_messages(recipient_id, created_at desc)
  where scope = 'private';

alter table public.team_chat_messages
  drop constraint if exists team_chat_messages_scope_check,
  drop constraint if exists team_chat_messages_scope_team_check;

alter table public.team_chat_messages
  add constraint team_chat_messages_scope_check
  check (scope in ('global', 'team', 'family_global', 'family_team', 'private'));

alter table public.team_chat_messages
  add constraint team_chat_messages_scope_team_check
  check (
    (scope in ('global', 'family_global') and office_team_id is null and recipient_id is null)
    or
    (scope in ('team', 'family_team') and office_team_id is not null and recipient_id is null)
    or
    (scope = 'private' and office_team_id is null and recipient_id is not null and recipient_id <> user_id)
  );

-- Normalisation/validation des messages, y compris MP.
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
  v_recipient_active boolean;
  v_recipient_banned boolean;
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

  if new.scope not in ('global', 'team', 'family_global', 'family_team', 'private') then
    new.scope := 'global';
  end if;

  if new.scope = 'private' then
    if new.recipient_id is null then
      raise exception 'Choisis un destinataire pour le MP.';
    end if;

    if new.recipient_id = auth.uid() then
      raise exception 'Impossible de t’envoyer un MP à toi-même.';
    end if;

    select coalesce(p.is_active, false), coalesce(p.is_banned, false)
    into v_recipient_active, v_recipient_banned
    from public.profiles p
    where p.id = new.recipient_id;

    if not coalesce(v_recipient_active, false) or coalesce(v_recipient_banned, false) then
      raise exception 'Destinataire indisponible.';
    end if;

    new.office_team_id := null;
    return new;
  end if;

  new.recipient_id := null;

  if v_role = 'family' or v_scope = 'family' then
    if new.scope not in ('family_global', 'family_team') then
      raise exception 'Les comptes Famille écrivent dans les salons Famille ou en MP uniquement.';
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

drop policy if exists team_chat_messages_insert on public.team_chat_messages;
create policy team_chat_messages_insert
on public.team_chat_messages
for insert
to authenticated
with check (
  public.is_active_profile(auth.uid())
  and user_id = auth.uid()
  and scope in ('global', 'team', 'family_global', 'family_team', 'private')
);

-- Vue utilisateur avec visibilité des MP.
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
  m.recipient_id,
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
  rp.pseudo as recipient_pseudo,
  rp.avatar_key as recipient_avatar_key,
  rp.badge_shape as recipient_badge_shape,
  rp.badge_color as recipient_badge_color,
  coalesce((
    select jsonb_agg(jsonb_build_object('reaction_key', grouped.reaction_key, 'count', grouped.reaction_count) order by grouped.reaction_key)
    from (
      select r.reaction_key, count(*)::int as reaction_count
      from public.team_chat_reactions r
      join public.profiles rprof on rprof.id = r.user_id
      where r.message_id = m.id
        and rprof.is_active = true
        and coalesce(rprof.is_banned, false) = false
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
left join public.profiles rp on rp.id = m.recipient_id
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
    or (m.scope = 'private' and (m.user_id = auth.uid() or m.recipient_id = auth.uid()))
  );

grant select on public.v_team_chat_messages to authenticated;

create or replace view public.v_admin_team_chat_messages
as
select
  m.id,
  m.user_id,
  m.scope,
  m.office_team_id,
  m.recipient_id,
  m.body,
  m.created_at,
  m.updated_at,
  m.deleted_at,
  m.deleted_by,
  m.deleted_reason,
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
  rp.pseudo as recipient_pseudo
from public.team_chat_messages m
join public.profiles p on p.id = m.user_id
left join public.profiles rp on rp.id = m.recipient_id
left join public.office_teams author_team on author_team.id = p.office_team_id
left join public.office_teams target_team on target_team.id = m.office_team_id
where public.is_super_admin_profile(auth.uid());

grant select on public.v_admin_team_chat_messages to authenticated;

-- 3) Impossible de bloquer un admin ou super admin.
create or replace function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_blocked_id = auth.uid() then
    raise exception 'Impossible de te bloquer toi-même.';
  end if;

  select coalesce(role::text, 'user')
  into v_role
  from public.profiles
  where id = p_blocked_id;

  if v_role in ('admin', 'super_admin') then
    raise exception 'Impossible de bloquer un admin ou super admin.';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

-- Changelog.
insert into public.app_settings (key, value, updated_at)
values (
  'changelog_1_3_6',
  '{"version":"1.3.6","title":"Graphs intégrés + accueil nettoyé + messages privés","changes":["4 graphs d’évolution dans leurs classements respectifs","Boutons Jour/Semaine corrigés","Accueil sans cartouche pronos manquants","Progression accueil réglable avec ou sans matchs test","Tuiles classement sans bouton Voir et flèche recentrée","Messages privés depuis l’annuaire et les messages","Impossible de bloquer un admin ou super admin","Bloc charger une sauvegarde compact","Impression PDF : fonds forcés côté CSS"]}'::jsonb,
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

select
  'patch_v1_3_6_ready' as check_name,
  to_regprocedure('public.admin_set_home_progress_test_matches(boolean)') is not null as home_progress_function_ok,
  to_regprocedure('public.block_user(uuid)') is not null as block_user_function_ok;
