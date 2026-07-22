-- ============================================================
-- LE NID DES PRONOS — V2.0.0 ÉDITION HOMMAGE
-- Export complet des données Supabase pour le super admin
-- ============================================================

create or replace function public.export_nid_table_list()
returns table(table_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au super administrateur';
  end if;

  return query
  select t.tablename::text
  from pg_catalog.pg_tables t
  where t.schemaname = 'public'
  order by t.tablename;
end;
$$;

create or replace function public.export_nid_table_page(
  p_table_name text,
  p_offset integer default 0,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 1000));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au super administrateur';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and tablename = p_table_name
  ) then
    raise exception 'Table publique inconnue : %', p_table_name;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(src)), ''[]''::jsonb) from (select * from public.%I offset %s limit %s) src',
    p_table_name,
    v_offset,
    v_limit
  ) into v_rows;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

create or replace function public.export_nid_auth_users()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au super administrateur';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'updated_at', u.updated_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at,
    'raw_user_meta_data', u.raw_user_meta_data
  ) order by u.created_at), '[]'::jsonb)
  into v_rows
  from auth.users u;

  return v_rows;
end;
$$;

create or replace function public.export_nid_storage_objects()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_rows jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au super administrateur';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'bucket_id', o.bucket_id,
    'name', o.name,
    'owner', o.owner,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'metadata', o.metadata
  ) order by o.bucket_id, o.name), '[]'::jsonb)
  into v_rows
  from storage.objects o;

  return v_rows;
end;
$$;

revoke all on function public.export_nid_table_list() from public;
revoke all on function public.export_nid_table_page(text, integer, integer) from public;
revoke all on function public.export_nid_auth_users() from public;
revoke all on function public.export_nid_storage_objects() from public;

grant execute on function public.export_nid_table_list() to authenticated;
grant execute on function public.export_nid_table_page(text, integer, integer) to authenticated;
grant execute on function public.export_nid_auth_users() to authenticated;
grant execute on function public.export_nid_storage_objects() to authenticated;
