-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.36
-- Sondages Hibou : détail nominatif des votes
-- ============================================================
-- Permet d'afficher, côté joueur et côté admin, qui a voté quoi
-- dans un sondage du Hibou, y compris dans l'historique.

create or replace view public.v_owl_poll_vote_details as
select
  v.message_id,
  v.user_id,
  coalesce(nullif(p.pseudo, ''), p.email, 'Joueur mystère') as pseudo,
  v.option_key,
  coalesce(opt.option_item->>'label', v.option_key) as option_label,
  v.created_at as voted_at,
  v.updated_at as updated_at
from public.owl_message_votes v
join public.owl_messages om on om.id = v.message_id
left join public.profiles p on p.id = v.user_id
left join lateral (
  select option_item
  from jsonb_array_elements(coalesce(om.poll_options, '[]'::jsonb)) as raw_opt(option_item)
  where raw_opt.option_item->>'key' = v.option_key
  limit 1
) opt on true
where om.enabled = true
  and om.show_in_history = true
  and om.poll_enabled = true;

grant select on public.v_owl_poll_vote_details to authenticated;

select 'patch_v1_8_34_owl_poll_vote_details_ready' as check_name;
