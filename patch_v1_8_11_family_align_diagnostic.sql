-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.11
-- Diagnostic alignement Général / Famille
-- ============================================================
-- Ce patch ne modifie pas les pronos ni les scores.
-- Il vérifie que v_leaderboard_overall donne bien le compte officiel,
-- que l'app Famille V1.8.11 réutilise désormais pour le général famille.

select
  'family_uses_general_rows_v1_8_11' as check_name,
  pseudo,
  scored_matches,
  total_points
from public.v_leaderboard_overall
order by scored_matches desc, pseudo
limit 30;
