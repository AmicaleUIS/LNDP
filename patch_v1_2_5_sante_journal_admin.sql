-- ============================================================
-- LE NID DES PRONOS — PATCH V1.2.5
-- Santé du Nid + Journal super admin
-- À lancer après patch_v1_2_4_module_preparation.sql.
-- ============================================================

-- 1) Journal des actions sensibles.
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  actor_pseudo text,
  action text not null,
  category text not null default 'system',
  details jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_category_idx
  on public.admin_audit_logs (category);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "Super admin can read audit logs" on public.admin_audit_logs;
create policy "Super admin can read audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.is_super_admin());

-- 2) Fonction centrale de journalisation.
create or replace function public.admin_log_action(
  p_action text,
  p_category text default 'system',
  p_details jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  new_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  select * into actor
  from public.profiles
  where id = auth.uid();

  insert into public.admin_audit_logs (
    actor_id,
    actor_email,
    actor_pseudo,
    action,
    category,
    details,
    metadata
  )
  values (
    auth.uid(),
    actor.email,
    actor.pseudo,
    p_action,
    coalesce(nullif(p_category, ''), 'system'),
    coalesce(p_details, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.admin_log_action(text, text, jsonb, jsonb) to authenticated;

-- 3) Santé du Nid.
create or replace function public.admin_get_health_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_users int := 0;
  family_users int := 0;
  official_matches int := 0;
  prep_matches int := 0;
  matches_without_date int := 0;
  matches_without_team int := 0;
  finished_without_score int := 0;
  available_invites int := 0;
  backups_count int := 0;
  last_backup_at timestamptz;
  badges_count int := 0;
  visible_chat_messages int := 0;
  prep_enabled boolean := true;
  family_enabled boolean := false;
  setting_value jsonb;
  checks jsonb := '[]'::jsonb;
  danger_count int := 0;
  warning_count int := 0;
  overall text := 'ok';
  message text := 'Le nid est stable.';
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  select count(*)::int into active_users
  from public.profiles
  where is_active = true
    and coalesce(is_banned, false) = false
    and coalesce(player_scope, 'uis') <> 'family'
    and role <> 'family';

  select count(*)::int into family_users
  from public.profiles
  where is_active = true
    and coalesce(is_banned, false) = false
    and (coalesce(player_scope, 'uis') = 'family' or role = 'family');

  select count(*)::int into official_matches
  from public.matches
  where coalesce(is_test_match, false) = false;

  select count(*)::int into prep_matches
  from public.matches
  where coalesce(is_test_match, false) = true;

  select count(*)::int into matches_without_date
  from public.matches
  where kickoff_at is null;

  select count(*)::int into matches_without_team
  from public.matches
  where home_team_id is null or away_team_id is null;

  select count(*)::int into finished_without_score
  from public.matches
  where status = 'finished'
    and (home_score is null or away_score is null);

  select count(*)::int into available_invites
  from public.family_invites
  where used_by is null
    and used_at is null
    and revoked_at is null
    and expires_at > now();

  select count(*)::int, max(created_at)
  into backups_count, last_backup_at
  from public.app_backups;

  select count(*)::int into badges_count
  from public.user_badges;

  select count(*)::int into visible_chat_messages
  from public.team_chat_messages
  where coalesce(is_hidden, false) = false;

  select value into setting_value
  from public.app_settings
  where key = 'preparation_module_enabled';

  prep_enabled := case
    when setting_value is null then true
    when jsonb_typeof(setting_value) = 'boolean' then (setting_value::text)::boolean
    when jsonb_typeof(setting_value) = 'string' then trim(both '"' from setting_value::text) = 'true'
    when jsonb_typeof(setting_value) = 'object' then coalesce((setting_value->>'enabled')::boolean, true)
    else true
  end;

  select value into setting_value
  from public.app_settings
  where key = 'family_mode_enabled';

  family_enabled := case
    when setting_value is null then false
    when jsonb_typeof(setting_value) = 'boolean' then (setting_value::text)::boolean
    when jsonb_typeof(setting_value) = 'string' then trim(both '"' from setting_value::text) = 'true'
    when jsonb_typeof(setting_value) = 'object' then coalesce((setting_value->>'enabled')::boolean, false)
    else false
  end;

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', case when active_users > 0 then 'ok' else 'warning' end,
    'title', 'Joueurs actifs',
    'message', active_users || ' joueur(s) UIS actif(s).'
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', case when official_matches > 0 then 'ok' else 'danger' end,
    'title', 'Matchs officiels',
    'message', official_matches || ' match(s) officiel(s) en base.'
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', case when matches_without_date = 0 then 'ok' else 'warning' end,
    'title', 'Dates des matchs',
    'message', case when matches_without_date = 0 then 'Tous les matchs ont une date.' else matches_without_date || ' match(s) sans date.' end
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', case when matches_without_team = 0 then 'ok' else 'danger' end,
    'title', 'Équipes des matchs',
    'message', case when matches_without_team = 0 then 'Tous les matchs ont leurs deux équipes.' else matches_without_team || ' match(s) sans équipe complète.' end
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', case when finished_without_score = 0 then 'ok' else 'danger' end,
    'title', 'Scores terminés',
    'message', case when finished_without_score = 0 then 'Aucun match terminé sans score.' else finished_without_score || ' match(s) terminé(s) sans score complet.' end
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', case when backups_count > 0 then 'ok' else 'warning' end,
    'title', 'Sauvegardes',
    'message', case when backups_count > 0 then backups_count || ' sauvegarde(s), dernière le ' || to_char(last_backup_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI') else 'Aucune sauvegarde trouvée.' end
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', 'ok',
    'title', 'Module préparation',
    'message', case when prep_enabled then 'Module préparation visible.' else 'Module préparation masqué. Les badges restent disponibles.' end
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', 'ok',
    'title', 'Mode Famille',
    'message', case when family_enabled then 'Inscriptions Famille ouvertes.' else 'Inscriptions Famille fermées.' end
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', case when available_invites <= 10 then 'ok' else 'warning' end,
    'title', 'Coupons Famille disponibles',
    'message', available_invites || ' coupon(s) encore disponible(s).'
  ));

  select count(*)::int
  into danger_count
  from jsonb_array_elements(checks) as item
  where item->>'level' = 'danger';

  select count(*)::int
  into warning_count
  from jsonb_array_elements(checks) as item
  where item->>'level' = 'warning';

  if danger_count > 0 then
    overall := 'danger';
    message := danger_count || ' problème(s) à corriger dans le Nid.';
  elsif warning_count > 0 then
    overall := 'warning';
    message := warning_count || ' point(s) à surveiller. Rien ne sent encore le hibou brûlé.';
  end if;

  return jsonb_build_object(
    'checked_at', now(),
    'overall', overall,
    'message', message,
    'summary', jsonb_build_object(
      'active_users', active_users,
      'family_users', family_users,
      'official_matches', official_matches,
      'preparation_matches', prep_matches,
      'preparation_module_enabled', prep_enabled,
      'family_mode_enabled', family_enabled,
      'available_family_invites', available_invites,
      'backups_count', backups_count,
      'last_backup_at', last_backup_at,
      'badges_count', badges_count,
      'visible_chat_messages', visible_chat_messages,
      'matches_without_date', matches_without_date,
      'matches_without_team', matches_without_team,
      'finished_without_score', finished_without_score
    ),
    'checks', checks
  );
end;
$$;

grant execute on function public.admin_get_health_snapshot() to authenticated;

-- 4) Wrappers journalisés pour les actions déjà utilisées par l’admin.
-- Ces fonctions remplacent les versions précédentes en gardant les mêmes signatures.

