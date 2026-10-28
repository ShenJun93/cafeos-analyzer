-- CafeOS Core Commerce post-guard staging audit. READ ONLY.
-- This gate is AFTER both approved SQL migrations, not a release authorization.
-- Requires real authenticated staging HTTP/JWT E2E and owner security signoff.
with canonical(version) as (
  values ('20260921005530'),('20260921005532'),('20260921100900'),
  ('20260921164500'),('20260921170000'),('20260921201000'),
  ('20260921203000'),('20261025094352'),
  ('20261025130000'),('20261025140000')
),
legacy(version) as (
  values ('20260921100732'),('20260921103432'),('20260921105352'),
  ('20260921133428'),('20260921141814'),('20260921151006'),
  ('20261025103648')
),
ledger as (
 select
 (select count(*)::int from supabase_migrations.schema_migrations) as total,
 (select count(*)::int from supabase_migrations.schema_migrations m
  join canonical c using(version)) as canonical_present,
 (select count(*)::int from supabase_migrations.schema_migrations m
  join legacy l using(version)) as legacy_present
),
permissions as (
 select
 (select count(*)::int from pg_class c
    where c.relnamespace='public'::regnamespace and c.relrowsecurity
      and c.relname in ('menu_categories','menu_items','pos_orders',
                         'pos_order_items','pos_payments','daily_closes')) as rls_tables,
 (select count(*)::int from pg_proc p
    where p.oid in (
      'public.commerce_create_order(uuid,uuid,text,text,jsonb)'::regprocedure,
      'public.commerce_capture_payment(uuid,uuid,text,numeric,text)'::regprocedure,
      'public.commerce_close_day(uuid,uuid,date)'::regprocedure)
      and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog, public, private, pg_temp']::text[]
      and position('private.has_tenant_role' in pg_get_functiondef(p.oid)) > 0
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
    ) as guarded_rpc_grants
),
guard_functions as (
 select
 position('COMMERCE_CLOSE_FUTURE_DATE' in
   pg_get_functiondef('public.commerce_close_day(uuid,uuid,date)'::regprocedure)) > 0
   as future_close_guard_live,
 position('v_snapshot_items' in
   pg_get_functiondef('public.commerce_create_order(uuid,uuid,text,text,jsonb)'::regprocedure)) > 0
   as price_snapshot_guard_live
),
facts as (
 select
 (select count(*)::int from public.pos_orders o
   where o.subtotal <> coalesce((
     select sum(i.line_total) from public.pos_order_items i
     where i.tenant_id=o.tenant_id and i.order_id=o.id
   ),0)) as bad_order_subtotals,
 (select count(*)::int from public.pos_orders o
   left join lateral (
     select count(*)::int as payment_count, coalesce(sum(p.amount),0) as paid_total
     from public.pos_payments p
     where p.tenant_id=o.tenant_id and p.order_id=o.id and p.status='captured'
   ) p on true
   where (o.status='paid' and (p.payment_count <> 1 or p.paid_total <> o.total))
      or (o.status<>'paid' and p.payment_count > 0)
 ) as bad_payment_states,
 (select count(*)::int from public.daily_closes dc
   left join lateral (
     select count(*) filter (where status='paid')::int as paid_count,
            count(*) filter (where status='open')::int as open_count,
            coalesce(sum(o.total) filter (where status='paid'),0) as sales_total
     from public.pos_orders o
     where o.tenant_id=dc.tenant_id and o.store_id=dc.store_id
       and o.business_date=dc.business_date
   ) orders on true
   left join lateral (
     select coalesce(sum(p.amount),0) as payment_total,
            coalesce(sum(p.amount) filter (where p.method='cash'),0) as cash_total,
            coalesce(sum(p.amount) filter (where p.method<>'cash'),0) as non_cash_total
     from public.pos_payments p
     join public.pos_orders o on o.tenant_id=p.tenant_id and o.id=p.order_id
     where o.tenant_id=dc.tenant_id and o.store_id=dc.store_id
       and o.business_date=dc.business_date and o.status='paid'
       and p.status='captured'
   ) payments on true
   where orders.open_count <> 0
      or dc.order_count <> orders.paid_count
      or dc.sales_total <> orders.sales_total
      or dc.payment_total <> payments.payment_total
      or dc.cash_total <> payments.cash_total
      or dc.non_cash_total <> payments.non_cash_total
 ) as bad_daily_closes
)
select *,
 case
 when ledger.total=10 and ledger.canonical_present=10 and ledger.legacy_present=0
      and permissions.rls_tables=6 and permissions.guarded_rpc_grants=3
      and guard_functions.future_close_guard_live
      and guard_functions.price_snapshot_guard_live
      and facts.bad_order_subtotals=0 and facts.bad_payment_states=0
      and facts.bad_daily_closes=0
   then 'POST_GUARDS_READY_FOR_AUTH_E2E'
 else 'POST_GUARDS_NOT_READY_REVIEW'
 end as audit_phase
from ledger cross join permissions cross join guard_functions cross join facts;
