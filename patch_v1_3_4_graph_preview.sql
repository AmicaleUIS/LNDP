-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.4
-- Prévisualisation des graphs d’évolution avec matchs test
-- ============================================================

-- Réglage par défaut : désactivé.
insert into public.app_settings (key, value, updated_at)
values ('graph_preview_test_matches_enabled', 'false'::jsonb, now())
on conflict (key) do nothing;

-- Fonction super admin : active/désactive la prévisualisation.
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

-- Changelog technique.
insert into public.app_settings (key, value, updated_at)
values (
  'changelog_1_3_4',
  '{"version":"1.3.4","title":"Prévisualisation graphs avec matchs test","changes":["Bouton super admin pour inclure temporairement les matchs test dans les graphs d’évolution","Retour automatique aux règles normales quand le bouton est désactivé","Pastille d’information sur les graphs quand la prévisualisation est active"]}'::jsonb,
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

select
  'patch_v1_3_4_graph_preview_ready' as check_name,
  to_regprocedure('public.admin_set_graph_preview_test_matches(boolean)') is not null as function_ok;
