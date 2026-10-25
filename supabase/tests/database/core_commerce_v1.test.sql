begin;

create extension if not exists pgtap with schema extensions;
select plan(37);

insert into public.tenants (id,name) values
 ('71000000-0000-4000-8000-000000000011','Commerce A'),
 ('72000000-0000-4000-8000-000000000022','Commerce B');

insert into public.tenant_members (tenant_id,user_id,role) values
 ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000101','owner'),
 ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000102','cashier'),
 ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000103','viewer'),
 ('72000000-0000-4000-8000-000000000022','72000000-0000-4000-8000-000000000201','owner'),
 ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000104','manager');

insert into public.stores (id,tenant_id,source_namespace,external_key,name,timezone) values
 ('71100000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000011','synthetic','store-a','Commerce Store A','Asia/Ho_Chi_Minh'),
 ('72100000-0000-4000-8000-000000000022','72000000-0000-4000-8000-000000000022','synthetic','store-b','Commerce Store B','Asia/Ho_Chi_Minh');

insert into public.menu_categories (id,tenant_id,name) values
 ('71200000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000011','Coffee'),
 ('72200000-0000-4000-8000-000000000022','72000000-0000-4000-8000-000000000022','Tea');

insert into public.menu_items (id,tenant_id,category_id,name,price) values
 ('71300000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000011','71200000-0000-4000-8000-000000000011','Americano',35000),
 ('72300000-0000-4000-8000-000000000022','72000000-0000-4000-8000-000000000022','72200000-0000-4000-8000-000000000022','Tea',20000);

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000103';
select results_eq(
 $$select count(*) from public.menu_items where tenant_id = '72000000-0000-4000-8000-000000000022'$$,
 array[0::bigint],
 'Tenant A viewer cannot read existing Tenant B menu items'
);
select throws_ok(
 $$select public.commerce_capture_payment('72000000-0000-4000-8000-000000000022','72100000-0000-4000-8000-000000000022','cash',20000,null)$$,
 '42501','COMMERCE_ROLE_FORBIDDEN','Viewer cannot capture a payment across tenants'
);
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000104';
select lives_ok(
 $$insert into public.menu_items (tenant_id,category_id,name,price) values ('71000000-0000-4000-8000-000000000011','71200000-0000-4000-8000-000000000011','Manager item',25000)$$,
 'Manager may create a menu item through its RLS policy'
);
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000103';

