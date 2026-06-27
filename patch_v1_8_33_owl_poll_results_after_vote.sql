-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.34
-- Sondages Hibou : résultats visibles côté joueurs après vote
-- ============================================================
-- Aucun changement de table nécessaire.
-- Ce patch garantit seulement que la vue de résultats existe en version sans GROUP BY.

create or replace view public.v_admin_owl_poll_results as
select
  om.id as message_id,
  om.title,
  om.poll_question,
  om.poll_options,
  om.poll_end_at,
  opt.option_item->>'key' as option_key,
  coalesce(opt.option_item->>'label', opt.option_item->>'key') as option_label,
  (
    select count(*)::integer
    from public.owl_message_votes v
    where v.message_id = om.id
      and v.option_key = opt.option_item->>'key'
  ) as votes_count
from public.owl_messages om
cross join lateral jsonb_array_elements(coalesce(om.poll_options, '[]'::jsonb)) as opt(option_item)
where om.poll_enabled = true;

grant select on public.v_admin_owl_poll_results to authenticated;

select 'patch_v1_8_33_owl_poll_results_after_vote_ready' as check_name;
