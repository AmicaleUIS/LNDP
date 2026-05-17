-- ============================================================
-- LE NID DES PRONOS — OUTIL DEMO PDF FINAL
-- Crée un joueur fictif qui a pronostiqué toute la compétition.
-- Permet de prévisualiser le Bilan PDF : scores, badges, records, graphs.
--
-- UTILISATION :
-- 1) Installer les fonctions ci-dessous dans Supabase SQL Editor.
-- 2) Créer le joueur démo :
--      select public.admin_create_pdf_demo_player(true);
--
--    true  = marque temporairement les matchs comme terminés avec des scores fictifs
--            pour avoir immédiatement des points, badges, records et graphiques.
--    false = crée seulement les pronos, sans toucher aux matchs.
--
-- 3) Tester dans Admin > Bilan PDF avec le joueur :
--      Hibou Démo PDF
--
-- 4) Nettoyer totalement après test :
--      select public.admin_delete_pdf_demo_player(true);
--
--    true restaure les scores/statuts de matchs sauvegardés au moment de la création.
--
-- IMPORTANT :
-- - Les horaires, lieux, équipes, diffuseurs TV et infos de match ne sont pas modifiés.
-- - Si tu utilises true, ne modifie pas les scores/statuts réels entre la création et le nettoyage,
--   sinon le nettoyage remettra les statuts/scores comme avant le test.
-- ============================================================

create extension if not exists pgcrypto;

