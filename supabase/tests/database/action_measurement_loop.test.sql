begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into public.tenants (id, name) values
  ('31000000-0000-4000-8000-000000000001', 'Action Loop A'),
  ('32000000-0000-4000-8000-000000000002', 'Action Loop B');

insert into public.tenant_members (tenant_id, user_id, role) values
  ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000011', 'owner'),
  ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000012', 'viewer'),
  ('32000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000021', 'owner');

insert into public.stores (
  id, tenant_id, source_namespace, external_key, name, timezone
) values
  ('31100000-0000-4000-8000-000000000001',
   '31000000-0000-4000-8000-000000000001',
   'test','store-a','Action Loop A Store','Asia/Ho_Chi_Minh'),
  ('32100000-0000-4000-8000-000000000002',
   '32000000-0000-4000-8000-000000000002',
   'test','store-b','Action Loop B Store','Asia/Ho_Chi_Minh');

insert into public.imports (
  id, tenant_id, source_namespace, source_filename, fingerprint,
  status, row_count, source_timezone, committed_at
) values
  ('31200000-0000-4000-8000-000000000001',
   '31000000-0000-4000-8000-000000000001',
   'test','action-loop-a.csv',repeat('a',64),'committed',4,'Asia/Ho_Chi_Minh',now());

insert into public.attention_items (
  id, tenant_id, attention_key, type, severity, metric,
  scope_type, scope_key, current_value, baseline_value,
  delta_value, coverage, evidence, detector_version, status
) values
  ('31300000-0000-4000-8000-000000000001',
   '31000000-0000-4000-8000-000000000001',
   repeat('b',64),'revenue_change','medium','net_sales',
   'store','31100000-0000-4000-8000-000000000001',
   200,150,50,'{}'::jsonb,'{}'::jsonb,'action-loop-test','open'),
  ('32300000-0000-4000-8000-000000000002',
   '32000000-0000-4000-8000-000000000002',
   repeat('c',64),'revenue_change','medium','net_sales',
   'store','32100000-0000-4000-8000-000000000002',
   300,250,50,'{}'::jsonb,'{}'::jsonb,'action-loop-test','open');

insert into public.transaction_line_items (
  id, tenant_id, first_import_id, source_namespace, source_record_key,
  transaction_id, occurred_at, store, store_id, product, quantity, net_amount
) values
  ('31400000-0000-4000-8000-000000000001',
   '31000000-0000-4000-8000-000000000001',
   '31200000-0000-4000-8000-000000000001',
   'pos-a',repeat('1',64),'same-id','2026-09-01T01:00:00Z',
   'Action Loop A Store','31100000-0000-4000-8000-000000000001','Coffee',1,100),
  ('31400000-0000-4000-8000-000000000002',
   '31000000-0000-4000-8000-000000000001',
   '31200000-0000-4000-8000-000000000001',
   'pos-b',repeat('2',64),'same-id','2026-09-01T02:00:00Z',
   'Action Loop A Store','31100000-0000-4000-8000-000000000001','Coffee',1,50),
  ('31400000-0000-4000-8000-000000000003',
   '31000000-0000-4000-8000-000000000001',
   '31200000-0000-4000-8000-000000000001',
   'pos-a',repeat('3',64),'same-id','2026-09-08T01:00:00Z',
   'Action Loop A Store','31100000-0000-4000-8000-000000000001','Coffee',1,120),
  ('31400000-0000-4000-8000-000000000004',
   '31000000-0000-4000-8000-000000000001',
   '31200000-0000-4000-8000-000000000001',
   'pos-b',repeat('4',64),'same-id','2026-09-08T02:00:00Z',
   'Action Loop A Store','31100000-0000-4000-8000-000000000001','Coffee',1,80);

insert into public.actions (
  id, tenant_id, attention_item_id, owner_user_id,
  action_type, title, expected_metric, expected_direction, status
) values (
  '32400000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000002',
  '32300000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000021',
  'investigate','Tenant B action','net_sales','investigate','open'
);

insert into public.measurement_windows (
  id, tenant_id, action_id, metric, scope_type, scope_key,
  baseline_start, baseline_end, measurement_start, measurement_end
) values (
  '32500000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000002',
  '32400000-0000-4000-8000-000000000002',
  'net_sales','store','32100000-0000-4000-8000-000000000002',
  '2026-09-01T00:00:00Z','2026-09-02T00:00:00Z',
  '2026-09-08T00:00:00Z','2026-09-09T00:00:00Z'
);

set local role authenticated;
set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000011';

select lives_ok(
  $$insert into public.actions (
      id, tenant_id, attention_item_id, owner_user_id,
      action_type, title, expected_metric, expected_direction, status
    ) values (
      '31500000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '31300000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000011',
      'investigate','Investigate Store A net sales','net_sales','investigate','open'
    )$$,
  'Owner can create a bounded Action from Attention'
);

select results_eq(
  $$select status from public.attention_items
    where id='31300000-0000-4000-8000-000000000001'::uuid$$,
  ARRAY['acted'::text],
  'Action insert marks linked open Attention as acted'
);

select results_eq(
  $$select count(*) from public.action_status_history
    where action_id='31500000-0000-4000-8000-000000000001'::uuid$$,
  ARRAY[1::bigint],
  'Action insert creates initial audit history'
);

select lives_ok(
  $$update public.actions
    set status='in_progress', updated_at=now()
    where id='31500000-0000-4000-8000-000000000001'::uuid$$,
  'Owner can advance Action to in_progress'
);

