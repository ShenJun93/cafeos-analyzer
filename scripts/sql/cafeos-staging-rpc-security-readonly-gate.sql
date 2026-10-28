-- CafeOS staging Commerce RPC security posture.
-- SELECT-only: no merchant rows, credentials, DDL/DML, migration or privilege changes.
-- A positive preliminary guard result NEVER clears Supabase security warnings.
with targets(signature) as (
  values
    ('public.commerce_create_order(uuid,uuid,text,text,jsonb)'),
    ('public.commerce_capture_payment(uuid,uuid,text,numeric,text)'),
    ('public.commerce_close_day(uuid,uuid,date)')
), rpc as (
  select
    t.signature,
    p.oid is not null as exists_on_database,
    coalesce(p.prosecdef,false) as security_definer,
    coalesce(pg_get_userbyid(p.proowner)='postgres',false) as postgres_owned,
    coalesce(p.proconfig @> array[
      'search_path=pg_catalog, public, private, pg_temp']::text[],false)
      as fixed_search_path,
    coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false)
      as anon_can_execute,
    coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false)
      as authenticated_can_execute,
    coalesce(exists (
      select 1
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE'
    ),false) as public_direct_execute,
    coalesce(position('private.has_tenant_role'
      in pg_get_functiondef(p.oid))>0,false) as checks_tenant_role,
    coalesce(position('auth.uid()'
      in pg_get_functiondef(p.oid))>0,false) as checks_auth_uid
  from targets t
  left join pg_proc p on p.oid=to_regprocedure(t.signature)
), totals as (
  select
    count(*)::int as target_rpc_count,
    count(*) filter (where exists_on_database)::int as installed_rpc_count,
    count(*) filter (where security_definer and postgres_owned)::int
      as privileged_rpc_count,
    count(*) filter (where fixed_search_path)::int as fixed_search_path_count,
    count(*) filter (where anon_can_execute or public_direct_execute)::int
      as untrusted_executable_count,
    count(*) filter (where authenticated_can_execute)::int
      as authenticated_executable_count,
    count(*) filter (where checks_tenant_role and checks_auth_uid)::int
      as explicit_role_guard_count
  from rpc
), helpers as (
  select
    coalesce(p.prosecdef,false) as privileged,
    coalesce(position('auth.uid()' in pg_get_functiondef(p.oid))>0,false)
      as has_auth_uid,
    coalesce(position('public.tenant_members' in pg_get_functiondef(p.oid))>0,false)
      as has_tenant_membership,
    coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false)
      as anon_can_execute
  from (select to_regprocedure('private.has_tenant_role(uuid,text[])')
    as oid) expected
  left join pg_proc p on p.oid=expected.oid
), access_helpers as (
  select
    coalesce(p.prosecdef,false) as privileged,
    coalesce(position('auth.uid()' in pg_get_functiondef(p.oid))>0,false)
      as has_auth_uid,
    coalesce(position('public.tenant_members' in pg_get_functiondef(p.oid))>0,false)
      as has_tenant_membership,
    coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false)
      as anon_can_execute
  from (select to_regprocedure('private.has_tenant_access(uuid)')
    as oid) expected
  left join pg_proc p on p.oid=expected.oid
), tables as (
  select count(*)::int as rls_tables
  from pg_class c
  where c.relnamespace='public'::regnamespace
    and c.relname in (
      'menu_categories','menu_items','pos_orders','pos_order_items',
      'pos_payments','daily_closes')
    and c.relrowsecurity
)
select
  t.*,
  tables.rls_tables,
  not has_schema_privilege('anon','public','CREATE') as anon_cannot_create_public,
  not has_schema_privilege('authenticated','public','CREATE') as auth_cannot_create_public,
  not has_schema_privilege('authenticated','private','CREATE') as auth_cannot_create_private,
  h.privileged and h.has_auth_uid and h.has_tenant_membership
    and not h.anon_can_execute as role_helper_preliminary_guard,
  a.privileged and a.has_auth_uid and a.has_tenant_membership
    and not a.anon_can_execute as access_helper_preliminary_guard,
  case
    when t.target_rpc_count=3 and t.installed_rpc_count=3
      and t.privileged_rpc_count=3
      and t.fixed_search_path_count=3
      and t.untrusted_executable_count=0
      and t.authenticated_executable_count=3
      and t.explicit_role_guard_count=3
      and tables.rls_tables=6
      and not has_schema_privilege('anon','public','CREATE')
      and not has_schema_privilege('authenticated','public','CREATE')
      and not has_schema_privilege('authenticated','private','CREATE')
      and h.privileged and h.has_auth_uid and h.has_tenant_membership
      and not h.anon_can_execute
      and a.privileged and a.has_auth_uid and a.has_tenant_membership
      and not a.anon_can_execute
    then 'PRELIMINARY_GUARDS_PRESENT_SECURITY_REVIEW_REQUIRED'
    else 'STOP_SECURITY_POSTURE_DRIFT'
  end as catalog_posture,
  false as jwt_role_matrix_accepted,
  false as security_advisor_signed_off,
  false as release_approved
from totals t cross join helpers h cross join access_helpers a cross join tables;
