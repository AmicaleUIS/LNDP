-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.15
-- Matchs de préparation : France + TF1
-- Ne supprime rien.
-- ============================================================

update public.matches
set
  venue_country_code = 'FR',
  venue_country_name = 'France',
  venue_country_flag_url = 'assets/icons/flags/fr.png',
  tv_channel = 'TF1',
  tv_channel_source = 'manual',
  updated_at = now()
where coalesce(is_test_match, false) = true;

select
  'patch_v1_3_15_preparation_france_tf1_ready' as check_name,
  count(*) filter (where coalesce(is_test_match, false) = true) as preparation_matches
from public.matches;
