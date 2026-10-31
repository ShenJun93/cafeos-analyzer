begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into public.tenants(id,name) values
 ('87000000-0000-4000-8000-000000000001','Billable A'),
 ('88000000-0000-4000-8000-000000000002','Billable B');
insert into public.tenant_members(tenant_id,user_id,role) values
 ('87000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000011','manager'),
 ('87000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000012','cashier'),
 ('88000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000021','owner');
insert into public.stores(id,tenant_id,source_namespace,external_key,name,timezone) values
 ('87100000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','synthetic','billable-A','Billable synthetic A','Asia/Ho_Chi_Minh');
insert into public.menu_items(id,tenant_id,name,price) values
 ('87200000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','Latte',50000),
 ('87200000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001','Tea',20000),
 ('88200000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000002','Other Tenant Tea',22000);
insert into public.menu_toppings(id,tenant_id,menu_item_id,name,price,active) values
 ('87300000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','Pearls',5000,true),
 ('87300000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','Cream',3000,true),
 ('87300000-0000-4000-8000-000000000003','87000000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000002','Tea jelly',3000,true),
 ('88300000-0000-4000-8000-000000000004','88000000-0000-4000-8000-000000000002','88200000-0000-4000-8000-000000000002','Foreign',1000,true);

select ok(not has_column_privilege('authenticated','public.pos_order_items','toppings_snapshot','INSERT'),
 'Authenticated cannot insert topping financial snapshots directly');
select ok(not has_column_privilege('authenticated','public.pos_order_items','base_unit_price','UPDATE'),
 'Authenticated cannot mutate historic base unit price');

set local role authenticated;
set local request.jwt.claim.sub='87000000-0000-4000-8000-000000000012';
select lives_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001',
 'old-base-only','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
)$$,'Legacy base-only order remains valid');
select results_eq($$select subtotal from public.pos_orders
 where client_order_key='old-base-only'$$,
 array[50000::numeric],'Legacy base-only price unchanged');

select lives_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001',
 'toppings-priced','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":2,"toppingIds":["87300000-0000-4000-8000-000000000001","87300000-0000-4000-8000-000000000002"]},{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
)$$,'Cashier creates mixed topping and base-only lines');
select results_eq($$select subtotal from public.pos_orders
 where client_order_key='toppings-priced'$$,
 array[166000::numeric],'Only selected toppings are billed, server owned');
select is((select count(*) from public.pos_order_items oi join public.pos_orders o on o.id=oi.order_id
 where o.client_order_key='toppings-priced')::integer,2,'Separate line snapshots for same item, different variants');
select results_eq($$select unit_price from public.pos_order_items oi
 join public.pos_orders o on o.id=oi.order_id
 where o.client_order_key='toppings-priced' and oi.toppings_snapshot <> '[]'::jsonb$$,
 array[58000::numeric],'Selected topping line has trusted combined unit price');
select results_eq($$select base_unit_price from public.pos_order_items oi
 join public.pos_orders o on o.id=oi.order_id
 where o.client_order_key='toppings-priced' and oi.toppings_snapshot <> '[]'::jsonb$$,
 array[50000::numeric],'Topping-bearing line preserves trusted base unit price');
select is((select jsonb_array_length(oi.toppings_snapshot) from public.pos_order_items oi
 join public.pos_orders o on o.id=oi.order_id
 where o.client_order_key='toppings-priced' and oi.toppings_snapshot <> '[]'::jsonb),2,
 'Both topping names/prices are snapshotted');
select results_eq($$select unit_price from public.pos_order_items oi
 join public.pos_orders o on o.id=oi.order_id
 where o.client_order_key='toppings-priced' and oi.toppings_snapshot = '[]'::jsonb$$,
 array[50000::numeric],'Base-only variant on the same order is unchanged');
select lives_ok($$select public.commerce_capture_payment(
 '87000000-0000-4000-8000-000000000001',
 (select id from public.pos_orders where client_order_key='toppings-priced'),
 'cash',166000,null
)$$,'Payment captures exact trusted topping-inclusive total');
select results_eq($$select sum(amount) from public.pos_payments p
 join public.pos_orders o on o.id=p.order_id where o.client_order_key='toppings-priced'$$,
 array[166000::numeric],'Payment and order amount reconcile');

set local request.jwt.claim.sub='87000000-0000-4000-8000-000000000011';
select lives_ok($$update public.menu_toppings set name='New name',price=9000,active=false
 where id='87300000-0000-4000-8000-000000000001'$$,
 'Manager can change current topping catalog');
select results_eq($$select oi.unit_price from public.pos_order_items oi
 join public.pos_orders o on o.id=oi.order_id
 where o.client_order_key='toppings-priced' and oi.toppings_snapshot <> '[]'::jsonb$$,
 array[58000::numeric],'Paid historic unit price cannot change after topping reprice');
select is((select oi.toppings_snapshot #>> '{0,name}' from public.pos_order_items oi
 join public.pos_orders o on o.id=oi.order_id
 where o.client_order_key='toppings-priced' and oi.toppings_snapshot <> '[]'::jsonb),
 'Pearls','Historic topping name stays immutable');
set local request.jwt.claim.sub='87000000-0000-4000-8000-000000000012';
select results_eq($$select (public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001','toppings-priced','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":2,"toppingIds":["87300000-0000-4000-8000-000000000001","87300000-0000-4000-8000-000000000002"]},{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
)->'order'->>'subtotal')::numeric$$,
 array[166000::numeric],'Exact same intent/key retrieves paid order despite current topping archive');
select throws_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001','toppings-priced','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":2}]'::jsonb
)$$,'23505','COMMERCE_IDEMPOTENCY_CONFLICT','Same key with different toppings is a conflict');
select throws_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001','archived-new','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1,"toppingIds":["87300000-0000-4000-8000-000000000001"]}]'::jsonb
)$$,'P0002','COMMERCE_TOPPING_NOT_FOUND','New sales reject archived toppings');
select throws_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001','wrong-item','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1,"toppingIds":["87300000-0000-4000-8000-000000000003"]}]'::jsonb
)$$,'P0002','COMMERCE_TOPPING_NOT_FOUND','Topping from another item cannot be charged');
select throws_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001','wrong-tenant','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1,"toppingIds":["88300000-0000-4000-8000-000000000004"]}]'::jsonb
)$$,'P0002','COMMERCE_TOPPING_NOT_FOUND','Cross-Tenant topping cannot be charged');
select throws_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001','duplicate','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1,"toppingIds":["87300000-0000-4000-8000-000000000002","87300000-0000-4000-8000-000000000002"]}]'::jsonb
)$$,'22023','COMMERCE_TOPPINGS_DUPLICATE','Duplicate topping cannot be double charged');
select throws_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001','invalid-type','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1,"toppingIds":"not-array"}]'::jsonb
)$$,'22023','COMMERCE_TOPPINGS_INVALID','Topping selection must be an array');
select throws_ok($$select public.commerce_create_order(
 '87000000-0000-4000-8000-000000000001',
 '87100000-0000-4000-8000-000000000001','untrusted-price','counter',
 '[{"menuItemId":"87200000-0000-4000-8000-000000000001","quantity":1,"toppingIds":[],"unitPrice":1}]'::jsonb
)$$,'22023','COMMERCE_ITEMS_INVALID','Client-supplied prices cannot cross trusted SQL boundary');
select results_eq($$select count(*)::integer from public.pos_orders
 where client_order_key in ('archived-new','wrong-item','wrong-tenant','duplicate','invalid-type','untrusted-price')$$,
 array[0::integer],'Rejected topping attempts never create partial orders');

select * from finish();
rollback;
