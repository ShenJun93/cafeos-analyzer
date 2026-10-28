begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.tenants(id,name) values
 ('83000000-0000-4000-8000-000000000011','Void fixture tenant A'),
 ('84000000-0000-4000-8000-000000000022','Void fixture tenant B');
insert into public.tenant_members(tenant_id,user_id,role) values
 ('83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000101','owner'),
 ('83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000102','cashier'),
 ('83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000103','viewer'),
 ('84000000-0000-4000-8000-000000000022','84000000-0000-4000-8000-000000000201','owner');
insert into public.stores(id,tenant_id,source_namespace,external_key,name,timezone) values
 ('83100000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000011',
 'synthetic','void-store-a','Void Store A','Asia/Ho_Chi_Minh');
insert into public.menu_items(id,tenant_id,name,price) values
 ('83300000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000011','Void test coffee',35000);

set local role authenticated;
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000102';
select lives_ok(
 $$select public.commerce_create_order(
 '83000000-0000-4000-8000-000000000011',
 '83100000-0000-4000-8000-000000000011',
 'void-test-1','counter',
 '[{"menuItemId":"83300000-0000-4000-8000-000000000011","quantity":1}]'::jsonb
 )$$,'Cashier creates unpaid order');

set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000103';
select throws_ok(
 $$select public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-1'), 'Wrong item entered')$$,
 '42501','COMMERCE_VOID_ROLE_FORBIDDEN','Viewer cannot void');

set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000102';
select throws_ok(
 $$select public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-1'), 'Wrong item entered')$$,
 '42501','COMMERCE_VOID_ROLE_FORBIDDEN','Cashier cannot void');

set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000201';
select throws_ok(
 $$select public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-1'), 'Wrong item entered')$$,
 '42501','COMMERCE_VOID_ROLE_FORBIDDEN','Cross-tenant owner cannot void');

set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000101';
select throws_ok(
 $$select public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-1'), 'no')$$,
 '22023','COMMERCE_VOID_REASON_INVALID','Reason must be substantive');

select throws_ok(
 $$select public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 '83000000-0000-4000-8000-000000000999', 'Wrong item entered')$$,
 'P0002','COMMERCE_ORDER_NOT_FOUND','Cannot void missing order');

select lives_ok(
 $$select public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-1'), 'Wrong item entered')$$,
 'Manager voids unpaid order with audit');

select results_eq(
 $$select status, voided_at is not null from public.pos_orders
   where client_order_key = 'void-test-1'$$,
 $$values ('voided'::text, true)$$,
 'Void order persists terminal state and timestamp');

select results_eq(
 $$select reason, voided_by_user_id from public.pos_order_voids$$,
 $$values ('Wrong item entered'::text, '83000000-0000-4000-8000-000000000101'::uuid)$$,
 'Audit has exact manager actor and reason');

select is(
 (select (public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-1'),
 'Wrong item entered')->>'idempotent')::boolean),
 true, 'Same actor/reason can retry without a second audit row');

select throws_ok(
 $$select public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-1'), 'Different reason')$$,
 '55000','COMMERCE_VOID_CONFLICT','Changed reason cannot overwrite audit');

select results_eq(
 $$select count(*) from public.pos_order_voids$$,
 $$values (1::bigint)$$,
 'Exactly one durable audit receipt');

set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000102';
select throws_ok(
 $$select public.commerce_capture_payment('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-1'),
 'cash',35000,null)$$,
 '55000','COMMERCE_ORDER_NOT_OPEN','Voided order cannot be paid');

select lives_ok(
 $$select public.commerce_create_order('83000000-0000-4000-8000-000000000011',
 '83100000-0000-4000-8000-000000000011','void-test-paid','counter',
 '[{"menuItemId":"83300000-0000-4000-8000-000000000011","quantity":1}]'::jsonb)$$,
 'Cashier creates another order');
select lives_ok(
 $$select public.commerce_capture_payment('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-paid'),
 'cash',35000,null)$$,
 'Cashier settles second order');

set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000101';
select throws_ok(
 $$select public.commerce_void_order('83000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='void-test-paid'), 'Try cancel paid')$$,
 '55000','COMMERCE_ORDER_NOT_OPEN','Paid order cannot be voided without refund');

select lives_ok(
 $$select public.commerce_close_day('83000000-0000-4000-8000-000000000011',
 '83100000-0000-4000-8000-000000000011',null)$$,
 'Voided order does not block deterministic Daily Close');


select results_eq(
 $$select order_count, sales_total, payment_total from public.daily_closes
   where tenant_id='83000000-0000-4000-8000-000000000011'$$,
 $$values (1,35000::numeric,35000::numeric)$$,
 'Daily Close excludes voided order from financial totals');
select ok(
 not has_table_privilege('authenticated','public.pos_order_voids','INSERT')
 and not has_table_privilege('authenticated','public.pos_order_voids','UPDATE')
 and not has_table_privilege('authenticated','public.pos_order_voids','DELETE'),
 'No signed-in client can write or overwrite immutable void audit rows');
select ok(
 not has_function_privilege('anon','public.commerce_void_order(uuid,uuid,text)','EXECUTE')
 and has_function_privilege('authenticated','public.commerce_void_order(uuid,uuid,text)','EXECUTE'),
 'RPC explicitly excludes anon and authenticates manager inside definer function');
-- Audit reason/actor must not leak via RLS to other commerce roles.
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000102';
select results_eq(
 $$select count(*) from public.pos_order_voids where tenant_id =
   '83000000-0000-4000-8000-000000000011'$$,
 array[0::bigint],
 'Cashier cannot read manager-only void reason or actor');
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000101';
select results_eq(
 $$select count(*) from public.pos_order_voids where tenant_id =
   '83000000-0000-4000-8000-000000000011'$$,
 array[1::bigint],
 'Same-Tenant owner may inspect authentic immutable void audit');
select * from finish();
rollback;