select throws_ok(
 $$select public.commerce_create_order(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',
 'receipt-1','counter',
 '[{"menuItemId":"71300000-0000-4000-8000-000000000011","quantity":2}]'::jsonb
 )$$,
 '42501','COMMERCE_ROLE_FORBIDDEN','Viewer cannot create POS orders'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000102';
select throws_ok(
 $$insert into public.menu_items (tenant_id,category_id,name,price) values ('71000000-0000-4000-8000-000000000011','71200000-0000-4000-8000-000000000011','Cashier item',25000)$$,
 '42501','new row violates row-level security policy for table "menu_items"',
 'Cashier cannot create menu items'
);

select throws_ok(
 $$select public.commerce_create_order(
 '72000000-0000-4000-8000-000000000022',
 '72100000-0000-4000-8000-000000000022',
 'receipt-cross','counter',
 '[{"menuItemId":"71300000-0000-4000-8000-000000000011","quantity":1}]'::jsonb
 )$$,
 '42501','COMMERCE_ROLE_FORBIDDEN','Cashier cannot create cross-tenant POS orders'
);

select lives_ok(
 $$select public.commerce_create_order(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',
 'receipt-1','counter',
 '[{"menuItemId":"71300000-0000-4000-8000-000000000011","quantity":2}]'::jsonb
 )$$,
 'Cashier can create a CafeOS-native order'
);

select results_eq(
 $$select total from public.pos_orders
    where client_order_key='receipt-1'$$,
 array[70000::numeric],
 'Order total derives from trusted menu price'
);

select results_eq(
 $$select unit_price from public.pos_order_items
    where order_id=(select id from public.pos_orders where client_order_key='receipt-1')$$,
 array[35000::numeric],
 'Order items retain trusted price snapshots'
);

select lives_ok(
 $$select public.commerce_create_order(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',
 'receipt-1','counter',
 '[{"menuItemId":"71300000-0000-4000-8000-000000000011","quantity":2}]'::jsonb
 )$$,
 'Immediate retry returns existing order'
);

select results_eq(
 $$select count(*) from public.pos_orders where client_order_key='receipt-1'$$,
 array[1::bigint],
 'Immediate retry does not double-book'
);

select throws_ok(
 $$select public.commerce_create_order(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',
 'receipt-1','counter',
 '[{"menuItemId":"71300000-0000-4000-8000-000000000011","quantity":3}]'::jsonb
 )$$,
 '23505','COMMERCE_IDEMPOTENCY_CONFLICT',
 'Conflicting retry is rejected'
);

select throws_ok(
 $$select public.commerce_capture_payment(
 '71000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='receipt-1'),
 'cash',35000,null
 )$$,
 '22023','COMMERCE_PAYMENT_AMOUNT_MISMATCH',
 'Payment cannot settle an incorrect amount'
);

select lives_ok(
 $$select public.commerce_capture_payment(
 '71000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='receipt-1'),
 'cash',70000,null
 )$$,
 'Exact settlement records a captured payment'
);

select results_eq(
 $$select status from public.pos_orders where client_order_key='receipt-1'$$,
 array['paid'::text],
 'Exact settlement atomically marks order paid'
);

-- RLS guarantees that authenticated status lookup remains tenant-isolated.
set local request.jwt.claim.sub = '72000000-0000-4000-8000-000000000201';
select results_eq(
 $$select count(*) from public.pos_orders where tenant_id='71000000-0000-4000-8000-000000000011'$$,
 array[0::bigint],
 'Tenant B owner cannot read Tenant A POS order status'
);
select results_eq(
 $$select count(*) from public.pos_payments where tenant_id='71000000-0000-4000-8000-000000000011'$$,
 array[0::bigint],
 'Tenant B owner cannot read Tenant A payment records'
);
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000102';


select throws_ok(
 $$select public.commerce_capture_payment(
 '71000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='receipt-1'),
 'cash',70000,null
 )$$,
 '55000','COMMERCE_ORDER_NOT_OPEN',
 'Second payment capture cannot charge twice'
);

select results_eq(
 $$select (public.commerce_daily_dashboard(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',null
 ) #>> '{salesTotal}')::numeric$$,
 array[70000::numeric],
 'Dashboard reports first-party paid sales'
);

select lives_ok(
 $$select public.commerce_create_order(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',
 'receipt-2','takeaway',
 '[{"menuItemId":"71300000-0000-4000-8000-000000000011","quantity":1}]'::jsonb
 )$$,
 'Cashier can open a second order'
);

select throws_ok(
 $$select public.commerce_close_day('71000000-0000-4000-8000-000000000011','71100000-0000-4000-8000-000000000011',null)$$,
 '42501','COMMERCE_CLOSE_ROLE_FORBIDDEN','Cashier cannot close a business day'
);
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000101';

select throws_ok(
 $$select public.commerce_close_day(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',null
 )$$,
 '55000','COMMERCE_CLOSE_OPEN_ORDERS',
 'Daily close blocks an unpaid order'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000102';

select lives_ok(
 $$select public.commerce_capture_payment(
 '71000000-0000-4000-8000-000000000011',
 (select id from public.pos_orders where client_order_key='receipt-2'),
 'bank_transfer',35000,null
 )$$,
 'Second order is paid'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000101';

select lives_ok(
 $$select public.commerce_close_day(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',null
 )$$,
 'Manager/owner closes paid business date'
);

select results_eq(
 $$select sales_total from public.daily_closes$$,
 array[105000::numeric],
 'Daily close freezes deterministic sales snapshot'
);

select lives_ok(
 $$select public.commerce_close_day(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',null
 )$$,
 'Repeated daily close is idempotent'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000102';

select lives_ok(
 $$select public.commerce_create_order(
 '71000000-0000-4000-8000-000000000011',
 '71100000-0000-4000-8000-000000000011',
 'receipt-1','counter',
 '[{"menuItemId":"71300000-0000-4000-8000-000000000011","quantity":2}]'::jsonb
 )$$,
 'Retry of an already-created paid order after daily close must be safe'
);

select results_eq(
 $$select count(*) from public.pos_orders$$,
 array[2::bigint],
 'Retry after close never creates a new order'
);

-- Raw trusted Commerce tables and privileged RPCs must remain least-privilege.
select ok(
 not has_table_privilege('authenticated','public.pos_orders','INSERT'),
 'Authenticated POS clients cannot insert trusted orders outside the fixed RPC'
);
select ok(
 not has_table_privilege('authenticated','public.pos_order_items','INSERT'),
 'Authenticated clients cannot insert trusted order price snapshots'
);
select ok(
 not has_table_privilege('authenticated','public.pos_payments','INSERT'),
 'Authenticated clients cannot insert captured payments outside fixed RPC'
);
select ok(
 not has_table_privilege('authenticated','public.daily_closes','INSERT'),
 'Authenticated clients cannot insert daily closes outside fixed RPC'
);
select ok(
 not has_table_privilege('authenticated','public.pos_orders','UPDATE'),
 'Authenticated clients cannot mutate paid order status directly'
);
select ok(
 not has_table_privilege('authenticated','public.pos_payments','UPDATE'),
 'Authenticated clients cannot modify captured payment history'
);
select ok(
 not has_function_privilege('anon','public.commerce_create_order(uuid,uuid,text,text,jsonb)','EXECUTE'),
 'Anonymous users cannot invoke privileged create-order RPC'
);
select ok(
 not has_function_privilege('anon','public.commerce_capture_payment(uuid,uuid,text,numeric,text)','EXECUTE'),
 'Anonymous users cannot invoke privileged payment RPC'
);
select ok(
 not has_function_privilege('anon','public.commerce_close_day(uuid,uuid,date)','EXECUTE'),
 'Anonymous users cannot invoke privileged daily-close RPC'
);

select * from finish();
rollback;
