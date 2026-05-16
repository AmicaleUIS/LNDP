-- ============================================================
-- LE NID DES PRONOS — PATCH V1.1.0
-- Mode Famille + rôle super_admin + admin limité matchs
-- ============================================================
-- À lancer dans Supabase > SQL Editor avant de publier les fichiers V1.1.0.

-- 0) Paramètres app si absents
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.app_settings to authenticated;

insert into public.app_settings (key, value, updated_at)
values ('family_mode_enabled', 'false'::jsonb, now())
on conflict (key) do nothing;

-- 1) Profils : nouveaux rôles / droits / mode famille
alter table public.profiles
  add column if not exists player_scope text not null default 'uis',
  add column if not exists show_family_players boolean not null default false,
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists is_banned boolean not null default false,
  add column if not exists can_chat boolean not null default true,
  add column if not exists can_predict boolean not null default true,
  add column if not exists can_change_avatar boolean not null default true,
  add column if not exists can_change_pseudo boolean not null default true;

-- On élargit les contraintes si elles existent.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
  if exists (select 1 from pg_constraint where conname = 'profiles_player_scope_check') then
    alter table public.profiles drop constraint profiles_player_scope_check;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('super_admin', 'admin', 'user', 'family')),
  add constraint profiles_player_scope_check check (player_scope in ('uis', 'family'));

-- Sécurité anti-blocage : les admins actuels deviennent super_admin.
-- Tu pourras ensuite redescendre certains comptes en admin matchs depuis l'admin.
update public.profiles
set role = 'super_admin', player_scope = 'uis'
where role = 'admin';

-- Les comptes déjà marqués family restent cohérents.
update public.profiles
set role = 'family', player_scope = 'family'
where player_scope = 'family' or role = 'family';

-- Helpers droits
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

grant execute on function public.current_profile_role() to authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and is_active = true
      and coalesce(is_banned, false) = false
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- Compatibilité avec les anciens patchs : admin + super_admin peuvent saisir/recalculer les matchs.
-- L'interface V1.1.0 masque les zones sensibles aux admins simples.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
      and is_active = true
      and coalesce(is_banned, false) = false
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Pour la modération avancée / vues admin chat, on réserve au super_admin.
create or replace function public.is_admin_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id
      and role = 'super_admin'
      and is_active = true
      and coalesce(is_banned, false) = false
  );
$$;

grant execute on function public.is_admin_profile(uuid) to authenticated;

-- Si ton trigger existe déjà, on le rend compatible avec super_admin.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / service role : autorisé.
  if auth.uid() is null then
    return new;
  end if;

  -- Un super admin peut modifier les rôles.
  if public.is_super_admin() then
    return new;
  end if;

  -- Un utilisateur ne peut pas s'élever lui-même.
  if old.role is distinct from new.role or old.player_scope is distinct from new.player_scope then
    raise exception 'Modification de rôle non autorisée';
  end if;

  return new;
end;
$$;

-- Team famille figée après utilisation du code d'invitation.
create or replace function public.prevent_family_team_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.player_scope = 'family'
     and new.player_scope = 'family'
     and old.office_team_id is distinct from new.office_team_id then
    raise exception 'La team Famille est fixée par l invitation';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_family_team_change on public.profiles;
create trigger prevent_family_team_change
before update on public.profiles
for each row
execute function public.prevent_family_team_change();

-- 2) Invitations Famille
create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  inviter_id uuid references public.profiles(id) on delete set null,
  office_team_id uuid not null references public.office_teams(id) on delete restrict,
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists family_invites_inviter_idx on public.family_invites(inviter_id);
create index if not exists family_invites_code_idx on public.family_invites(lower(code));

grant select on public.family_invites to authenticated;

alter table public.family_invites enable row level security;

drop policy if exists family_invites_select_own_or_super on public.family_invites;
create policy family_invites_select_own_or_super
on public.family_invites
for select
to authenticated
using (inviter_id = auth.uid() or used_by = auth.uid() or public.is_super_admin());

-- Code phrase type jeu, unique et lisible.
create or replace function public.generate_family_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  subjects text[] := array['Hibou', 'Chouette', 'Buse', 'Grand Duc', 'Penalty', 'Perchoir', 'Grimoire', 'Nid'];
  endings text[] := array['de la honte', 'du vestiaire', 'du penalty', 'du grimoire', 'de la VAR', 'du bus bloqué', 'du pronostic', 'du perchoir'];
  candidate text;
  guard int := 0;