create or replace function public.admin_set_preparation_module(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('preparation_module_enabled', to_jsonb(coalesce(p_enabled, true)), now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  perform public.admin_log_action(
    'set_preparation_module',
    'preparation',
    jsonb_build_object('enabled', coalesce(p_enabled, true))
  );

  return jsonb_build_object('preparation_module_enabled', coalesce(p_enabled, true));
end;
$$;

grant execute on function public.admin_set_preparation_module(boolean) to authenticated;

create or replace function public.admin_set_family_mode(p_enabled boolean)
returns jsonb
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

  perform public.admin_log_action(
    'set_family_mode',
    'family',
    jsonb_build_object('enabled', coalesce(p_enabled, false))
  );

  return jsonb_build_object('family_mode_enabled', coalesce(p_enabled, false));
end;
$$;

grant execute on function public.admin_set_family_mode(boolean) to authenticated;

-- Journalisation de création de coupon direct.
create or replace function public.admin_create_family_invite(
  p_office_team_id uuid,
  p_valid_days int default 7
)
returns table(code text, expires_at timestamptz, office_team_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  valid_days int := greatest(1, least(coalesce(p_valid_days, 7), 30));
  new_code text;
  new_expires_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  if not exists (select 1 from public.office_teams where id = p_office_team_id) then
    raise exception 'Team introuvable';
  end if;

  new_code := public.generate_family_invite_code();
  new_expires_at := now() + make_interval(days => valid_days);

  insert into public.family_invites (code, inviter_id, office_team_id, expires_at)
  values (new_code, auth.uid(), p_office_team_id, new_expires_at);

  perform public.admin_log_action(
    'create_family_invite',
    'family',
    jsonb_build_object('code', new_code, 'office_team_id', p_office_team_id)
  );

  return query select new_code, new_expires_at, p_office_team_id;
end;
$$;

grant execute on function public.admin_create_family_invite(uuid, int) to authenticated;

-- Journalisation de coupon bonus.
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

  perform public.admin_log_action(
    'create_bonus_family_invite',
    'family',
    jsonb_build_object('code', new_code, 'inviter_id', target_player.id, 'inviter_pseudo', target_player.pseudo, 'office_team_id', target_team_id)
  );

  return query select new_code, new_expires_at, target_team_id, target_player.id;
end;
$$;

grant execute on function public.admin_create_bonus_family_invite(uuid, uuid, int) to authenticated;

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

  perform public.admin_log_action(
    'reset_family_invite',
    'family',
    jsonb_build_object('invite_id', p_invite_id, 'code', invite_row.code, 'previous_used_by', invite_row.used_by)
  );

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

-- Reset préparation journalisé.
create or replace function public.reset_preparation_scores_secure()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès refusé';
  end if;

  update public.matches
  set status = 'scheduled',
      home_score = null,
      away_score = null,
      winner_team_id = null
  where coalesce(is_test_match, false) = true;

  delete from public.prediction_points pp
  using public.matches m
  where pp.match_id = m.id
    and coalesce(m.is_test_match, false) = true;

  if public.is_super_admin() then
    perform public.admin_log_action('reset_preparation_scores', 'preparation', '{}'::jsonb);
  end if;
end;
$$;

grant execute on function public.reset_preparation_scores_secure() to authenticated;

-- Recalculs journalisés.
create or replace function public.recalc_all_points()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row record;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé';
  end if;

  for match_row in
    select id
    from public.matches
    where status = 'finished'
  loop
    perform public.recalc_match_points(match_row.id);
  end loop;

  if public.is_super_admin() then
    perform public.admin_log_action('recalc_all_points', 'score', '{}'::jsonb);
  end if;
end;
$$;

grant execute on function public.recalc_all_points() to authenticated;

-- 5) Journalisation légère côté front pour les cas où une ancienne fonction SQL n’est pas remplacée.
-- Tu peux aussi appeler admin_log_action directement depuis l’éditeur SQL si besoin.
