-- ============================================================
-- LE NID DES PRONOS — PATCH V0.22.3
-- Admin sauvegardes corrigées + pays hôtes
-- ============================================================

-- Ce patch ajoute :
-- - une table de sauvegardes app_backups ;
-- - une fonction de sauvegarde des pronos joueurs + résultats matchs ;
-- - une fonction de restauration ;
-- - une fonction de remise à zéro sécurisée des pronos / points / badges ;
-- - une planification automatique quotidienne à midi France si Supabase Cron est disponible ;
-- - les pays hôtes Canada / États-Unis / Mexique sur les matchs.

-- ============================================================
-- 1. TABLE SAUVEGARDES
-- ============================================================

create table if not exists public.app_backups (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  backup_type text not null default 'manual', -- manual / auto / reset-before
  payload jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_backups_created_at on public.app_backups(created_at desc);
create index if not exists idx_app_backups_type on public.app_backups(backup_type);

alter table public.app_backups enable row level security;

drop policy if exists "app_backups_admin_select" on public.app_backups;
create policy "app_backups_admin_select"
on public.app_backups
for select
to authenticated
using (public.is_admin());

drop policy if exists "app_backups_admin_insert" on public.app_backups;
create policy "app_backups_admin_insert"
on public.app_backups
for insert
to authenticated
with check (public.is_admin());

-- ============================================================
-- 2. BYPASS RESTAURATION POUR LE TRIGGER DE PRONOS
-- ============================================================

create or replace function public.enforce_prediction_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  match_kickoff timestamptz;
  match_stage_value public.match_stage;
begin
  -- Utilisé uniquement par restore_app_backup().
  if current_setting('app.restore_mode', true) = 'on' then
    return new;
  end if;

  select kickoff_at, stage
  into match_kickoff, match_stage_value
  from public.matches
  where id = new.match_id;

  if match_kickoff is null then
    raise exception 'Match introuvable.';
  end if;

  if TG_OP = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Impossible de transférer un prono vers un autre utilisateur.';
    end if;

    if new.match_id is distinct from old.match_id then
      raise exception 'Impossible de transférer un prono vers un autre match.';
    end if;
  end if;

  if now() >= match_kickoff then
    raise exception 'Prono verrouillé : le match a déjà commencé.';
  end if;

  if new.qualified_team_pred is not null and match_stage_value = 'group'::public.match_stage then
    raise exception 'Le qualifié ne doit être renseigné que pour les matchs à élimination directe.';
  end if;

  return new;
end;
$$;

-- ============================================================
-- 3. CRÉER UNE SAUVEGARDE
-- ============================================================

create or replace function public.create_app_backup(
  p_label text default null,
  p_type text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_payload jsonb;
  v_label text;
begin
  -- Appel utilisateur : admin obligatoire.
  -- Appel cron : auth.uid() est null, accepté.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Action réservée à l’admin.';
  end if;

  v_label := coalesce(nullif(trim(p_label), ''), 'Sauvegarde ' || to_char(now(), 'YYYY-MM-DD HH24:MI'));

  v_payload := jsonb_build_object(
    'created_at', now(),
    'version', '0.22.3',
    'matches', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.kickoff_at)
      from (
        select
          id,
          status,
          home_score,
          away_score,
          winner_team_id,
          tv_channel,
          tv_channel_source,
          kickoff_at,
          match_day,
          venue,
          city,
          venue_country_code,
          venue_country_name,
          venue_country_flag_url,
          updated_at
        from public.matches
      ) m
    ), '[]'::jsonb),
    'predictions', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at)
      from (
        select
          id,
          user_id,
          match_id,
          home_score_pred,
          away_score_pred,
          qualified_team_pred,
          locked_at,
          created_at,
          updated_at
        from public.predictions
      ) p
    ), '[]'::jsonb),
    'winner_predictions', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.created_at)
      from (
        select
          id,
          user_id,
          competition_id,
          predicted_team_id,
          points_total,
          locked_at,
          created_at,
          updated_at
        from public.winner_predictions
      ) w
    ), '[]'::jsonb)
  );

  insert into public.app_backups (label, backup_type, payload, created_by)
  values (v_label, coalesce(nullif(trim(p_type), ''), 'manual'), v_payload, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================
-- 4. RESTAURER UNE SAUVEGARDE
-- ============================================================

create or replace function public.restore_app_backup(p_backup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if not public.is_admin() then
    raise exception 'Action réservée à l’admin.';
  end if;

  select payload into v_payload
  from public.app_backups
  where id = p_backup_id;

  if v_payload is null then
    raise exception 'Sauvegarde introuvable.';
  end if;

  -- Sauvegarde de sécurité avant restauration.
  perform public.create_app_backup('Avant restauration ' || to_char(now(), 'YYYY-MM-DD HH24:MI'), 'restore-before');

  perform set_config('app.restore_mode', 'on', true);

  delete from public.prediction_points;
  delete from public.predictions;

  insert into public.predictions (
    id,
    user_id,
    match_id,
    home_score_pred,
    away_score_pred,
    qualified_team_pred,
    locked_at,
    created_at,
    updated_at
  )
  select
    id,
    user_id,
    match_id,
    home_score_pred,
    away_score_pred,
    qualified_team_pred,
    locked_at,
    created_at,
    updated_at
  from jsonb_to_recordset(coalesce(v_payload -> 'predictions', '[]'::jsonb)) as x(
    id uuid,
    user_id uuid,
    match_id uuid,
    home_score_pred integer,
    away_score_pred integer,
    qualified_team_pred uuid,
    locked_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
  );

  if to_regclass('public.winner_predictions') is not null then
    delete from public.winner_predictions;

    insert into public.winner_predictions (
      id,
      user_id,
      competition_id,
      predicted_team_id,
      points_total,
      locked_at,
      created_at,
      updated_at
    )
    select
      id,
      user_id,
      competition_id,
      predicted_team_id,
      points_total,
      locked_at,
      created_at,
      updated_at
    from jsonb_to_recordset(coalesce(v_payload -> 'winner_predictions', '[]'::jsonb)) as x(
      id uuid,
      user_id uuid,
      competition_id uuid,
      predicted_team_id uuid,
      points_total integer,
      locked_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    );
  end if;

  update public.matches m
  set
    status = x.status,
    home_score = x.home_score,
    away_score = x.away_score,
    winner_team_id = x.winner_team_id,
    tv_channel = x.tv_channel,
    tv_channel_source = coalesce(x.tv_channel_source, m.tv_channel_source),
    kickoff_at = coalesce(x.kickoff_at, m.kickoff_at),
    match_day = coalesce(x.match_day, m.match_day),
    venue = x.venue,
    city = x.city,
    venue_country_code = coalesce(x.venue_country_code, m.venue_country_code),
    venue_country_name = coalesce(x.venue_country_name, m.venue_country_name),
    venue_country_flag_url = coalesce(x.venue_country_flag_url, m.venue_country_flag_url),
    updated_at = now()
  from jsonb_to_recordset(coalesce(v_payload -> 'matches', '[]'::jsonb)) as x(
    id uuid,
    status public.match_status,
    home_score integer,
    away_score integer,
    winner_team_id uuid,
    tv_channel text,
    tv_channel_source public.tv_channel_source,
    kickoff_at timestamptz,
    match_day date,
    venue text,
    city text,
    venue_country_code text,
    venue_country_name text,
    venue_country_flag_url text,
    updated_at timestamptz
  )
  where m.id = x.id;

  perform set_config('app.restore_mode', 'off', true);
  perform public.recalc_all_points();

  if to_regclass('public.winner_predictions') is not null then
    -- Si la fonction champion existe, elle peut recalculer les +100 points.
    begin
      perform public.recalc_winner_predictions();
    exception when undefined_function then
      null;
    end;
  end if;
end;
$$;

-- ============================================================
-- 5. REMISE À ZÉRO SÉCURISÉE DES PRONOS
-- ============================================================

create or replace function public.reset_all_predictions_secure(p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Action réservée à l’admin.';
  end if;

  if p_confirm <> 'REMISE A ZERO' then
    raise exception 'Confirmation invalide.';
  end if;

  perform public.create_app_backup('Avant remise à zéro ' || to_char(now(), 'YYYY-MM-DD HH24:MI'), 'reset-before');

  delete from public.prediction_points;
  delete from public.predictions;

  if to_regclass('public.winner_predictions') is not null then
    delete from public.winner_predictions;
  end if;
end;
$$;

grant select on public.app_backups to authenticated;
grant execute on function public.create_app_backup(text, text) to authenticated;
grant execute on function public.restore_app_backup(uuid) to authenticated;
grant execute on function public.reset_all_predictions_secure(text) to authenticated;

-- ============================================================
-- 6. PAYS HÔTES DES MATCHS
-- ============================================================

alter table public.matches
add column if not exists venue_country_code text,
add column if not exists venue_country_name text,
add column if not exists venue_country_flag_url text;

-- Sécurité : pool_round peut déjà exister via le patch V1.8.
alter table public.matches
add column if not exists pool_round integer;

-- Remplissage automatique d'après la ville.
-- Les chemins flag_url sont des assets locaux du site.
update public.matches
set
  venue_country_code = 'MX',
  venue_country_name = 'Mexique',
  venue_country_flag_url = 'assets/icons/flags/mx.png',
  updated_at = now()
where lower(coalesce(city, '')) in ('mexico city', 'guadalajara', 'monterrey', 'mexico', 'ciudad de méxico', 'ciudad de mexico')
   or lower(coalesce(venue, '')) like '%mexico%';

update public.matches
set
  venue_country_code = 'CA',
  venue_country_name = 'Canada',
  venue_country_flag_url = 'assets/icons/flags/ca.png',
  updated_at = now()
where lower(coalesce(city, '')) in ('toronto', 'vancouver')
   or lower(coalesce(venue, '')) like '%toronto%'
   or lower(coalesce(venue, '')) like '%vancouver%';

update public.matches
set
  venue_country_code = 'US',
  venue_country_name = 'États-Unis',
  venue_country_flag_url = 'assets/icons/flags/us.png',
  updated_at = now()
where venue_country_code is null
  and (
    lower(coalesce(city, '')) in (
      'atlanta', 'boston', 'dallas', 'houston', 'kansas city', 'los angeles',
      'miami', 'new york new jersey', 'new york', 'new jersey', 'philadelphia',
      'san francisco bay area', 'san francisco', 'seattle'
    )
    or lower(coalesce(venue, '')) like '%atlanta%'
    or lower(coalesce(venue, '')) like '%boston%'
    or lower(coalesce(venue, '')) like '%dallas%'
    or lower(coalesce(venue, '')) like '%houston%'
    or lower(coalesce(venue, '')) like '%kansas%'
    or lower(coalesce(venue, '')) like '%los angeles%'
    or lower(coalesce(venue, '')) like '%miami%'
    or lower(coalesce(venue, '')) like '%new york%'
    or lower(coalesce(venue, '')) like '%new jersey%'
    or lower(coalesce(venue, '')) like '%philadelphia%'
    or lower(coalesce(venue, '')) like '%san francisco%'
    or lower(coalesce(venue, '')) like '%seattle%'
  );

-- Vue matchs enrichie.
-- Important : on ajoute les nouvelles colonnes à la fin pour éviter l'erreur
-- "cannot change name of view column".
create or replace view public.v_matches as
select
  m.id,
  m.competition_id,
  c.name as competition_name,
  c.slug as competition_slug,
  m.api_match_id,
  m.kickoff_at,
  m.match_day,
  m.venue,
  m.city,
  m.stage,
  m.group_name,
  m.status,
  m.home_score,
  m.away_score,
  m.winner_team_id,
  m.tv_channel,
  m.tv_channel_source,
  m.last_api_sync_at,

  ht.id as home_team_id,
  ht.name as home_team_name,
  ht.short_name as home_team_short_name,
  ht.country_code as home_team_country_code,
  ht.flag_emoji as home_team_flag_emoji,
  ht.flag_url as home_team_flag_url,

  at.id as away_team_id,
  at.name as away_team_name,
  at.short_name as away_team_short_name,
  at.country_code as away_team_country_code,
  at.flag_emoji as away_team_flag_emoji,
  at.flag_url as away_team_flag_url,

  m.pool_round,
  m.venue_country_code,
  m.venue_country_name,
  m.venue_country_flag_url
from public.matches m
join public.competitions c on c.id = m.competition_id
join public.football_teams ht on ht.id = m.home_team_id
join public.football_teams at on at.id = m.away_team_id;

grant select on public.v_matches to authenticated;

-- ============================================================
-- 7. SAUVEGARDE AUTOMATIQUE MIDI FRANCE
-- ============================================================

-- Supabase Cron ou pg_cron doit être disponible sur le projet.
-- Si cron n’est pas actif, le patch continue sans erreur.
do $$
begin
  begin
    execute 'select cron.unschedule($1)' using 'le-nid-pronos-backup-midi';
  exception when others then
    null;
  end;

  begin
    execute 'select cron.schedule($1, $2, $3)'
    using
      'le-nid-pronos-backup-midi',
      '0 10 * * *',
      'select public.create_app_backup(''Sauvegarde automatique midi'', ''auto'');';
  exception when others then
    raise notice 'Planification cron non créée. Active Supabase Cron ou pg_cron si tu veux la sauvegarde automatique. Détail : %', sqlerrm;
  end;
end $$;

-- ============================================================
-- 8. VÉRIFICATION
-- ============================================================

select
  'app_backups_ready' as check_name,
  count(*) as backups_count
from public.app_backups;

select
  'host_countries_ready' as check_name,
  venue_country_code,
  venue_country_name,
  count(*) as matches_count
from public.matches
group by venue_country_code, venue_country_name
order by venue_country_code;
