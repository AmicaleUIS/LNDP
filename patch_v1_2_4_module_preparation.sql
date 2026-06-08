-- ============================================================
-- LE NID DES PRONOS — PATCH V1.2.4
-- Super admin : activation/désactivation du module préparation
-- À lancer après patch_v1_2_3_coupons_famille_super_admin.sql.
-- ============================================================

-- Réglage global : true par défaut pour garder le comportement existant.
insert into public.app_settings (key, value, updated_at)
values ('preparation_module_enabled', 'true'::jsonb, now())
on conflict (key) do nothing;

-- Le super admin peut masquer/réactiver le module préparation côté interface.
-- Cela ne supprime aucun match ni prono : on masque seulement l'affichage.
create or replace function public.admin_set_preparation_module(p_enabled boolean)
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
  values ('preparation_module_enabled', to_jsonb(coalesce(p_enabled, true)), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
end;
$$;

grant execute on function public.admin_set_preparation_module(boolean) to authenticated;

-- Historique technique visible si besoin depuis app_settings.
insert into public.app_settings (key, value, updated_at)
values (
  'changelog_1_2_4',
  '{"version":"1.2.4","title":"Module préparation masquable","changes":["Bouton super admin pour masquer ou réactiver les matchs de préparation","Les règles et classements par phase liés à la préparation sont masqués quand le module est désactivé","Les deux badges de préparation restent visibles dans les exploits","La barre admin desktop affiche les icônes Retour, Rafraîchir et Déconnexion"]}'::jsonb,
  now()
)
on conflict (key) do update set value = excluded.value, updated_at = now();
