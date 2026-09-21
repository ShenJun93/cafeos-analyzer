begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select results_eq(
  $$select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'daily_brief_aggregate'
      and pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid, p_as_of_business_date date'$$,
  ARRAY[false],
  'Daily Brief aggregate is SECURITY INVOKER'
);

select results_eq(
  $$select has_function_privilege('anon', 'public.daily_brief_aggregate(uuid,date)', 'EXECUTE')$$,
  ARRAY[false],
  'anon cannot execute Daily Brief aggregate'
);

select results_eq(
  $$select has_function_privilege('authenticated', 'public.daily_brief_aggregate(uuid,date)', 'EXECUTE')$$,
  ARRAY[true],
  'authenticated can execute Daily Brief aggregate'
);

insert into public.tenants (id, name) values
  ('30000000-0000-0000-0000-000000000001', 'Brief A'),
  ('40000000-0000-0000-0000-000000000002', 'Brief B');

insert into public.tenant_members (tenant_id, user_id, role) values
  ('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'owner'),
  ('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'viewer'),
  ('40000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'owner');

insert into public.stores (
  id, tenant_id, source_namespace, external_key, name, timezone, active
) values
  (
    '31000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'pos-a', 'a-store', 'Brief A Store', 'Asia/Ho_Chi_Minh', true
  ),
  (
    '41000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    'pos-b', 'b-store', 'Brief B Store', 'Asia/Ho_Chi_Minh', true
  );

insert into public.imports (
  id, tenant_id, source_namespace, source_filename, fingerprint, status,
  row_count, invalid_row_count, source_timezone, committed_at
) values
  (
    '32000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'seed', 'brief-a.csv', repeat('1',64), 'committed',
    10, 0, 'Asia/Ho_Chi_Minh', '2026-09-21T03:00:00Z'
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    'seed', 'brief-b.csv', repeat('2',64), 'committed',
    1, 0, 'Asia/Ho_Chi_Minh', '2026-09-21T03:00:00Z'
  );

insert into public.transaction_line_items (
  tenant_id, first_import_id, source_namespace, source_record_key,
  transaction_id, occurred_at, store, store_id, product, quantity, net_amount
) values
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('a',64),'O-1','2026-08-24T02:00:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('b',64),'O-1','2026-08-24T02:05:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Tea',1,40),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('c',64),'O-1','2026-08-31T02:00:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('d',64),'O-1','2026-08-31T02:05:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Tea',1,40),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('e',64),'O-1','2026-09-07T02:00:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('f',64),'O-1','2026-09-07T02:05:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Tea',1,40),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('7',64),'O-1','2026-09-14T02:00:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('8',64),'O-1','2026-09-14T02:05:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Tea',1,40),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('9',64),'O-1','2026-09-21T02:00:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('0',64),'O-1','2026-09-21T02:05:00Z','Brief A Store','31000000-0000-0000-0000-000000000001','Tea',1,20),
  ('40000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000002','pos-b',repeat('3',64),'SECRET-1','2026-09-21T02:00:00Z','Brief B Store','41000000-0000-0000-0000-000000000002','Secret',1,9999);

set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';

select results_eq(
  $$select public.daily_brief_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid
    ) #>> '{asOfBusinessDate}'$$,
  ARRAY['2026-09-21'::text],
  'Default as-of date is latest observed store-local business date'
);

select results_eq(
  $$select public.daily_brief_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid
    ) #>> '{metrics,netSales,baselineStatus}'$$,
  ARRAY['ready'::text],
  'Four complete same-weekday samples make baseline ready'
);

select results_eq(
  $$select (public.daily_brief_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid
    ) #>> '{metrics,netSales,current}')::numeric$$,
  ARRAY[80::numeric],
  'Current net sales use only caller-visible Tenant A rows'
);

select results_eq(
  $$select (public.daily_brief_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid
    ) #>> '{metrics,netSales,baseline}')::numeric$$,
  ARRAY[100::numeric],
  'Net-sales baseline averages the exact previous four Mondays'
);

select results_eq(
  $$select
      (brief #>> '{metrics,orders,current}')::numeric,
      (brief #>> '{metrics,orders,baseline}')::numeric
    from (
      select public.daily_brief_aggregate(
        '30000000-0000-0000-0000-000000000001'::uuid
      ) as brief
    ) q$$,
  $$values (2::numeric, 2::numeric)$$,
  'Same transaction ID in two source namespaces counts as two orders'
);

select results_eq(
  $$select
      (brief #>> '{metrics,aov,current}')::numeric,
      (brief #>> '{metrics,aov,baseline}')::numeric
    from (
      select public.daily_brief_aggregate(
        '30000000-0000-0000-0000-000000000001'::uuid
      ) as brief
    ) q$$,
  $$values (40::numeric, 50::numeric)$$,
  'AOV uses source-scoped order count'
);

select results_eq(
  $$select jsonb_array_elements_text(
      public.daily_brief_aggregate(
        '30000000-0000-0000-0000-000000000001'::uuid
      ) #> '{metrics,netSales,baselineDates}'
    )$$,
  ARRAY['2026-08-24','2026-08-31','2026-09-07','2026-09-14']::text[],
  'Baseline exposes exact same-weekday dates'
);

select results_eq(
  $$select
      (brief #>> '{coverage,activeStores}')::integer,
      (brief #>> '{coverage,storesRepresented}')::integer,
      (brief #>> '{coverage,stableStoreMappingRate}')::numeric
    from (
      select public.daily_brief_aggregate(
        '30000000-0000-0000-0000-000000000001'::uuid
      ) as brief
    ) q$$,
  $$values (1, 1, 1::numeric)$$,
  'Coverage reports active, represented, and stable-mapping rate'
);

select throws_ok(
  $$select public.daily_brief_aggregate(
      '40000000-0000-0000-0000-000000000002'::uuid
    )$$,
  '42501',
  'tenant access denied',
  'Tenant A cannot choose Tenant B aggregate'
);

set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';

select results_eq(
  $$select public.daily_brief_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid
    ) #>> '{asOfBusinessDate}'$$,
  ARRAY['2026-09-21'::text],
  'Viewer membership may read the Daily Brief aggregate'
);

select results_eq(
  $$select public.daily_brief_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid,
      '2026-10-05'::date
    ) #>> '{metrics,netSales,baselineStatus}'$$,
  ARRAY['insufficient_history'::text],
  'Missing a required prior weekday reports insufficient_history'
);

select results_eq(
  $$select public.daily_brief_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid,
      '2026-10-05'::date
    ) #> '{metrics,netSales,deltaPct}'$$,
  ARRAY['null'::jsonb],
  'Insufficient history emits no authoritative percentage delta'
);

select results_eq(
  $$select public.daily_brief_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid,
      '2026-10-05'::date
    ) #> '{metrics,netSales,current}'$$,
  ARRAY['null'::jsonb],
  'Missing current rows remain unknown rather than zero sales'
);

select * from finish();
rollback;
