-- ============================================================
-- LE NID DES PRONOS — V1.9.18
-- Livre d'or / feedback de fin de compétition
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.competition_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  liked text not null default '',
  improve text not null default '',
  thanks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_feedback_has_content check (
    length(btrim(liked)) > 0
    or length(btrim(improve)) > 0
    or length(btrim(thanks)) > 0
  )
);

comment on table public.competition_feedback is
  'Livre d’or de fin de compétition : note, points aimés, améliorations et remerciements.';

create or replace function public.touch_competition_feedback_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_competition_feedback_updated_at on public.competition_feedback;
create trigger trg_competition_feedback_updated_at
before update on public.competition_feedback
for each row execute function public.touch_competition_feedback_updated_at();

alter table public.competition_feedback enable row level security;

drop policy if exists competition_feedback_select_own_or_admin on public.competition_feedback;
create policy competition_feedback_select_own_or_admin
on public.competition_feedback
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin(auth.uid())
);

drop policy if exists competition_feedback_insert_own on public.competition_feedback;
create policy competition_feedback_insert_own
on public.competition_feedback
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists competition_feedback_update_own on public.competition_feedback;
create policy competition_feedback_update_own
on public.competition_feedback
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on public.competition_feedback to authenticated;
