begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into public.tenants(id,name) values
 ('81000000-0000-4000-8000-000000000001','Menu A'),
 ('82000000-0000-4000-8000-000000000002','Menu B');
insert into public.tenant_members(tenant_id,user_id,role) values
 ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000011','manager'),
 ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000012','cashier'),
 ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000013','viewer'),
 ('82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000021','owner');
insert into public.stores(id,tenant_id,source_namespace,external_key,name,timezone) values
 ('81100000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','synthetic','menu-lifecycle-A','Test A','Asia/Ho_Chi_Minh');
insert into public.menu_categories(id,tenant_id,name) values
 ('81200000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Coffee'),
 ('82200000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','Tea');
insert into public.menu_items(id,tenant_id,category_id,name,price) values
 ('81300000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81200000-0000-4000-8000-000000000001','Latte',35000),
 ('82300000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','82200000-0000-4000-8000-000000000002','Tea',19000);

select ok(has_column_privilege('authenticated','public.menu_items','price','UPDATE'),
 'authenticated has price UPDATE at column scope (RLS still required)');
select ok(not has_column_privilege('authenticated','public.menu_items','tenant_id','UPDATE'),
 'tenant ownership cannot be reassigned by authenticated clients');

set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000011';
select lives_ok($$update public.menu_items set name='Latte New', sku='LAT-NEW' where id='81300000-0000-4000-8000-000000000001'$$,
 'Manager can update own menu item');
select is((select name from public.menu_items where id='81300000-0000-4000-8000-000000000001'), 'Latte New',
 'Manager edit persisted');

select lives_ok($$select public.commerce_create_order(
 '81000000-0000-4000-8000-000000000001',
 '81100000-0000-4000-8000-000000000001',
 'menu-lifecycle-before','counter',
 '[{"menuItemId":"81300000-0000-4000-8000-000000000001","quantity":2}]'::jsonb
)$$,'Manager creates an order at original price');
select results_eq(
 $$select unit_price from public.pos_order_items where order_id=(
   select id from public.pos_orders where client_order_key='menu-lifecycle-before')$$,
 array[35000::numeric], 'Original order line stores trusted historical price');
select lives_ok($$update public.menu_items set price=39000, name='Latte Premium'
 where id='81300000-0000-4000-8000-000000000001'$$,
 'Manager can update price for future orders');
select results_eq(
 $$select oi.unit_price from public.pos_order_items oi
   join public.pos_orders o on o.id=oi.order_id
   where o.client_order_key='menu-lifecycle-before'$$,
 array[35000::numeric], 'Historical item price immutable after manager edit');

select lives_ok($$update public.menu_items set active=false
 where id='81300000-0000-4000-8000-000000000001'$$,
 'Manager can archive an item');
select throws_ok($$select public.commerce_create_order(
 '81000000-0000-4000-8000-000000000001',
 '81100000-0000-4000-8000-000000000001',
 'menu-lifecycle-archived','counter',
 '[{"menuItemId":"81300000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
)$$,'P0002','COMMERCE_MENU_ITEM_NOT_FOUND','POS refuses archived item');
select lives_ok($$update public.menu_items set active=true
 where id='81300000-0000-4000-8000-000000000001'$$,
 'Manager can reactivate item');
select lives_ok($$select public.commerce_create_order(
 '81000000-0000-4000-8000-000000000001',
 '81100000-0000-4000-8000-000000000001',
 'menu-lifecycle-after','counter',
 '[{"menuItemId":"81300000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
)$$,'New order can use reactivated item');
select results_eq($$select unit_price from public.pos_order_items
 where order_id=(select id from public.pos_orders where client_order_key='menu-lifecycle-after')$$,
 array[39000::numeric], 'New order uses updated trusted price');

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000012';
select results_eq($$update public.menu_items set price=10000
 where id='81300000-0000-4000-8000-000000000001' returning price$$,
 array[]::numeric[], 'Cashier cannot update Menu (RLS)');
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000013';
select results_eq($$update public.menu_items set active=false
 where id='81300000-0000-4000-8000-000000000001' returning active$$,
 array[]::boolean[], 'Viewer cannot archive Menu (RLS)');
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000021';
select results_eq($$update public.menu_items set price=10000
 where id='81300000-0000-4000-8000-000000000001' returning price$$,
 array[]::numeric[], 'Other Tenant owner cannot edit Menu A');
select throws_ok($$update public.menu_items
 set tenant_id='82000000-0000-4000-8000-000000000002'
 where id='82300000-0000-4000-8000-000000000002'$$,
 '42501',null,'Even owning Tenant B cannot mutate tenant_id column');

select * from finish();
rollback;
