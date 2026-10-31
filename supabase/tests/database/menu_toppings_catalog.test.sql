begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
insert into public.tenants(id,name) values
 ('85000000-0000-4000-8000-000000000001','Topping A'),
 ('86000000-0000-4000-8000-000000000002','Topping B');
insert into public.tenant_members(tenant_id,user_id,role) values
 ('85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000011','manager'),
 ('85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000012','cashier'),
 ('85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000013','viewer'),
 ('86000000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000021','owner');
insert into public.stores(id,tenant_id,source_namespace,external_key,name,timezone) values
 ('85100000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','synthetic','topping-A','Test A','Asia/Ho_Chi_Minh');
insert into public.menu_items(id,tenant_id,name,price) values
 ('85200000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','Latte',35000),
 ('86200000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000002','Tea',19000);

select ok(has_column_privilege('authenticated','public.menu_toppings','price','UPDATE'),
 'Authenticated has topping price UPDATE at column scope');
select ok(not has_column_privilege('authenticated','public.menu_toppings','tenant_id','UPDATE'),
 'Authenticated may not move topping tenant');
select ok(not has_column_privilege('authenticated','public.menu_toppings','menu_item_id','UPDATE'),
 'Authenticated may not move topping to a different Menu item');
select ok(not has_table_privilege('authenticated','public.menu_toppings','DELETE'),
 'No authenticated hard delete of topping configuration');
select ok(not has_table_privilege('anon','public.menu_toppings','SELECT'),
 'Anonymous cannot read topping catalog');
select ok(has_table_privilege('authenticated','public.menu_toppings','INSERT'),
 'Authenticated insert requires manager RLS despite table grant');

set local role authenticated;
set local request.jwt.claim.sub='85000000-0000-4000-8000-000000000011';
select lives_ok($$insert into public.menu_toppings
 (id,tenant_id,menu_item_id,name,price)
 values ('85300000-0000-4000-8000-000000000001',
 '85000000-0000-4000-8000-000000000001',
 '85200000-0000-4000-8000-000000000001','Pearls',5000)$$,
 'Manager can create own tenant topping');
select lives_ok($$update public.menu_toppings set name='White Pearls',price=6000,active=false
 where id='85300000-0000-4000-8000-000000000001'$$,
 'Manager can rename/reprice/archive topping');
select results_eq($$select active from public.menu_items
 where id='85200000-0000-4000-8000-000000000001'$$,
 array[true], 'Archiving topping never archives its parent Menu item');
select lives_ok($$select public.commerce_create_order(
 '85000000-0000-4000-8000-000000000001',
 '85100000-0000-4000-8000-000000000001',
 'unmodified-order','counter',
 '[{"menuItemId":"85200000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
)$$,'Existing base Menu POS order continues unaffected');
select results_eq($$select subtotal from public.pos_orders
 where client_order_key='unmodified-order'$$,
 array[35000::numeric], 'Unmodified POS order never charges configured topping automatically');
select lives_ok($$update public.menu_toppings set active=true
 where id='85300000-0000-4000-8000-000000000001'$$,
 'Manager can restore topping');

set local request.jwt.claim.sub='85000000-0000-4000-8000-000000000012';
select results_eq($$update public.menu_toppings set price=1
 where id='85300000-0000-4000-8000-000000000001' returning price$$,
 array[]::numeric[], 'Cashier cannot change topping price');
set local request.jwt.claim.sub='85000000-0000-4000-8000-000000000013';
select results_eq($$update public.menu_toppings set active=false
 where id='85300000-0000-4000-8000-000000000001' returning active$$,
 array[]::boolean[], 'Viewer cannot archive topping');
set local request.jwt.claim.sub='86000000-0000-4000-8000-000000000021';
select results_eq($$update public.menu_toppings set name='intrusion'
 where id='85300000-0000-4000-8000-000000000001' returning name$$,
 array[]::text[], 'Other tenant cannot mutate topping');
select throws_ok($$insert into public.menu_toppings (tenant_id,menu_item_id,name,price)
 values ('86000000-0000-4000-8000-000000000002',
 '85200000-0000-4000-8000-000000000001','Cross Tenant',1000)$$,
 '23503',null,'Composite menu-item FK prevents cross-tenant topping linkage');

select * from finish();
rollback;
