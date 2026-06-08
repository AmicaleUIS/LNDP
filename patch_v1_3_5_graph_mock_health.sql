-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.5
-- Maquette graph + santé lancement sécurisé
-- ============================================================

-- Réglages par défaut : désactivés.
insert into public.app_settings (key, value, updated_at)
values
  ('graph_preview_test_matches_enabled', 'false'::jsonb, now()),
  ('graph_mock_preview_enabled', 'false'::jsonb, now())
on conflict (key) do nothing;

-- Fonction V1.3.4 incluse ici aussi pour éviter les oublis de patch.
create or replace function public.admin_set_graph_preview_test_matches(p_enabled boolean)
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
  values ('graph_preview_test_matches_enabled', to_jsonb(coalesce(p_enabled, false)), now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  begin
    perform public.admin_log_action(
      'set_graph_preview_test_matches',
      'preparation',
      jsonb_build_object('enabled', coalesce(p_enabled, false))
    );
  exception when undefined_function then
    null;
  end;

  return;
end;
$$;

grant execute on function public.admin_set_graph_preview_test_matches(boolean) to authenticated;

-- Nouvelle fonction V1.3.5 : maquette graph fictive, sans toucher aux données de compétition.
create or replace function public.admin_set_graph_mock_preview(p_enabled boolean)
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
  values ('graph_mock_preview_enabled', to_jsonb(coalesce(p_enabled, false)), now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  begin
    perform public.admin_log_action(
      'set_graph_mock_preview',
      'preparation',
      jsonb_build_object('enabled', coalesce(p_enabled, false))
    );
  exception when undefined_function then
    null;
  end;

  return;
end;
$$;

grant execute on function public.admin_set_graph_mock_preview(boolean) to authenticated;

-- Changelog technique.
insert into public.app_settings (key, value, updated_at)
values (
  'changelog_1_3_5',
  '{"version":"1.3.5","title":"Maquette graph + santé lancement sécurisé","changes":["Maquette graph fictive pour tester les courbes avant le premier match test","Admin sauvegardes/remise à zéro réorganisé avec zones non destructives et zones danger","Santé du Nid affiche l’état Coupe du monde sans demander de reset quand des pronos réels existent déjà","Avertissements renforcés sur les resets destructifs"]}'::jsonb,
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

select
  'patch_v1_3_5_graph_mock_health_ready' as check_name,
  to_regprocedure('public.admin_set_graph_preview_test_matches(boolean)') is not null as graph_test_function_ok,
  to_regprocedure('public.admin_set_graph_mock_preview(boolean)') is not null as graph_mock_function_ok;
