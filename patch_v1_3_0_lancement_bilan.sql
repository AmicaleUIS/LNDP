-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.0
-- Reset lancement complet + santé robuste + bilan PDF final
-- À lancer après les patchs V1.2.5/V1.2.6 si déjà installés.
-- ============================================================

-- 1) Santé du Nid robuste : ne plante pas si une table/colonne optionnelle n’existe pas.
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

  if to_regclass('public.family_invites') is not null then
    select count(*)::int into available_invites
    from public.family_invites
    where used_by is null
      and used_at is null
      and revoked_at is null
      and expires_at > now();
  end if;

  if to_regclass('public.app_backups') is not null then
    select count(*)::int, max(created_at)
    into backups_count, last_backup_at
    from public.app_backups;
  end if;

  if to_regclass('public.user_badges') is not null then
    execute 'select count(*)::int from public.user_badges'
    into badges_count;
  else
    badges_count := 0;
  end if;

  if to_regclass('public.team_chat_messages') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'team_chat_messages'
        and column_name = 'deleted_at'
    ) then
      execute 'select count(*)::int from public.team_chat_messages where deleted_at is null'
      into visible_chat_messages;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'team_chat_messages'
        and column_name = 'is_hidden'
    ) then
      execute 'select count(*)::int from public.team_chat_messages where coalesce(is_hidden, false) = false'
      into visible_chat_messages;
    else
      execute 'select count(*)::int from public.team_chat_messages'
      into visible_chat_messages;
    end if;
  end if;

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
    'message', case
      when backups_count > 0 then backups_count || ' sauvegarde(s), dernière le ' || to_char(last_backup_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI')
      else 'Aucune sauvegarde trouvée.'
    end
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

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', 'ok',
    'title', 'Badges',
    'message', case
      when to_regclass('public.user_badges') is not null then badges_count || ' badge(s) attribué(s).'
      else 'Badges calculés côté application, pas de table user_badges dédiée.'
    end
  ));

  checks := checks || jsonb_build_array(jsonb_build_object(
    'level', 'ok',
    'title', 'Chat',
    'message', visible_chat_messages || ' message(s) visibles.'
  ));

  select count(*)::int into danger_count
  from jsonb_array_elements(checks) as item
  where item->>'level' = 'danger';

  select count(*)::int into warning_count
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

-- 2) Reset lancement complet.
-- Supprime l’activité de test/jeu, mais ne touche pas aux matchs, équipes, comptes ou infos match.
create or replace function public.admin_full_launch_reset(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_prediction_points int := 0;
  deleted_predictions int := 0;
  deleted_winner_predictions int := 0;
  deleted_family_invites int := 0;
  deleted_backups int := 0;
  deleted_chat_reactions int := 0;
  deleted_chat_messages int := 0;
  deleted_user_blocks int := 0;
  deleted_audit_logs int := 0;
  reset_matches int := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  if p_confirm <> 'LANCEMENT PROPRE' then
    raise exception 'Confirmation invalide';
  end if;

  if to_regclass('public.prediction_points') is not null then
    delete from public.prediction_points where true;
    get diagnostics deleted_prediction_points = row_count;
  end if;

  if to_regclass('public.predictions') is not null then
    delete from public.predictions where true;
    get diagnostics deleted_predictions = row_count;
  end if;

  if to_regclass('public.winner_predictions') is not null then
    delete from public.winner_predictions where true;
    get diagnostics deleted_winner_predictions = row_count;
  end if;

  -- On conserve les matchs et toutes les infos modifiées (horaires, lieux, TV, équipes),
  -- mais on enlève les scores/statuts de test pour lancer propre.
  update public.matches
  set status = 'scheduled',
      home_score = null,
      away_score = null,
      winner_team_id = null
  where status <> 'scheduled'
     or home_score is not null
     or away_score is not null
     or winner_team_id is not null;
  get diagnostics reset_matches = row_count;

  if to_regclass('public.team_chat_reactions') is not null then
    delete from public.team_chat_reactions where true;
    get diagnostics deleted_chat_reactions = row_count;
  end if;

  if to_regclass('public.team_chat_messages') is not null then
    delete from public.team_chat_messages where true;
    get diagnostics deleted_chat_messages = row_count;
  end if;

  if to_regclass('public.user_blocks') is not null then
    delete from public.user_blocks where true;
    get diagnostics deleted_user_blocks = row_count;
  end if;

  if to_regclass('public.family_invites') is not null then
    delete from public.family_invites where true;
    get diagnostics deleted_family_invites = row_count;
  end if;

  if to_regclass('public.app_backups') is not null then
    delete from public.app_backups where true;
    get diagnostics deleted_backups = row_count;
  end if;

  -- Le journal est volontairement vidé pour repartir complètement propre.
  if to_regclass('public.admin_audit_logs') is not null then
    delete from public.admin_audit_logs where true;
    get diagnostics deleted_audit_logs = row_count;
  end if;

  return jsonb_build_object(
    'message', 'Application remise à blanc pour le lancement. Les matchs sont conservés, avec leurs infos modifiées, mais les scores/statuts sont remis à zéro.',
    'deleted_prediction_points', deleted_prediction_points,
    'deleted_predictions', deleted_predictions,
    'deleted_winner_predictions', deleted_winner_predictions,
    'deleted_family_invites', deleted_family_invites,
    'deleted_backups', deleted_backups,
    'deleted_chat_reactions', deleted_chat_reactions,
    'deleted_chat_messages', deleted_chat_messages,
    'deleted_user_blocks', deleted_user_blocks,
    'deleted_audit_logs', deleted_audit_logs,
    'reset_matches', reset_matches
  );
end;
$$;

grant execute on function public.admin_full_launch_reset(text) to authenticated;

-- 3) Changelog technique.
insert into public.app_settings (key, value, updated_at)
values (
  'changelog_1_3_0',
  '{"version":"1.3.0","title":"Reset lancement + bilan PDF collector","changes":["Bouton super admin ultra sécurisé pour remettre à blanc l’activité sans toucher aux matchs","Bilan PDF masqué sur mobile côté admin","Diplôme final en paysage","Fonds PDF câblés depuis assets/reports","Le PDF masque les infos Famille si le joueur ne les a pas activées","Journal admin plus lisible : les UUID joueurs sont remplacés par les pseudos quand disponibles","Crédits rendus plus Nid-compatible"]}'::jsonb,
  now()
)
on conflict (key) do update set value = excluded.value, updated_at = now();