select results_eq(
  $$select count(*) from public.action_status_history
    where action_id='31500000-0000-4000-8000-000000000001'::uuid$$,
  ARRAY[2::bigint],
  'Action status change appends audit history'
);

set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000012';

select throws_ok(
  $$insert into public.actions (
      tenant_id, attention_item_id, action_type, title, status
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '31300000-0000-4000-8000-000000000001',
      'investigate','Viewer must not write','open'
    )$$,
  '42501',
  'new row violates row-level security policy for table "actions"',
  'Viewer cannot create Actions'
);

set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000011';

select throws_ok(
  $$insert into public.actions (
      tenant_id, attention_item_id, action_type, title, status
    ) values (
      '32000000-0000-4000-8000-000000000002',
      '32300000-0000-4000-8000-000000000002',
      'investigate','Cross tenant must fail','open'
    )$$,
  '42501',
  'new row violates row-level security policy for table "actions"',
  'Tenant A owner cannot create Tenant B Action'
);

select lives_ok(
  $$insert into public.measurement_windows (
      id, tenant_id, action_id, metric, scope_type, scope_key,
      baseline_start, baseline_end, measurement_start, measurement_end
    ) values (
      '31600000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '31500000-0000-4000-8000-000000000001',
      'net_sales','store','31100000-0000-4000-8000-000000000001',
      '2026-09-01T00:00:00Z','2026-09-02T00:00:00Z',
      '2026-09-08T00:00:00Z','2026-09-09T00:00:00Z'
    )$$,
  'Owner can create a pending Measurement Window'
);

set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000012';

select throws_ok(
  $$insert into public.measurement_windows (
      tenant_id, action_id, metric, scope_type, scope_key,
      baseline_start, baseline_end, measurement_start, measurement_end
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '31500000-0000-4000-8000-000000000001',
      'net_sales','store','31100000-0000-4000-8000-000000000001',
      '2026-09-01T00:00:00Z','2026-09-02T00:00:00Z',
      '2026-09-08T00:00:00Z','2026-09-09T00:00:00Z'
    )$$,
  '42501',
  'new row violates row-level security policy for table "measurement_windows"',
  'Viewer cannot create Measurement Windows'
);

set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000011';

select throws_ok(
  $$insert into public.measurement_windows (
      tenant_id, action_id, metric, scope_type, scope_key,
      baseline_start, baseline_end, measurement_start, measurement_end,
      baseline_value, measured_value, status
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '31500000-0000-4000-8000-000000000001',
      'net_sales','store','31100000-0000-4000-8000-000000000001',
      '2026-09-01T00:00:00Z','2026-09-02T00:00:00Z',
      '2026-09-08T00:00:00Z','2026-09-09T00:00:00Z',
      150,200,'measured'
    )$$,
  '42501',
  'new row violates row-level security policy for table "measurement_windows"',
  'Client cannot insert trusted Measurement values'
);

select results_eq(
  $$select (public.measurement_window_result(
      '31000000-0000-4000-8000-000000000001',
      '31600000-0000-4000-8000-000000000001'
    ) #>> '{baseline,value}')::numeric$$,
  ARRAY[150::numeric],
  'Measurement result computes deterministic baseline net sales'
);

select results_eq(
  $$select (public.measurement_window_result(
      '31000000-0000-4000-8000-000000000001',
      '31600000-0000-4000-8000-000000000001'
    ) #>> '{measurement,value}')::numeric$$,
  ARRAY[200::numeric],
  'Measurement result computes deterministic later net sales'
);

select results_eq(
  $$select (public.measurement_window_result(
      '31000000-0000-4000-8000-000000000001',
      '31600000-0000-4000-8000-000000000001'
    ) #>> '{result,deltaValue}')::numeric$$,
  ARRAY[50::numeric],
  'Measurement result computes before/after delta'
);

select results_eq(
  $$select public.measurement_window_result(
      '31000000-0000-4000-8000-000000000001',
      '31600000-0000-4000-8000-000000000001'
    ) #>> '{result,interpretation}'$$,
  ARRAY['before_after_not_causal'::text],
  'Measurement result explicitly avoids causal attribution'
);

select results_eq(
  $$select public.measurement_window_result(
      '31000000-0000-4000-8000-000000000001',
      '31600000-0000-4000-8000-000000000001'
    ) #>> '{result,status}'$$,
  ARRAY['measured'::text],
  'Viewer can read deterministic Measurement result for own tenant'
);

set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000011';

select throws_ok(
  $$select public.measurement_window_result(
      '32000000-0000-4000-8000-000000000002',
      '32500000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  'tenant access denied',
  'Tenant A caller cannot read Tenant B Measurement result'
);

reset role;

select results_eq(
  $$select
      p.prosecdef,
      has_function_privilege('anon', p.oid, 'EXECUTE'),
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='measurement_window_result'
      and pg_get_function_identity_arguments(p.oid)='p_tenant_id uuid, p_measurement_window_id uuid'$$,
  $$values (false, false, true)$$,
  'Measurement result is SECURITY INVOKER and authenticated-only'
);

select results_eq(
  $$select has_function_privilege(
      'authenticated',
      'private.mark_attention_acted_from_action()',
      'EXECUTE'
    )$$,
  ARRAY[false],
  'Authenticated callers cannot invoke the privileged Attention trigger function directly'
);

select * from finish();
rollback;