-- Table de snapshot technique, utilisée uniquement pour restaurer les statuts/scores après test.
create table if not exists public.pdf_demo_match_snapshot (
  match_id uuid primary key,
  status text,
  home_score integer,
  away_score integer,
  winner_team_id uuid,
  captured_at timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- Fonction 1 : création / recréation du joueur démo PDF.
-- ----------------------------------------------------------------
create or replace function public.admin_create_pdf_demo_player(
  p_finish_matches boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  demo_user_id uuid := '00000000-0000-4000-8000-000000001300'::uuid;
  demo_email text := 'demo-pdf@le-nid.local';
  demo_pseudo text := 'Hibou Démo PDF';
  demo_team_id uuid;
  demo_competition_id uuid;
  demo_champion_team_id uuid;
  inserted_predictions int := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  -- Team de rattachement : on prend la première team existante.
  select id
  into demo_team_id
  from public.office_teams
  order by name asc nulls last
  limit 1;

  if demo_team_id is null then
    raise exception 'Aucune team bureau trouvée. Crée au moins une team avant de générer le joueur démo.';
  end if;

  -- Crée un faux compte Auth, pour satisfaire l’éventuel lien profiles -> auth.users.
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    demo_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    demo_email,
    crypt('demo-pdf-nid', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('pseudo', demo_pseudo),
    now(),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now(),
      raw_user_meta_data = excluded.raw_user_meta_data;

  -- Crée / remet à jour le profil joueur.
  insert into public.profiles (
    id,
    email,
    pseudo,
    role,
    player_scope,
    office_team_id,
    is_active,
    is_banned,
    can_chat,
    can_predict,
    can_change_avatar,
    can_change_pseudo,
    avatar_key,
    badge_shape,
    badge_color,
    profile_setup_done,
    show_family_players,
    created_at
  )
  values (
    demo_user_id,
    demo_email,
    demo_pseudo,
    'user',
    'uis',
    demo_team_id,
    true,
    false,
    true,
    true,
    true,
    true,
    'owl-18-le-coach-au-sifflet',
    'rounded',
    '#facc15',
    true,
    false,
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      pseudo = excluded.pseudo,
      role = excluded.role,
      player_scope = excluded.player_scope,
      office_team_id = excluded.office_team_id,
      is_active = true,
      is_banned = false,
      can_chat = true,
      can_predict = true,
      can_change_avatar = true,
      can_change_pseudo = true,
      avatar_key = excluded.avatar_key,
      badge_shape = excluded.badge_shape,
      badge_color = excluded.badge_color,
      profile_setup_done = true,
      show_family_players = false;

  -- Nettoyage des anciennes données du joueur démo.
  if to_regclass('public.prediction_points') is not null then
    delete from public.prediction_points where user_id = demo_user_id;
  end if;

  if to_regclass('public.predictions') is not null then
    delete from public.predictions where user_id = demo_user_id;
  end if;

  if to_regclass('public.winner_predictions') is not null then
    delete from public.winner_predictions where user_id = demo_user_id;
  end if;

  -- Snapshot des statuts/scores avant simulation.
  if p_finish_matches then
    insert into public.pdf_demo_match_snapshot (
      match_id,
      status,
      home_score,
      away_score,
      winner_team_id
    )
    select
      m.id,
      m.status::text,
      m.home_score,
      m.away_score,
      m.winner_team_id
    from public.matches m
    where coalesce(m.is_test_match, false) = false
    on conflict (match_id) do nothing;

    -- Simulation de résultats sur les matchs officiels.
    -- On ne touche pas aux horaires, lieux, équipes, diffuseurs, villes, stades, etc.
    with numbered as (
      select
        m.id,
        m.stage::text as stage_text,
        m.home_team_id,
        m.away_team_id,
        row_number() over (order by m.kickoff_at nulls last, m.id) as rn
      from public.matches m
      where coalesce(m.is_test_match, false) = false
        and m.home_team_id is not null
        and m.away_team_id is not null
    ), scores as (
      select
        id,
        stage_text,
        home_team_id,
        away_team_id,
        case
          when stage_text = 'group' and rn % 7 = 0 then 1
          when rn % 5 in (0,1) then 2
          when rn % 5 = 2 then 3
          else 1
        end as h,
        case
          when stage_text = 'group' and rn % 7 = 0 then 1
          when rn % 5 in (0,1) then 0
          when rn % 5 = 2 then 1
          else 2
        end as a
      from numbered
    )
    update public.matches m
    set
      status = 'finished',
      home_score = s.h,
      away_score = s.a,
      winner_team_id = case
        when s.h > s.a then s.home_team_id
        when s.a > s.h then s.away_team_id
        when s.stage_text <> 'group' then s.home_team_id
        else null
      end
    from scores s
    where m.id = s.id;
  end if;

  -- Création de pronos variés : exacts, bons résultats, mauvais, casseroles.
  with match_base as (
    select
      m.id as match_id,
      m.stage::text as stage_text,
      m.home_team_id,
      m.away_team_id,
      coalesce(m.home_score, 2) as real_home,
      coalesce(m.away_score, 1) as real_away,
      m.winner_team_id,
      row_number() over (order by m.kickoff_at nulls last, m.id) as rn
    from public.matches m
    where coalesce(m.is_test_match, false) = false
      and m.home_team_id is not null
      and m.away_team_id is not null
  ), demo_predictions as (
    select
      demo_user_id as user_id,
      match_id,

      -- home_score_pred
      case
        -- 1 sur 4 : score exact.
        when rn % 4 = 0 then real_home

        -- bon résultat mais pas forcément exact.
        when rn % 4 = 1 then
          case
            when real_home > real_away then real_home + 1
            when real_home < real_away then greatest(real_home - 1, 0)
            else real_home + 1
          end

        -- casserole / mauvais sens.
        when rn % 4 = 2 then
          case
            when real_home > real_away then greatest(real_away - 1, 0)
            when real_home < real_away then real_away + 1
            else real_home + 2
          end

        -- prono neutre.
        else greatest(real_home, 0)
      end as pred_home,

      -- away_score_pred
      case
        -- 1 sur 4 : score exact.
        when rn % 4 = 0 then real_away

        -- bon résultat mais pas forcément exact.
        when rn % 4 = 1 then
          case
            when real_home > real_away then real_away
            when real_home < real_away then real_away + 1
            else real_away + 1
          end

        -- casserole / mauvais sens.
        when rn % 4 = 2 then
          case
            when real_home > real_away then real_home + 1
            when real_home < real_away then greatest(real_home - 1, 0)
            else greatest(real_away - 1, 0)
          end

        -- prono neutre.
        else greatest(real_away, 0)
      end as pred_away,

      stage_text,
      home_team_id,
      away_team_id,
      winner_team_id,
      rn
    from match_base
  ), normalized as (
    select
      user_id,
      match_id,
      pred_home,
      case
        -- En phase finale, on évite les égalités dans le prono.
        when stage_text <> 'group' and pred_home = pred_away then pred_away + 1
        else pred_away
      end as pred_away,
      stage_text,
      home_team_id,
      away_team_id,
      winner_team_id,
      rn
    from demo_predictions
  )
  insert into public.predictions (
    user_id,
    match_id,
    home_score_pred,
    away_score_pred,
    qualified_team_pred,
    created_at,
    updated_at
  )
  select
    user_id,
    match_id,
    pred_home,
    pred_away,
    case
      when stage_text = 'group' then null
      when rn % 4 in (0,1) then coalesce(winner_team_id, case when pred_home > pred_away then home_team_id else away_team_id end)
      else case
        when coalesce(winner_team_id, home_team_id) = home_team_id then away_team_id
        else home_team_id
      end
    end as qualified_team_pred,
    now() - ((rn % 18) || ' hours')::interval,
    now() - ((rn % 7) || ' minutes')::interval
  from normalized
  on conflict (user_id, match_id) do update
  set home_score_pred = excluded.home_score_pred,
      away_score_pred = excluded.away_score_pred,
      qualified_team_pred = excluded.qualified_team_pred,
      updated_at = excluded.updated_at;

  get diagnostics inserted_predictions = row_count;

  -- Choix champion démo : idéalement le vainqueur de la finale simulée.
  if to_regclass('public.winner_predictions') is not null
     and to_regclass('public.competitions') is not null
     and to_regclass('public.football_teams') is not null then

    select id
    into demo_competition_id
    from public.competitions
    where is_active = true
    order by id desc
    limit 1;

    if demo_competition_id is null then
      select id
      into demo_competition_id
      from public.competitions
      order by id desc
      limit 1;
    end if;

    select winner_team_id
    into demo_champion_team_id
    from public.matches
    where stage::text = 'final'
      and winner_team_id is not null
    order by kickoff_at desc nulls last
    limit 1;

    if demo_champion_team_id is null then
      select id
      into demo_champion_team_id
      from public.football_teams
      order by name
      limit 1;
    end if;

    if demo_competition_id is not null and demo_champion_team_id is not null then
      insert into public.winner_predictions (
        user_id,
        competition_id,
        predicted_team_id,
        locked_at,
        created_at,
        updated_at
      )
      values (
        demo_user_id,
        demo_competition_id,
        demo_champion_team_id,
        now(),
        now() - interval '6 days',
        now()
      )
      on conflict (user_id, competition_id) do update
      set predicted_team_id = excluded.predicted_team_id,
          locked_at = excluded.locked_at,
          updated_at = now();
    end if;
  end if;

  -- Recalcule les points à partir des vrais/simulés résultats.
  begin
    perform public.recalc_all_points();
  exception when undefined_function then
    null;
  end;

  begin
    perform public.recalc_winner_predictions();
  exception when undefined_function then
    null;
  end;

  return jsonb_build_object(
    'message', 'Joueur démo PDF créé. Va dans Admin > Bilan PDF et choisis Hibou Démo PDF.',
    'demo_user_id', demo_user_id,
    'demo_email', demo_email,
    'demo_pseudo', demo_pseudo,
    'finish_matches', p_finish_matches,
    'predictions_created_or_updated', inserted_predictions,
    'cleanup_sql', 'select public.admin_delete_pdf_demo_player(true);'
  );
end;
$$;

grant execute on function public.admin_create_pdf_demo_player(boolean) to authenticated;

-- ----------------------------------------------------------------
-- Fonction 2 : suppression complète du joueur démo.
-- ----------------------------------------------------------------
create or replace function public.admin_delete_pdf_demo_player(
  p_restore_matches boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  demo_user_id uuid := '00000000-0000-4000-8000-000000001300'::uuid;
  deleted_prediction_points int := 0;
  deleted_predictions int := 0;
  deleted_winner_predictions int := 0;
  deleted_profile int := 0;
  deleted_auth_user int := 0;
  restored_matches int := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  if p_restore_matches and to_regclass('public.pdf_demo_match_snapshot') is not null then
    update public.matches m
    set
      status = s.status::public.match_status,
      home_score = s.home_score,
      away_score = s.away_score,
      winner_team_id = s.winner_team_id
    from public.pdf_demo_match_snapshot s
    where m.id = s.match_id;

    get diagnostics restored_matches = row_count;

    delete from public.pdf_demo_match_snapshot where true;
  end if;

  if to_regclass('public.prediction_points') is not null then
    delete from public.prediction_points where user_id = demo_user_id;
    get diagnostics deleted_prediction_points = row_count;
  end if;

  if to_regclass('public.predictions') is not null then
    delete from public.predictions where user_id = demo_user_id;
    get diagnostics deleted_predictions = row_count;
  end if;

  if to_regclass('public.winner_predictions') is not null then
    delete from public.winner_predictions where user_id = demo_user_id;
    get diagnostics deleted_winner_predictions = row_count;
  end if;

  delete from public.profiles where id = demo_user_id;
  get diagnostics deleted_profile = row_count;

  delete from auth.users where id = demo_user_id;
  get diagnostics deleted_auth_user = row_count;

  begin
    perform public.recalc_all_points();
  exception when undefined_function then
    null;
  end;

  return jsonb_build_object(
    'message', 'Joueur démo PDF supprimé.',
    'demo_user_id', demo_user_id,
    'restored_matches', restored_matches,
    'deleted_prediction_points', deleted_prediction_points,
    'deleted_predictions', deleted_predictions,
    'deleted_winner_predictions', deleted_winner_predictions,
    'deleted_profile', deleted_profile,
    'deleted_auth_user', deleted_auth_user
  );
end;
$$;

grant execute on function public.admin_delete_pdf_demo_player(boolean) to authenticated;

-- ----------------------------------------------------------------
-- Vérification rapide.
-- ----------------------------------------------------------------
select
  'demo_pdf_tools_ready' as check_name,
  to_regprocedure('public.admin_create_pdf_demo_player(boolean)') is not null as create_function_ok,
  to_regprocedure('public.admin_delete_pdf_demo_player(boolean)') is not null as delete_function_ok;
