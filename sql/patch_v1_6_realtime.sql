-- ============================================================
-- LE NID DES PRONOS — PATCH V1.6 REALTIME
-- Active les tables utiles dans la publication Supabase Realtime.
-- À lancer dans Supabase SQL Editor.
-- ============================================================

do $$
begin
  begin
    alter publication supabase_realtime add table public.matches;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.prediction_points;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.predictions;
  exception when duplicate_object then
    null;
  end;
end $$;

-- Vérification rapide :
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('matches', 'prediction_points', 'predictions')
order by tablename;
