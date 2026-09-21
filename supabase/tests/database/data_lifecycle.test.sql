begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into public.tenants (id, name) values
  ('50000000-0000-0000-0000-000000000001', 'Delete A'),
  ('60000000-0000-0000-0000-000000000002', 'Keep B');

insert into public.tenant_members (tenant_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'owner'),
  ('60000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'owner');

insert into public.stores (
  id, tenant_id, source_namespace, external_key, name, timezone
) values
  ('51000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   'test','a-store','Delete A Store','Asia/Ho_Chi_Minh'),
  ('61000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002',
   'test','b-store','Keep B Store','Asia/Ho_Chi_Minh');

insert into public.imports (
  id, tenant_id, source_namespace, source_filename, fingerprint, status,
  row_count, source_timezone, committed_at
) values
  ('52000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   'test','a.csv',repeat('a',64),'committed',1,'Asia/Ho_Chi_Minh',now()),
  ('62000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002',
   'test','b.csv',repeat('b',64),'committed',1,'Asia/Ho_Chi_Minh',now());

insert into public.customers (id, tenant_id) values
  ('53000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001'),
  ('63000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002');

insert into public.customer_identifiers (
  id, tenant_id, customer_id, identifier_type, matching_hmac,
  source_namespace, verified
) values
  ('53100000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   '53000000-0000-0000-0000-000000000001',
   'phone',repeat('c',64),'test',true),
  ('63100000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002',
   '63000000-0000-0000-0000-000000000002',
   'phone',repeat('d',64),'test',true);

insert into public.transaction_line_items (
  id, tenant_id, first_import_id, source_namespace, source_record_key,
  transaction_id, occurred_at, store, store_id, product, quantity,
  net_amount, customer_id
) values
  ('54000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   '52000000-0000-0000-0000-000000000001',
   'test',repeat('e',64),'A-1','2026-09-21T01:00:00Z',
   'Delete A Store','51000000-0000-0000-0000-000000000001',
   'Coffee',1,50000,'53000000-0000-0000-0000-000000000001'),
  ('64000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002',
   '62000000-0000-0000-0000-000000000002',
   'test',repeat('f',64),'B-1','2026-09-21T01:00:00Z',
   'Keep B Store','61000000-0000-0000-0000-000000000002',
   'Coffee',1,60000,'63000000-0000-0000-0000-000000000002');

insert into public.attention_items (
  id, tenant_id, attention_key, type, severity, metric,
  scope_type, scope_key, coverage, evidence, detector_version
) values
  ('55000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   repeat('1',64),'revenue_change','medium','net_sales',
   'store','51000000-0000-0000-0000-000000000001',
   '{}'::jsonb,'{}'::jsonb,'lifecycle-test'),
  ('65000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002',
   repeat('2',64),'revenue_change','medium','net_sales',
   'store','61000000-0000-0000-0000-000000000002',
   '{}'::jsonb,'{}'::jsonb,'lifecycle-test');

insert into public.actions (
  id, tenant_id, attention_item_id, owner_user_id,
  action_type, title, status
) values
  ('56000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   '55000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001',
   'investigate','Delete A action','open'),
  ('66000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002',
   '65000000-0000-0000-0000-000000000002',
   'f0000000-0000-0000-0000-000000000001',
   'investigate','Keep B action','open');

insert into public.measurement_windows (
  id, tenant_id, action_id, metric, scope_type, scope_key,
  baseline_start, baseline_end, measurement_start, measurement_end
) values
  ('57000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   '56000000-0000-0000-0000-000000000001',
   'net_sales','store','51000000-0000-0000-0000-000000000001',
   '2026-09-01T00:00:00Z','2026-09-08T00:00:00Z',
   '2026-09-08T00:00:00Z','2026-09-15T00:00:00Z'),
  ('67000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000002',
   '66000000-0000-0000-0000-000000000002',
   'net_sales','store','61000000-0000-0000-0000-000000000002',
   '2026-09-01T00:00:00Z','2026-09-08T00:00:00Z',
   '2026-09-08T00:00:00Z','2026-09-15T00:00:00Z');

select lives_ok(
  $$delete from public.tenants
    where id = '50000000-0000-0000-0000-000000000001'::uuid$$,
  'Tenant hard delete completes without restrictive-FK residue'
);

select results_eq(
  $$select count(*) from public.tenants
    where id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Deleted tenant row is gone'
);

select results_eq(
  $$select count(*) from public.tenant_members
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes memberships'
);

select results_eq(
  $$select count(*) from public.imports
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes imports'
);

select results_eq(
  $$select count(*) from public.transaction_line_items
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes transaction line items'
);

select results_eq(
  $$select count(*) from public.stores
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes stores'
);

select results_eq(
  $$select count(*) from public.customers
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes customers'
);

select results_eq(
  $$select count(*) from public.customer_identifiers
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes matching identifiers'
);

select results_eq(
  $$select count(*) from public.attention_items
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes attention'
);

select results_eq(
  $$select count(*) from public.actions
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes actions'
);

select results_eq(
  $$select count(*) from public.action_status_history
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes action status history'
);

select results_eq(
  $$select count(*) from public.measurement_windows
    where tenant_id='50000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[0::bigint],
  'Tenant deletion removes measurement windows'
);

select results_eq(
  $$select
      (select count(*) from public.tenants where id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.tenant_members where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.imports where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.transaction_line_items where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.stores where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.customers where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.customer_identifiers where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.attention_items where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.actions where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.action_status_history where tenant_id='60000000-0000-0000-0000-000000000002'::uuid),
      (select count(*) from public.measurement_windows where tenant_id='60000000-0000-0000-0000-000000000002'::uuid)$$,
  $$values (1::bigint,1::bigint,1::bigint,1::bigint,1::bigint,1::bigint,1::bigint,1::bigint,1::bigint,1::bigint,1::bigint)$$,
  'Different tenant graph remains untouched'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.stores
    where tenant_id='60000000-0000-0000-0000-000000000002'::uuid$$,
  ARRAY[1::bigint],
  'Valid JWT with membership can read its tenant before offboarding'
);

reset role;

delete from public.tenant_members
where tenant_id='60000000-0000-0000-0000-000000000002'::uuid
  and user_id='f0000000-0000-0000-0000-000000000001'::uuid;

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.stores
    where tenant_id='60000000-0000-0000-0000-000000000002'::uuid$$,
  ARRAY[0::bigint],
  'Removing membership blocks a still-unexpired JWT through RLS'
);

select results_eq(
  $$select private.has_tenant_access(
      '60000000-0000-0000-0000-000000000002'::uuid
    )$$,
  ARRAY[false],
  'Membership removal immediately clears tenant authorization'
);

select * from finish();
rollback;
