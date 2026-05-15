-- ============================================================
-- LE NID DES PRONOS — PATCH V0.22.4
-- Correctif sauvegardes/restauration : DELETE sans WHERE
-- ============================================================

-- Problème corrigé :
-- DELETE requires a WHERE clause
--
-- Cause : winner_predictions ne stocke pas points_total en table.
-- Les +100 points champion sont calculés dans la vue v_winner_predictions.
-- La sauvegarde/restauration ne doit donc pas lire/écrire points_total
-- directement dans public.winner_predictions.

-- ============================================================
-- 1. TABLE SAUVEGARDES — sécurité si le patch précédent n'est pas complet
-- ============================================================

create table if not exists public.app_backups (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  backup_type text not null default 'manual',
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
-- 2. Fonction de sauvegarde corrigée
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
  v_winner_predictions jsonb := '[]'::jsonb;
begin
  -- Appel utilisateur : admin obligatoire.
  -- Appel cron : auth.uid() est null, accepté.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Action réservée à l’admin.';
  end if;

  v_label := coalesce(nullif(trim(p_label), ''), 'Sauvegarde ' || to_char(now(), 'YYYY-MM-DD HH24:MI'));

  -- winner_predictions existe seulement si le patch champion a été lancé.
  -- Important : on NE sauvegarde PAS points_total ici, car il est calculé par vue.
  if to_regclass('public.winner_predictions') is not null then
    select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at), '[]'::jsonb)
    into v_winner_predictions
    from (
      select
        id,
        user_id,
        competition_id,
        predicted_team_id,
        locked_at,
        created_at,
        updated_at
      from public.winner_predictions
    ) w;
  end if;

  v_payload := jsonb_build_object(
    'created_at', now(),
    'version', '0.22.4',
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
    'winner_predictions', v_winner_predictions
  );

  insert into public.app_backups (label, backup_type, payload, created_by)
  values (v_label, coalesce(nullif(trim(p_type), ''), 'manual'), v_payload, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================
-- 3. Fonction de restauration corrigée
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

  delete from public.prediction_points where true;
  delete from public.predictions where true;

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
    delete from public.winner_predictions where true;

    -- Important : pas de points_total ici. Les points champion sont calculés par vue.
    insert into public.winner_predictions (
      id,
      user_id,
      competition_id,
      predicted_team_id,
      locked_at,
      created_at,
      updated_at
    )
    select
      id,
      user_id,
      competition_id,
      predicted_team_id,
      locked_at,
      created_at,
      updated_at
    from jsonb_to_recordset(coalesce(v_payload -> 'winner_predictions', '[]'::jsonb)) as x(
      id uuid,
      user_id uuid,
      competition_id uuid,
      predicted_team_id uuid,
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

  -- Si une fonction champion existe plus tard, on la laisse se recalculer.
  begin
    perform public.recalc_winner_predictions();
  exception when undefined_function then
    null;
  end;
end;
$$;

-- ============================================================
-- 4. Remise à zéro sécurisée corrigée
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

  delete from public.prediction_points where true;
  delete from public.predictions where true;

  if to_regclass('public.winner_predictions') is not null then
    delete from public.winner_predictions where true;
  end if;
end;
$$;

-- ============================================================
-- 5. Grants + vérification
-- ============================================================

grant select on public.app_backups to authenticated;
grant execute on function public.create_app_backup(text, text) to authenticated;
grant execute on function public.restore_app_backup(uuid) to authenticated;
grant execute on function public.reset_all_predictions_secure(text) to authenticated;

select
  'backup_functions_fixed_v0_22_4' as check_name,
  count(*) as backups_count
from public.app_backups;