begin
  loop
    guard := guard + 1;
    candidate := subjects[1 + floor(random() * array_length(subjects, 1))::int]
      || ' '
      || endings[1 + floor(random() * array_length(endings, 1))::int]
      || ' '
      || lpad((floor(random() * 90 + 10))::int::text, 2, '0');

    exit when not exists (select 1 from public.family_invites where lower(code) = lower(candidate));
    if guard > 50 then
      candidate := 'Hibou du nid ' || substr(gen_random_uuid()::text, 1, 4);
      exit;
    end if;
  end loop;

  return candidate;
end;
$$;

grant execute on function public.generate_family_invite_code() to authenticated;

create or replace function public.create_family_invite()
returns table(code text, expires_at timestamptz, office_team_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  enabled boolean;
  invite_count int;
  new_code text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.player_scope <> 'uis' or me.role = 'family' then
    raise exception 'Seuls les joueurs UIS peuvent créer une invitation Famille';
  end if;
  if me.office_team_id is null then
    raise exception 'Choisis d abord ta team avant de créer une invitation';
  end if;

  select coalesce((value #>> '{}')::boolean, false) into enabled
  from public.app_settings where key = 'family_mode_enabled';
  if not coalesce(enabled, false) then
    raise exception 'Le mode Famille est fermé pour le moment';
  end if;

  select count(*) into invite_count
  from public.family_invites
  where inviter_id = me.id and revoked_at is null;
  if invite_count >= 3 then
    raise exception 'Tu as déjà généré tes 3 invitations Famille';
  end if;

  new_code := public.generate_family_invite_code();
  insert into public.family_invites (code, inviter_id, office_team_id, expires_at)
  values (new_code, me.id, me.office_team_id, now() + interval '7 days');

  return query select new_code, now() + interval '7 days', me.office_team_id;
end;
$$;

grant execute on function public.create_family_invite() to authenticated;

create or replace function public.admin_create_family_invite(p_office_team_id uuid)
returns table(code text, expires_at timestamptz, office_team_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;
  if not exists (select 1 from public.office_teams where id = p_office_team_id) then
    raise exception 'Team introuvable';
  end if;

  new_code := public.generate_family_invite_code();
  insert into public.family_invites (code, inviter_id, office_team_id, expires_at)
  values (new_code, auth.uid(), p_office_team_id, now() + interval '7 days');

  return query select new_code, now() + interval '7 days', p_office_team_id;
end;
$$;

grant execute on function public.admin_create_family_invite(uuid) to authenticated;

create or replace function public.redeem_family_invite(p_code text)
returns table(office_team_id uuid, inviter_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.family_invites%rowtype;
  enabled boolean;
  meta jsonb;
  nickname text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  select coalesce((value #>> '{}')::boolean, false) into enabled
  from public.app_settings where key = 'family_mode_enabled';
  if not coalesce(enabled, false) then
    raise exception 'Le mode Famille est fermé pour le moment';
  end if;

  select * into invite
  from public.family_invites
  where lower(code) = lower(trim(p_code))
  for update;

  if invite.id is null then
    raise exception 'Code Famille introuvable';
  end if;
  if invite.revoked_at is not null then
    raise exception 'Code Famille annulé';
  end if;
  if invite.used_at is not null then
    raise exception 'Code Famille déjà utilisé';
  end if;
  if invite.expires_at < now() then
    raise exception 'Code Famille expiré';
  end if;

  select raw_user_meta_data into meta from auth.users where id = auth.uid();
  nickname := nullif(trim(coalesce(meta->>'pseudo', '')), '');

  update public.profiles
  set role = 'family',
      player_scope = 'family',
      invited_by = invite.inviter_id,
      office_team_id = invite.office_team_id,
      pseudo = coalesce(nickname, pseudo),
      profile_setup_done = true,
      show_family_players = true
  where id = auth.uid();

  update public.family_invites
  set used_by = auth.uid(), used_at = now()
  where id = invite.id;

  return query select invite.office_team_id, invite.inviter_id;
end;
$$;

grant execute on function public.redeem_family_invite(text) to authenticated;

-- 3) Réglages et droits admin
create or replace function public.admin_set_family_mode(p_enabled boolean)
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
  values ('family_mode_enabled', to_jsonb(coalesce(p_enabled, false)), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
end;
$$;

grant execute on function public.admin_set_family_mode(boolean) to authenticated;

create or replace function public.set_show_family_players(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set show_family_players = coalesce(p_enabled, false)
  where id = auth.uid();
end;
$$;

grant execute on function public.set_show_family_players(boolean) to authenticated;

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
  next_role text := coalesce(p_role, 'user');
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  if next_role not in ('super_admin', 'admin', 'user', 'family') then
    raise exception 'Rôle invalide';
  end if;

  update public.profiles
  set role = next_role,
      player_scope = case when next_role = 'family' then 'family' else 'uis' end,
      office_team_id = case
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

-- Accès score/matchs pour admin matchs + super_admin.
-- Ces policies s'ajoutent aux policies existantes sans casser les anciennes.
alter table public.matches enable row level security;

drop policy if exists matches_score_admin_update_v110 on public.matches;
create policy matches_score_admin_update_v110
on public.matches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists matches_score_admin_select_v110 on public.matches;
create policy matches_score_admin_select_v110
on public.matches
for select
to authenticated
using (true);

-- 4) Blocage individuel du chat côté joueur
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
on public.user_blocks
for select
to authenticated
using (blocker_id = auth.uid());

grant select on public.user_blocks to authenticated;

create or replace function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_blocked_id = auth.uid() then
    raise exception 'Tu ne peux pas te bloquer toi-même';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_blocked_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_blocks
  where blocker_id = auth.uid()
    and blocked_id = p_blocked_id;
end;
$$;

grant execute on function public.unblock_user(uuid) to authenticated;

-- Chat : expose le scope auteur pour masquer la Famille côté joueur si option désactivée.
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
  target_team.color as office_team_color
from public.team_chat_messages m
join public.profiles p on p.id = m.user_id
left join public.office_teams author_team on author_team.id = p.office_team_id
left join public.office_teams target_team on target_team.id = m.office_team_id
where p.is_active = true
  and coalesce(p.is_banned, false) = false
  and m.deleted_at is null
  and public.is_active_profile(auth.uid())
  and (
    m.scope = 'global'
    or m.office_team_id = public.current_office_team_id()
    or public.is_admin_profile(auth.uid())
  );

grant select on public.v_team_chat_messages to authenticated;

create or replace view public.v_admin_team_chat_messages
as
select
  m.id,
  m.user_id,
  m.scope,
  m.office_team_id,
  m.body,
  m.created_at,
  m.updated_at,
  m.deleted_at,
  m.deleted_by,
  m.deleted_reason,
  p.pseudo as author_pseudo,
  p.email as author_email,
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
  moderator.pseudo as deleted_by_pseudo
from public.team_chat_messages m
join public.profiles p on p.id = m.user_id
left join public.office_teams author_team on author_team.id = p.office_team_id
left join public.office_teams target_team on target_team.id = m.office_team_id
left join public.profiles moderator on moderator.id = m.deleted_by
where public.is_admin_profile(auth.uid());

grant select on public.v_admin_team_chat_messages to authenticated;

-- 5) Vues publiques enrichies / filtrage officiel
create or replace view public.v_public_profiles as
select
  p.id,
  p.pseudo,
  p.role,
  p.player_scope,
  p.show_family_players,
  p.invited_by,
  p.office_team_id,
  ot.name as office_team_name,
  ot.slug as office_team_slug,
  ot.color as office_team_color,
  ot.avatar_url as office_team_avatar_url,
  p.is_active,
  p.is_banned,
  p.created_at,
  p.avatar_key,
  p.badge_shape,
  p.badge_color,
  p.profile_setup_done,
  p.featured_badge_ids
from public.profiles p
left join public.office_teams ot on ot.id = p.office_team_id
where p.is_active = true
  and coalesce(p.is_banned, false) = false;

grant select on public.v_public_profiles to authenticated;

-- Classement officiel : uniquement UIS, jamais Famille.
create or replace view public.v_leaderboard_overall as
with match_points as (
  select
    p.id as user_id,
    coalesce(sum(pp.points_total), 0)::int as match_points,
    coalesce(sum(case when pp.is_exact_score then 1 else 0 end), 0)::int as exact_scores,
    coalesce(sum(case when pp.is_good_result then 1 else 0 end), 0)::int as good_results,
    coalesce(sum(case when pp.is_good_goal_diff then 1 else 0 end), 0)::int as good_goal_diffs,
    coalesce(sum(case when pp.is_good_qualified then 1 else 0 end), 0)::int as good_qualified,
    count(pp.id)::int as scored_matches
  from public.profiles p
  left join public.prediction_points pp on pp.user_id = p.id
  where p.is_active = true
    and coalesce(p.is_banned, false) = false
    and coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
  group by p.id
),
winner_points as (
  select
    wp.user_id,
    coalesce(sum(wp.points_total), 0)::int as winner_points,
    (array_agg(wp.predicted_team_id) filter (where wp.points_total = 100))[1] as winner_team_id,
    max(wp.predicted_team_name) filter (where wp.points_total = 100) as winner_team_name
  from public.v_winner_predictions wp
  join public.profiles p on p.id = wp.user_id
  where coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
  group by wp.user_id
),
base as (
  select
    p.id as user_id,
    p.pseudo,
    p.role,
    p.player_scope,
    p.office_team_id,
    ot.name as office_team_name,
    ot.slug as office_team_slug,
    ot.color as office_team_color,
    (coalesce(mp.match_points, 0) + coalesce(wp.winner_points, 0))::int as total_points,
    coalesce(mp.exact_scores, 0)::int as exact_scores,
    coalesce(mp.good_results, 0)::int as good_results,
    coalesce(mp.good_goal_diffs, 0)::int as good_goal_diffs,
    coalesce(mp.good_qualified, 0)::int as good_qualified,
    coalesce(mp.scored_matches, 0)::int as scored_matches,
    coalesce(mp.match_points, 0)::int as match_points,
    coalesce(wp.winner_points, 0)::int as winner_points,
    wp.winner_team_id,
    wp.winner_team_name,
    p.avatar_key,
    p.badge_shape,
    p.badge_color,
    p.featured_badge_ids
  from public.profiles p
  left join public.office_teams ot on ot.id = p.office_team_id
  left join match_points mp on mp.user_id = p.id
  left join winner_points wp on wp.user_id = p.id
  where p.is_active = true
    and coalesce(p.is_banned, false) = false
    and coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
)
select
  rank() over (
    order by
      total_points desc,
      exact_scores desc,
      good_results desc,
      good_goal_diffs desc,
      lower(pseudo) asc
  )::int as rank,
  *
from base;

grant select on public.v_leaderboard_overall to authenticated;

-- Mini-record Greffier du grimoire : uniquement UIS.
create or replace view public.v_mini_record_prediction_counts as
with active_competition as (
  select id from public.competitions where is_active = true limit 1
), filtered_predictions as (
  select
    pr.user_id,
    m.competition_id,
    coalesce(pr.locked_at, pr.updated_at, pr.created_at) as prediction_activity_at
  from public.predictions pr
  join public.matches m on m.id = pr.match_id
  join public.profiles p on p.id = pr.user_id
  cross join active_competition ac
  where m.competition_id = ac.id
    and coalesce(m.status::text, '') not in ('cancelled', 'postponed')
    and p.is_active = true
    and coalesce(p.is_banned, false) = false
    and coalesce(p.player_scope, 'uis') = 'uis'
    and p.role <> 'family'
), user_counts as (
  select
    fp.user_id,
    fp.competition_id,
    count(*)::int as prediction_count,
    min(fp.prediction_activity_at) as first_prediction_at,
    max(fp.prediction_activity_at) as latest_prediction_at,
    max(fp.prediction_activity_at) as record_unlocked_at
  from filtered_predictions fp
  group by fp.user_id, fp.competition_id
)
select
  p.id as user_id,
  p.pseudo,
  p.office_team_id,
  ot.name as office_team_name,
  ac.id as competition_id,
  coalesce(uc.prediction_count, 0)::int as prediction_count,
  uc.first_prediction_at,
  uc.latest_prediction_at,
  uc.record_unlocked_at
from public.profiles p
cross join active_competition ac
left join public.office_teams ot on ot.id = p.office_team_id
left join user_counts uc on uc.user_id = p.id and uc.competition_id = ac.id
where p.is_active = true
  and coalesce(p.is_banned, false) = false
  and coalesce(p.player_scope, 'uis') = 'uis'
  and p.role <> 'family';

grant select on public.v_mini_record_prediction_counts to authenticated;

insert into public.app_settings (key, value, updated_at)
values ('changelog_1_1_0', '{"version":"1.1.0","title":"Mode Famille et Super admin","changes":["Ajout du rôle super_admin","Admin limité à la gestion des matchs","Ajout du mode Famille par invitation","Les membres Famille sont hors classement officiel et hors mini-records","Blocage individuel des messages"]}'::jsonb, now())
on conflict (key) do update set value = excluded.value, updated_at = now();
