-- ============================================================
-- LE NID DES PRONOS — PATCH V1.15.2
-- Diffuseurs TV : beIN Sports par défaut + M6 ou W9 en option
-- ============================================================

-- Règle projet : tous les matchs sont sur beIN Sports.
-- Si un match était déjà marqué M6, on conserve M6 en plus.
-- Si un match était déjà marqué W9, on conserve W9 en plus.
-- Sinon, on force beIN Sports.
-- M6 et W9 sont traités comme une option gratuite alternative : M6 OU W9.

update public.matches
set
  tv_channel = case
    when lower(coalesce(tv_channel, '')) like '%w9%'
      or lower(coalesce(tv_channel, '')) like '%w 9%'
      then 'beIN Sports / W9'
    when lower(coalesce(tv_channel, '')) like '%m6%'
      or lower(coalesce(tv_channel, '')) like '%m 6%'
      then 'beIN Sports / M6'
    else 'beIN Sports'
  end,
  tv_channel_source = 'manual',
  updated_at = now();

-- Vérification rapide.
select
  tv_channel,
  count(*) as matches_count
from public.matches
group by tv_channel
order by tv_channel;
