-- ============================================================
-- LE NID DES PRONOS — PATCH V1.3.35
-- Labo live : statut/scores sans verrou de date
-- À lancer après patch_v1_3_30_labo_live_match.sql.
-- ============================================================

create or replace function public.admin_set_live_demo_score(
  p_status text default 'live',
  p_home_score integer default null,
  p_away_score integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_match public.matches%rowtype;
  target_status public.match_status;
  new_home_score integer;
  new_away_score integer;
  new_winner uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;

  select * into demo_match
  from public.matches
  where api_match_id = -133000
  limit 1
  for update;

  if demo_match.id is null then
    raise exception 'Match labo introuvable. Active d’abord le match fictif live.';
  end if;

  if coalesce(p_status, '') not in ('scheduled', 'live', 'finished') then
    raise exception 'Statut labo invalide';
  end if;

  target_status := p_status::public.match_status;

  if target_status = 'scheduled' then
    update public.matches
    set status = 'scheduled'::public.match_status,
        home_score = null,
        away_score = null,
        winner_team_id = null,
        kickoff_at = now() + interval '10 minutes',
        updated_at = now()
    where id = demo_match.id;

    perform public.admin_log_action(
      'set_live_demo_status',
      'preparation',
      jsonb_build_object('match_id', demo_match.id, 'status', 'scheduled')
    );

    return;
  end if;

  new_home_score := greatest(0, coalesce(p_home_score, demo_match.home_score, 0));
  new_away_score := greatest(0, coalesce(p_away_score, demo_match.away_score, 0));

  new_winner := case
    when new_home_score > new_away_score then demo_match.home_team_id
    when new_away_score > new_home_score then demo_match.away_team_id
    else null
  end;

  update public.matches
  set status = target_status,
      home_score = new_home_score,
      away_score = new_away_score,
      winner_team_id = new_winner,
      kickoff_at = case
        when kickoff_at is null or kickoff_at > now() then now() - interval '1 minute'
        else kickoff_at
      end,
      updated_at = now()
  where id = demo_match.id;

  perform public.admin_log_action(
    case when p_home_score is null and p_away_score is null then 'set_live_demo_status' else 'set_live_demo_score' end,
    'preparation',
    jsonb_build_object(
      'match_id', demo_match.id,
      'status', target_status::text,
      'home_score', new_home_score,
      'away_score', new_away_score
    )
  );
end;
$$;

grant execute on function public.admin_set_live_demo_score(text, integer, integer) to authenticated;

select
  'patch_v1_3_35_ready' as check_name,
  exists(select 1 from public.matches where api_match_id = -133000) as demo_match_exists;
