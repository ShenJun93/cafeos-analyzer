begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
insert into public.tenants(id,name) values
 ('83000000-0000-4000-8000-000000000001','Category A'),
 ('84000000-0000-4000-8000-000000000002','Category B');
insert into public.tenant_members(tenant_id,user_id,role) values
 ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011','manager'),
 ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000012','cashier'),
 ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000013','viewer'),
 ('84000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000021','owner');
insert into public.stores(id,tenant_id,source_namespace,external_key,name,timezone) values
 ('83100000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','synthetic','category-test','Test Store','Asia/Ho_Chi_Minh');
insert into public.menu_categories(id,tenant_id,name,sort_order) values
 ('83200000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','Coffee',0),
 ('84200000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000002','Tea',0);
insert into public.menu_items(id,tenant_id,category_id,name,price) values
 ('83300000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','83200000-0000-4000-8000-000000000001','Latte',35000);

select ok(has_column_privilege('authenticated','public.menu_categories','name','UPDATE'),
 'authenticated may update category name subject to RLS');
select ok(has_column_privilege('authenticated','public.menu_categories','sort_order','UPDATE'),
 'authenticated may update category sort order subject to RLS');
select ok(has_column_privilege('authenticated','public.menu_categories','active','UPDATE'),
 'authenticated may toggle category active subject to RLS');
select ok(not has_column_privilege('authenticated','public.menu_categories','tenant_id','UPDATE'),
 'authenticated cannot change category tenant_id');

set local role authenticated;
set local request.jwt.claim.sub='83000000-0000-4000-8000-000000000011';
select lives_ok($$update public.menu_categories
 set name='Espresso',sort_order=10
 where id='83200000-0000-4000-8000-000000000001'$$,
 'Manager can rename and reorder own category');
select results_eq($$select sort_order from public.menu_categories
 where id='83200000-0000-4000-8000-000000000001'$$,
 array[10::integer], 'Manager sort order persists');
select lives_ok($$update public.menu_categories set active=false
 where id='83200000-0000-4000-8000-000000000001'$$,
 'Manager may hide a category');
select results_eq($$select active from public.menu_items
 where id='83300000-0000-4000-8000-000000000001'$$,
 array[true], 'Category archival never archives active items');
select lives_ok($$select public.commerce_create_order(
 '83000000-0000-4000-8000-000000000001',
 '83100000-0000-4000-8000-000000000001',
 'category-archived','counter',
 '[{"menuItemId":"83300000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
)$$, 'Active item can be sold while category hidden');
select lives_ok($$update public.menu_categories set active=true
 where id='83200000-0000-4000-8000-000000000001'$$,
 'Manager may reactivate category');

set local request.jwt.claim.sub='83000000-0000-4000-8000-000000000012';
select results_eq($$update public.menu_categories set active=false
 where id='83200000-0000-4000-8000-000000000001' returning active$$,
 array[]::boolean[], 'Cashier cannot archive category (RLS)');
set local request.jwt.claim.sub='83000000-0000-4000-8000-000000000013';
select results_eq($$update public.menu_categories set sort_order=100
 where id='83200000-0000-4000-8000-000000000001' returning sort_order$$,
 array[]::integer[], 'Viewer cannot reorder category (RLS)');
set local request.jwt.claim.sub='84000000-0000-4000-8000-000000000021';
select results_eq($$update public.menu_categories set name='Intrusion'
 where id='83200000-0000-4000-8000-000000000001' returning name$$,
 array[]::text[], 'Other Tenant owner cannot rename category');
select throws_ok($$update public.menu_categories
 set tenant_id='83000000-0000-4000-8000-000000000001'
 where id='84200000-0000-4000-8000-000000000002'$$,
 '42501',null,'Tenant B owner cannot edit category tenant_id column');

select * from finish();
rollback;
