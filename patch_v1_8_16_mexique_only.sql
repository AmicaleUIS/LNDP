-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.16
-- Mexico -> Mexique, sans toucher aux IDs/pronos/scores
-- ============================================================

update public.football_teams
set name = 'Mexique'
where name = 'Mexico';

do $do$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='matches' and column_name='home_team_name'
  ) then
    execute $sql$update public.matches set home_team_name = 'Mexique' where home_team_name = 'Mexico'$sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='matches' and column_name='away_team_name'
  ) then
    execute $sql$update public.matches set away_team_name = 'Mexique' where away_team_name = 'Mexico'$sql$;
  end if;
end $do$;

select 'mexique_patch_v1_8_16' as check_name, id, name, short_name
from public.football_teams
where name ilike '%mexi%' or short_name = 'MEX'
order by name;
