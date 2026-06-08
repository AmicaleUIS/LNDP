-- ============================================================
-- LE NID DES PRONOS — PATCH V0.21.0
-- Profils personnalisés, avatars, badges, teams bureau par défaut
-- ============================================================

-- 1) Colonnes profil pour onboarding et personnalisation joueur.
alter table public.profiles
  add column if not exists avatar_key text not null default 'owl-01',
  add column if not exists badge_shape text not null default 'rounded',
  add column if not exists badge_color text not null default '#facc15',
  add column if not exists profile_setup_done boolean not null default false;

-- 2) Contraintes simples et tolérantes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_badge_shape_check'
  ) then
    alter table public.profiles
      add constraint profiles_badge_shape_check
      check (badge_shape in ('rounded', 'circle', 'shield', 'hex', 'diamond'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_key_check'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_key_check
      check (avatar_key ~ '^owl-[0-9]{2}$');
  end if;
end $$;

-- 3) Teams bureau demandées.
insert into public.office_teams (name, slug, color)
values
  ('SNA', 'sna', '#38bdf8'),
  ('Élecs', 'elecs', '#facc15'),
  ('Les Pétafs', 'les-petafs', '#f97316'),
  ('Les 21', 'les-21', '#a78bfa'),
  ('La Sada', 'la-sada', '#22c55e'),
  ('Les SISA', 'les-sisa', '#14b8a6'),
  ('Les Servitudes', 'les-servitudes', '#ef4444'),
  ('La CCI', 'la-cci', '#60a5fa'),
  ('Le commandement', 'le-commandement', '#ec4899')
on conflict (slug) do update set
  name = excluded.name,
  color = excluded.color,
  updated_at = now();

-- 4) Petit réglage version/changelog stocké en base pour mémoire.
insert into public.app_settings (key, value)
values
  ('app_version', '"0.21.0"'::jsonb),
  ('versioning_rule', '{
    "current": "0.21.0",
    "meaning": "0 = pré-déploiement, 21 = évolution majeure, 0 = correction mineure",
    "public_release": "1.0.0 au déploiement officiel"
  }'::jsonb),
  ('changelog_0_21_0', '{
    "version": "0.21.0",
    "title": "Profils joueurs personnalisés",
    "changes": [
      "Correction du menu gauche pour éviter les superpositions",
      "Ajout de 30 avatars chouette supporter",
      "Choix de la forme et de la couleur du badge joueur",
      "Onboarding première connexion : pseudo, avatar, badge et team",
      "Teams bureau par défaut et gestion admin renommage/couleur/suppression",
      "Menu crédits caché avec suivi des évolutions"
    ]
  }'::jsonb)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

-- 5) Vérification rapide.
select
  'profiles_custom_columns' as check_name,
  count(*) as profiles_count,
  count(*) filter (where profile_setup_done = true) as ready_profiles,
  count(*) filter (where profile_setup_done = false) as profiles_to_complete
from public.profiles;

select
  'office_teams' as check_name,
  name,
  slug,
  color
from public.office_teams
order by name;
