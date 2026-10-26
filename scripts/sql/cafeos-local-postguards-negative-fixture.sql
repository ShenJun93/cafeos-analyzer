-- DISPOSABLE LOCAL DB ONLY: negative financial-audit fixture.
-- Intentionally write an inconsistent open Order to prove that the read-only
-- post-guard audit rejects it. The transaction ALWAYS ROLLS BACK.
-- Invoke using psql -X -q -A -t -v ON_ERROR_STOP=1 -f thisfile.sql
begin;
insert into public.tenants (id,name) values
 ('81000000-0000-4000-8000-000000000061','LOCAL AUDIT NEGATIVE');
insert into public.tenant_members (tenant_id,user_id,role) values
 ('81000000-0000-4000-8000-000000000061','81000000-0000-4000-8000-000000000062','owner');
insert into public.stores (id,tenant_id,source_namespace,external_key,name,timezone) values
 ('81000000-0000-4000-8000-000000000063','81000000-0000-4000-8000-000000000061',
  'synthetic-local','negative-financial-audit','Audit Store','Asia/Ho_Chi_Minh');
-- Deliberately bypass the normal RPC using the scratch-DB superuser.
-- A subtotal of 1000 with zero Order Items MUST trigger bad_order_subtotals>0.
insert into public.pos_orders (
 id,tenant_id,store_id,client_order_key,order_number,request_fingerprint,
 business_date,channel,status,subtotal,discount_total,tax_total,total,
 opened_by_user_id
) values (
 '81000000-0000-4000-8000-000000000064',
 '81000000-0000-4000-8000-000000000061',
 '81000000-0000-4000-8000-000000000063',
 'negative-financial-audit','POS-LOCAL-NEGATIVE',
 repeat('a',64)::char(64),
 (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date,
 'counter','open',1000,0,0,1000,
 '81000000-0000-4000-8000-000000000062'
);
\ir cafeos-staging-post-guards-readonly-gate.sql
rollback;
