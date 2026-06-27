-- ============================================================
-- LE NID DES PRONOS — PATCH V1.8.30
-- Sondages multi-choix dans les messages du Hibou masqué
-- ============================================================
-- À lancer dans Supabase SQL Editor avant de publier les fichiers V1.8.30.

alter table public.owl_messages
  add column if not exists poll_enabled boolean not null default false,
  add column if not exists poll_question text,
  add column if not exists poll_options jsonb not null default '[]'::jsonb,
  add column if not exists poll_end_at timestamptz;

alter table public.owl_messages
  drop constraint if exists owl_messages_poll_options_array;
alter table public.owl_messages
  add constraint owl_messages_poll_options_array
  check (jsonb_typeof(poll_options) = 'array');

create table if not exists public.owl_message_votes (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.owl_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  option_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(message_id, user_id)
);

create index if not exists idx_owl_message_votes_message on public.owl_message_votes(message_id);
create index if not exists idx_owl_message_votes_user on public.owl_message_votes(user_id);

drop trigger if exists set_updated_at_owl_message_votes on public.owl_message_votes;
create trigger set_updated_at_owl_message_votes
before update on public.owl_message_votes
for each row execute function public.set_updated_at();

alter table public.owl_message_votes enable row level security;

drop policy if exists "owl votes users read own" on public.owl_message_votes;
create policy "owl votes users read own"
on public.owl_message_votes
for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "owl votes insert own active poll" on public.owl_message_votes;
create policy "owl votes insert own active poll"
on public.owl_message_votes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.owl_messages om
    where om.id = message_id
      and om.enabled = true
      and om.show_in_history = true
      and om.poll_enabled = true
      and om.start_at <= now()
      and (om.poll_end_at is null or om.poll_end_at >= now())
      and exists (
        select 1
        from jsonb_array_elements(om.poll_options) opt
        where opt->>'key' = option_key
      )
  )
);

drop policy if exists "owl votes update own active poll" on public.owl_message_votes;
create policy "owl votes update own active poll"
on public.owl_message_votes
for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (
  (
    public.is_super_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.owl_messages om
        where om.id = message_id
          and om.enabled = true
          and om.show_in_history = true
          and om.poll_enabled = true
          and om.start_at <= now()
          and (om.poll_end_at is null or om.poll_end_at >= now())
          and exists (
            select 1
            from jsonb_array_elements(om.poll_options) opt
            where opt->>'key' = option_key
          )
      )
    )
  )
);

drop policy if exists "owl votes super admin delete" on public.owl_message_votes;
create policy "owl votes super admin delete"
on public.owl_message_votes
for delete
to authenticated
using (public.is_super_admin());

grant select, insert, update, delete on public.owl_message_votes to authenticated;

create or replace view public.v_admin_owl_poll_results as
select
  om.id as message_id,
  om.title,
  om.poll_question,
  om.poll_options,
  om.poll_end_at,
  opt->>'key' as option_key,
  opt->>'label' as option_label,
  count(v.id)::integer as votes_count
from public.owl_messages om
cross join lateral jsonb_array_elements(coalesce(om.poll_options, '[]'::jsonb)) opt
left join public.owl_message_votes v
  on v.message_id = om.id
 and v.option_key = opt->>'key'
where om.poll_enabled = true
group by om.id, om.title, om.poll_question, om.poll_options, om.poll_end_at, option_key, option_label;

grant select on public.v_admin_owl_poll_results to authenticated;

-- Realtime optionnel pour les votes.
do $$
begin
  begin
    alter publication supabase_realtime add table public.owl_message_votes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

select 'patch_v1_8_30_owl_polls_ready' as check_name;
