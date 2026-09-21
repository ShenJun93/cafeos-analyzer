begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into public.tenants (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Cafe A'),
  ('20000000-0000-0000-0000-000000000002', 'Cafe B');

insert into public.tenant_members (tenant_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'viewer'),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'owner');

insert into public.stores (
  id, tenant_id, source_namespace, external_key, name, timezone
) values
  (
    '11000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'test', 'a-store', 'A Store', 'Asia/Ho_Chi_Minh'
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'test', 'b-store', 'B Store', 'Asia/Ho_Chi_Minh'
  );

insert into public.imports (
  id, tenant_id, source_namespace, source_filename, fingerprint, status, row_count
) values
  ('12000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'test','a.csv',repeat('c',64),'committed',1),
  ('22000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002',
   'test','b.csv',repeat('d',64),'committed',1);

insert into public.attention_items (
  id, tenant_id, attention_key, type, severity, metric,
  scope_type, scope_key, current_value, baseline_value,
  delta_value, coverage, evidence, detector_version
) values
  (
    '13000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    repeat('a', 64), 'revenue_change', 'medium', 'net_sales',
    'store', '11000000-0000-0000-0000-000000000001',
    90, 100, -10, '{}'::jsonb, '{}'::jsonb, 'test-v1'
  ),
  (
    '23000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    repeat('b', 64), 'revenue_change', 'medium', 'net_sales',
    'store', '22000000-0000-0000-0000-000000000002',
    190, 200, -10, '{}'::jsonb, '{}'::jsonb, 'test-v1'
  );

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.stores$$,
  ARRAY[1::bigint],
  'Tenant A owner sees only one Tenant A store'
);

select results_eq(
  $$select count(*) from public.stores
    where tenant_id = '20000000-0000-0000-0000-000000000002'::uuid$$,
  ARRAY[0::bigint],
  'Tenant A owner cannot read Tenant B stores'
);

select lives_ok(
  $$insert into public.actions (
      id, tenant_id, attention_item_id, owner_user_id,
      action_type, title, status
    ) values (
      '14000000-0000-0000-0000-000000000001'::uuid,
      '10000000-0000-0000-0000-000000000001'::uuid,
      '13000000-0000-0000-0000-000000000001'::uuid,
      'a0000000-0000-0000-0000-000000000001'::uuid,
      'investigate', 'Investigate revenue decline', 'open'
    )$$,
  'Tenant A owner can create a bounded action'
);

select lives_ok(
  $q$insert into public.transaction_line_items (
      tenant_id, first_import_id, source_namespace, source_record_key,
      transaction_id, occurred_at, store, product, quantity, net_amount
    ) values (
      '10000000-0000-0000-0000-000000000001'::uuid,
      '12000000-0000-0000-0000-000000000001'::uuid,
      'test', repeat('e',64), 'same-tenant', '2026-09-01T00:00:00Z',
      'A Store', 'Coffee', 1, 50000
    )$q$,
  'Same-tenant import lineage is allowed'
);

select throws_ok(
  $q$insert into public.transaction_line_items (
      tenant_id, first_import_id, source_namespace, source_record_key,
      transaction_id, occurred_at, store, product, quantity, net_amount
    ) values (
      '10000000-0000-0000-0000-000000000001'::uuid,
      '22000000-0000-0000-0000-000000000003'::uuid,
      'test', repeat('f',64), 'cross-tenant', '2026-09-01T00:00:00Z',
      'A Store', 'Coffee', 1, 50000
    )$q$,
  '23503',
  'insert or update on table "transaction_line_items" violates foreign key constraint "transaction_line_items_first_import_fk"',
  'Cross-tenant import lineage is rejected'
);

select results_eq(
  $$select count(*) from public.action_status_history
    where action_id = '14000000-0000-0000-0000-000000000001'::uuid$$,
  ARRAY[1::bigint],
  'Action insert creates audit history'
);

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';

select throws_ok(
  $$insert into public.actions (
      tenant_id, action_type, title, status
    ) values (
      '10000000-0000-0000-0000-000000000001'::uuid,
      'investigate', 'Viewer must not write', 'open'
    )$$,
  '42501',
  'new row violates row-level security policy for table "actions"',
  'Viewer cannot create actions'
);

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

select throws_ok(
  $$insert into public.actions (
      tenant_id, action_type, title, status
    ) values (
      '20000000-0000-0000-0000-000000000002'::uuid,
      'investigate', 'Cross tenant must fail', 'open'
    )$$,
  '42501',
  'new row violates row-level security policy for table "actions"',
  'Tenant A owner cannot create Tenant B action'
);

select throws_ok(
  $$select count(*) from public.customer_identifiers$$,
  '42501',
  'permission denied for table customer_identifiers',
  'Customer matching identifiers are not exposed to authenticated users'
);

select lives_ok(
  $$insert into public.measurement_windows (
      id, tenant_id, action_id, metric, scope_type, scope_key,
      baseline_start, baseline_end, measurement_start, measurement_end
    ) values (
      '15000000-0000-0000-0000-000000000001'::uuid,
      '10000000-0000-0000-0000-000000000001'::uuid,
      '14000000-0000-0000-0000-000000000001'::uuid,
      'net_sales', 'store', '11000000-0000-0000-0000-000000000001',
      '2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z',
      '2026-09-08T00:00:00Z', '2026-09-15T00:00:00Z'
    )$$,
  'Operator can create a pending measurement window'
);

select throws_ok(
  $$update public.measurement_windows
    set baseline_value = 100, measured_value = 110, status = 'measured'
    where id = '15000000-0000-0000-0000-000000000001'::uuid$$,
  '42501',
  'permission denied for table measurement_windows',
  'Authenticated client cannot write trusted measurement values'
);

select results_eq(
  $$select count(*) from public.measurement_windows
    where id = '15000000-0000-0000-0000-000000000001'::uuid
      and status = 'pending'
      and baseline_value is null
      and measured_value is null
      and delta_value is null$$,
  ARRAY[1::bigint],
  'Blocked measurement update leaves trusted values untouched'
);

select * from finish();
rollback;