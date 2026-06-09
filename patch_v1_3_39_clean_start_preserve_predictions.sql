-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.39
-- Départ compétition : remettre classements/scores à zéro
-- en conservant les pronostics déjà posés.
-- ============================================================

create or replace function public.admin_clean_start_preserve_predictions(
  p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_prediction_points int := 0;
  deleted_demo_predictions int := 0;
  deleted_demo_points int := 0;
  deleted_demo_matches int := 0;
  reset_matches int := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  if p_confirm <> 'DEPART PROPRE' then
    raise exception 'Confirmation invalide';
  end if;

  -- 1) Supprimer tous les points calculés : c’est ce qui alimente les classements.
  if to_regclass('public.prediction_points') is not null then
    delete from public.prediction_points where true;
    get diagnostics deleted_prediction_points = row_count;
  end if;

  -- 2) Supprimer proprement le labo live et ses pronos/points éventuels.
  if to_regclass('public.matches') is not null then
    if to_regclass('public.predictions') is not null then
      delete from public.predictions p
      using public.matches m
      where p.match_id = m.id
        and (m.api_match_id = -133000 or lower(coalesce(m.test_match_label, '')) like '%labo live%');
      get diagnostics deleted_demo_predictions = row_count;
    end if;

    if to_regclass('public.prediction_points') is not null then
      delete from public.prediction_points pp
      using public.matches m
      where pp.match_id = m.id
        and (m.api_match_id = -133000 or lower(coalesce(m.test_match_label, '')) like '%labo live%');
      get diagnostics deleted_demo_points = row_count;
    end if;

    delete from public.matches
    where api_match_id = -133000
       or lower(coalesce(test_match_label, '')) like '%labo live%';
    get diagnostics deleted_demo_matches = row_count;

    -- 3) Garder les infos matchs, mais remettre scores/statuts à zéro.
    update public.matches
    set status = 'scheduled'::public.match_status,
        home_score = null,
        away_score = null,
        winner_team_id = null,
        updated_at = now()
    where status <> 'scheduled'::public.match_status
       or home_score is not null
       or away_score is not null
       or winner_team_id is not null;
    get diagnostics reset_matches = row_count;
  end if;

  -- 4) Couper les modules de test/prévisualisation pour un lancement propre.
  if to_regclass('public.app_settings') is not null then
    insert into public.app_settings (key, value, updated_at)
    values
      ('preparation_module_enabled', 'false'::jsonb, now()),
      ('graph_preview_test_matches_enabled', 'false'::jsonb, now()),
      ('graph_mock_preview_enabled', 'false'::jsonb, now()),
      ('home_progress_include_test_matches', 'false'::jsonb, now()),
      ('live_demo_match_enabled', 'false'::jsonb, now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
  end if;

  perform public.admin_log_action(
    'clean_start_preserve_predictions',
    'reset',
    jsonb_build_object(
      'deleted_prediction_points', deleted_prediction_points,
      'deleted_demo_predictions', deleted_demo_predictions,
      'deleted_demo_points', deleted_demo_points,
      'deleted_demo_matches', deleted_demo_matches,
      'reset_matches', reset_matches,
      'predictions_preserved', true,
      'winner_predictions_preserved', true
    )
  );

  return jsonb_build_object(
    'message', 'Classements remis à zéro. Les pronostics joueurs et choix champion sont conservés.',
    'deleted_prediction_points', deleted_prediction_points,
    'deleted_demo_predictions', deleted_demo_predictions,
    'deleted_demo_points', deleted_demo_points,
    'deleted_demo_matches', deleted_demo_matches,
    'reset_matches', reset_matches,
    'predictions_preserved', true,
    'winner_predictions_preserved', true
  );
end;
$$;

grant execute on function public.admin_clean_start_preserve_predictions(text) to authenticated;

select
  'patch_v1_3_39_ready' as check_name,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_clean_start_preserve_predictions') as function_exists;
