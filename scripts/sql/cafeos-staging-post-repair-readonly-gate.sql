-- CafeOS staging migration transition gate -- READ ONLY.
-- Phase: PRE_REPAIR | HISTORY_READY_GUARDS_PENDING | STOP_REVIEW_REQUIRED.
-- No automatic authorization for migration repair, schema writes, or production.
-- After guards are actually applied, this pre-deployment check intentionally
-- transitions to STOP_REVIEW_REQUIRED and a separate post-deployment review is needed.
with
expected_canonical(version) as (values
 ('20260921005530'), ('20260921005532'), ('20260921100900'),
 ('20260921164500'), ('20260921170000'), ('20260921201000'),
 ('20260921203000'), ('20261025094352')
),
legacy_receipts(version) as (values
 ('20260921100732'), ('20260921103432'), ('20260921105352'),
 ('20260921133428'), ('20260921141814'), ('20260921151006'),
 ('20261025103648')
),
pending_guards(version) as (values
 ('20261025130000'), ('20261025140000')
),
inventory as (
 select
 (select count(*)::int from supabase_migrations.schema_migrations) as ledger_total,
 (select count(*)::int from expected_canonical c
   join supabase_migrations.schema_migrations m using(version)) as canonical_present,
 (select count(*)::int from legacy_receipts o
   join supabase_migrations.schema_migrations m using(version)) as legacy_present,
 (select count(*)::int from pending_guards g
   join supabase_migrations.schema_migrations m using(version)) as guards_marked_applied,
 (position('COMMERCE_CLOSE_FUTURE_DATE' in
   pg_get_functiondef('public.commerce_close_day(uuid,uuid,date)'::regprocedure)) > 0) as future_guard_live,
 (position('v_snapshot_items' in
   pg_get_functiondef('public.commerce_create_order(uuid,uuid,text,text,jsonb)'::regprocedure)) > 0) as price_guard_live,
 (select count(*)::int from pg_class c
   where c.relnamespace='public'::regnamespace and c.relrowsecurity
   and c.relname in ('menu_categories','menu_items','pos_orders',
                     'pos_order_items','pos_payments','daily_closes')) as commerce_rls_tables,
 (select count(*)::int from pg_proc p
   where p.oid in (
     'public.commerce_create_order(uuid,uuid,text,text,jsonb)'::regprocedure,
     'public.commerce_capture_payment(uuid,uuid,text,numeric,text)'::regprocedure,
     'public.commerce_close_day(uuid,uuid,date)'::regprocedure
   )
   and p.prosecdef
   and p.proconfig @> array['search_path=pg_catalog, public, private, pg_temp']::text[]
   and position('private.has_tenant_role' in pg_get_functiondef(p.oid)) > 0
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and has_function_privilege('authenticated',p.oid,'EXECUTE')
 ) as guarded_rpc_grants,
 (not has_schema_privilege('anon','public','CREATE') and
  not has_schema_privilege('authenticated','public','CREATE') and
  not has_schema_privilege('anon','private','CREATE') and
  not has_schema_privilege('authenticated','private','CREATE')) as untrusted_schema_creates_blocked
)
select *,
 case
 when ledger_total=7 and canonical_present=0 and legacy_present=7
      and guards_marked_applied=0 and not future_guard_live and not price_guard_live
      and commerce_rls_tables=6 and guarded_rpc_grants=3
      and untrusted_schema_creates_blocked
   then 'PRE_REPAIR_NO_GO'
 when ledger_total=8 and canonical_present=8 and legacy_present=0
      and guards_marked_applied=0 and not future_guard_live and not price_guard_live
      and commerce_rls_tables=6 and guarded_rpc_grants=3
      and untrusted_schema_creates_blocked
   then 'HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL'
 else 'STOP_REVIEW_REQUIRED'
 end as audit_phase
from inventory;
