-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.30
-- Labo live : match fictif activable/désactivable depuis l’admin
-- À lancer après la V1.3.29.
-- ============================================================

-- Le match fictif utilise api_match_id = -133000.
-- Il est marqué is_test_match = true, donc il est exclu des classements SQL existants.
-- Quand on le retire, ses pronos/points éventuels sont supprimés aussi.

create or replace function public.admin_set_live_demo_match(
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_competition_id uuid;
  home_id uuid;
  away_id uuid;
  demo_match_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('live_demo_match_enabled', to_jsonb(coalesce(p_enabled, false)), now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  if coalesce(p_enabled, false) = false then
    select id into demo_match_id
    from public.matches
    where api_match_id = -133000
    limit 1;

    if demo_match_id is not null then
      delete from public.prediction_points where match_id = demo_match_id;
      delete from public.predictions where match_id = demo_match_id;
      delete from public.matches where id = demo_match_id;
    end if;

    perform public.admin_log_action(
      'set_live_demo_match',
      'preparation',
      jsonb_build_object('enabled', false, 'removed', demo_match_id is not null)
    );

    return;
  end if;

  select id into active_competition_id
  from public.competitions
  where is_active = true
  order by id desc
  limit 1;

  if active_competition_id is null then
    raise exception 'Aucune compétition active trouvée';
  end if;

  insert into public.football_teams (api_team_id, name, short_name, country_code, flag_emoji, flag_url)
  select -133001, 'Hiboux du Nid', 'HIB', 'ND', '🦉', 'assets/icons/owl-png/classements.png'
  where not exists (
    select 1 from public.football_teams where api_team_id = -133001 or lower(name) = 'hiboux du nid'
  );

  insert into public.football_teams (api_team_id, name, short_name, country_code, flag_emoji, flag_url)
  select -133002, 'Chouettes du Live', 'LIV', 'LV', '⚡', 'assets/icons/owl-png/score-exact.png'
  where not exists (
    select 1 from public.football_teams where api_team_id = -133002 or lower(name) = 'chouettes du live'
  );

  select id into home_id
  from public.football_teams
  where api_team_id = -133001 or lower(name) = 'hiboux du nid'
  order by api_team_id nulls last
  limit 1;

  select id into away_id
  from public.football_teams
  where api_team_id = -133002 or lower(name) = 'chouettes du live'
  order by api_team_id nulls last
  limit 1;

  if home_id is null or away_id is null then
    raise exception 'Équipes fictives introuvables';
  end if;

  insert into public.matches (
    competition_id,
    api_match_id,
    home_team_id,
    away_team_id,
    kickoff_at,
    match_day,
    venue,
    city,
    stage,
    group_name,
    pool_round,
    status,
    home_score,
    away_score,
    winner_team_id,
    tv_channel,
    tv_channel_source,
    is_test_match,
    test_match_label,
    venue_country_code,
    venue_country_name,
    venue_country_flag_url,
    updated_at
  )
  values (
    active_competition_id,
    -133000,
    home_id,
    away_id,
    now() - interval '1 minute',
    (now() at time zone 'Europe/Paris')::date,
    'Labo du Nid',
    'Mode test',
    'group'::public.match_stage,
    'Labo live',
    null,
    'scheduled'::public.match_status,
    null,
    null,
    null,
    'Labo TV',
    'manual',
    true,
    'Labo live fictif · hors stats',
    'FR',
    'France',
    'assets/icons/flags/fr.png',
    now()
  )
  on conflict (api_match_id) do update
  set competition_id = excluded.competition_id,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      kickoff_at = excluded.kickoff_at,
      match_day = excluded.match_day,
      venue = excluded.venue,
      city = excluded.city,
      stage = excluded.stage,
      group_name = excluded.group_name,
      pool_round = excluded.pool_round,
      tv_channel = excluded.tv_channel,
      tv_channel_source = excluded.tv_channel_source,
      is_test_match = true,
      test_match_label = excluded.test_match_label,
      venue_country_code = excluded.venue_country_code,
      venue_country_name = excluded.venue_country_name,
      venue_country_flag_url = excluded.venue_country_flag_url,
      updated_at = now();

  perform public.admin_log_action(
    'set_live_demo_match',
    'preparation',
    jsonb_build_object('enabled', true)
  );
end;
$$;

grant execute on function public.admin_set_live_demo_match(boolean) to authenticated;

-- Vérification rapide
select
  'patch_v1_3_30_ready' as check_name,
  exists(select 1 from public.app_settings where key = 'live_demo_match_enabled') as setting_exists,
  exists(select 1 from public.matches where api_match_id = -133000) as demo_match_exists;
