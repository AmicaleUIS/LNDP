-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.34
-- Labo live : injection de pronos pour tous les joueurs actifs
-- À lancer après patch_v1_3_30_labo_live_match.sql.
-- ============================================================

create or replace function public.admin_inject_live_demo_predictions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_match_id uuid;
  inserted_count integer := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  select id into demo_match_id
  from public.matches
  where api_match_id = -133000
  limit 1;

  if demo_match_id is null then
    raise exception 'Match labo introuvable. Active d’abord le match fictif live.';
  end if;

  with players as (
    select
      p.id as user_id,
      row_number() over (order by coalesce(p.pseudo, p.email, p.id::text)) as rn
    from public.profiles p
    where coalesce(p.is_active, true) = true
      and coalesce(p.is_banned, false) = false
      and coalesce(p.role, 'user') not in ('admin', 'super_admin')
  ),
  generated as (
    select
      user_id,
      case (rn % 8)
        when 0 then 0
        when 1 then 1
        when 2 then 0
        when 3 then 1
        when 4 then 2
        when 5 then 1
        when 6 then 2
        else 3
      end as home_score_pred,
      case (rn % 8)
        when 0 then 0
        when 1 then 0
        when 2 then 1
        when 3 then 1
        when 4 then 1
        when 5 then 2
        when 6 then 2
        else 1
      end as away_score_pred
    from players
  ),
  upserted as (
    insert into public.predictions (
      user_id,
      match_id,
      home_score_pred,
      away_score_pred,
      qualified_team_pred,
      locked_at,
      updated_at
    )
    select
      g.user_id,
      demo_match_id,
      g.home_score_pred,
      g.away_score_pred,
      null,
      now(),
      now()
    from generated g
    on conflict (user_id, match_id) do update
    set home_score_pred = excluded.home_score_pred,
        away_score_pred = excluded.away_score_pred,
        qualified_team_pred = null,
        locked_at = now(),
        updated_at = now()
    returning 1
  )
  select count(*)::integer into inserted_count
  from upserted;

  perform public.admin_log_action(
    'inject_live_demo_predictions',
    'preparation',
    jsonb_build_object('match_id', demo_match_id, 'count', inserted_count)
  );

  return inserted_count;
end;
$$;

grant execute on function public.admin_inject_live_demo_predictions() to authenticated;

-- Vérification rapide
select
  'patch_v1_3_34_ready' as check_name,
  exists(select 1 from public.matches where api_match_id = -133000) as demo_match_exists;
