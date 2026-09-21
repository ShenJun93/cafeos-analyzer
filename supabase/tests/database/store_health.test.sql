begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select results_eq(
  $$select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname='metric_window_samples'
      and pg_get_function_identity_arguments(p.oid) =
        'p_tenant_id uuid, p_store_id uuid, p_as_of_business_date date'$$,
  ARRAY[false],
  'shared metric-window primitive is SECURITY INVOKER'
);

select results_eq(
  $$select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='store_health_aggregate'
      and pg_get_function_identity_arguments(p.oid) =
        'p_tenant_id uuid, p_store_id uuid, p_as_of_business_date date'$$,
  ARRAY[false],
  'Store Health aggregate is SECURITY INVOKER'
);

select results_eq(
  $$select has_function_privilege(
    'anon',
    'public.store_health_aggregate(uuid,uuid,date)',
    'EXECUTE'
  )$$,
  ARRAY[false],
  'anon cannot execute Store Health aggregate'
);

select results_eq(
  $$select has_function_privilege(
    'authenticated',
    'public.store_health_aggregate(uuid,uuid,date)',
    'EXECUTE'
  )$$,
  ARRAY[true],
  'authenticated may execute Store Health aggregate'
);

insert into public.tenants (id,name) values
  ('30000000-0000-0000-0000-000000000001','Store Health A'),
  ('40000000-0000-0000-0000-000000000002','Store Health B');

insert into public.tenant_members (tenant_id,user_id,role) values
  ('30000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','owner'),
  ('30000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','viewer'),
  ('40000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','owner');

insert into public.stores (
  id,tenant_id,source_namespace,external_key,name,timezone,active
) values
  ('31000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'pos-a','hcm','HCM Store','Asia/Ho_Chi_Minh',true),
  ('31000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000001',
   'pos-a','la','LA Store','America/Los_Angeles',true),
  ('41000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000002',
   'pos-b','secret','Secret Store','Asia/Ho_Chi_Minh',true);

insert into public.imports (
  id,tenant_id,source_namespace,source_filename,fingerprint,status,
  row_count,invalid_row_count,source_timezone,committed_at
) values
  ('32000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'seed','a.csv',repeat('1',64),'committed',11,0,'Asia/Ho_Chi_Minh','2026-09-21T03:00:00Z'),
  ('42000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000002',
   'seed','b.csv',repeat('2',64),'committed',1,0,'Asia/Ho_Chi_Minh','2026-09-21T03:00:00Z');

insert into public.transaction_line_items (
  tenant_id,first_import_id,source_namespace,source_record_key,
  transaction_id,occurred_at,store,store_id,product,quantity,net_amount
) values
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('a',64),'O-1','2026-08-24T02:00:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('b',64),'O-1','2026-08-24T02:05:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Tea',1,40),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('c',64),'O-1','2026-08-31T02:00:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('d',64),'O-1','2026-08-31T02:05:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Tea',1,40),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('e',64),'O-1','2026-09-07T02:00:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('f',64),'O-1','2026-09-07T02:05:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Tea',1,40),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('7',64),'O-1','2026-09-14T02:00:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('8',64),'O-1','2026-09-14T02:05:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Tea',1,40),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('9',64),'O-1','2026-09-21T02:00:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Coffee',1,60),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-b',repeat('0',64),'O-1','2026-09-21T02:05:00Z','HCM Store','31000000-0000-0000-0000-000000000001','Tea',1,20),
  ('30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','pos-a',repeat('3',64),'LA-1','2026-09-21T01:00:00Z','LA Store','31000000-0000-0000-0000-000000000002','Coffee',1,30),
  ('40000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000001','pos-b',repeat('4',64),'SECRET','2026-09-21T02:00:00Z','Secret Store','41000000-0000-0000-0000-000000000001','Secret',1,9999);

set local role authenticated;
set local request.jwt.claim.sub='c0000000-0000-0000-0000-000000000001';

select results_eq(
  $$select public.store_health_aggregate(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '31000000-0000-0000-0000-000000000001'::uuid
  ) #>> '{asOfBusinessDate}'$$,
  ARRAY['2026-09-21'::text],
  'Store Health defaults to tenant-aligned latest business date'
);

select results_eq(
  $$select
      (h #>> '{metrics,netSales,current}')::numeric,
      (h #>> '{metrics,orders,current}')::numeric,
      (h #>> '{metrics,aov,current}')::numeric
    from (
      select public.store_health_aggregate(
        '30000000-0000-0000-0000-000000000001'::uuid,
        '31000000-0000-0000-0000-000000000001'::uuid
      ) h
    ) q$$,
  $$values (80::numeric,2::numeric,40::numeric)$$,
  'Store Health current metrics use source-scoped order identity'
);

select results_eq(
  $$select
      (h #>> '{metrics,netSales,baseline}')::numeric,
      (h #>> '{metrics,orders,baseline}')::numeric,
      (h #>> '{metrics,aov,baseline}')::numeric
    from (
      select public.store_health_aggregate(
        '30000000-0000-0000-0000-000000000001'::uuid,
        '31000000-0000-0000-0000-000000000001'::uuid
      ) h
    ) q$$,
  $$values (100::numeric,2::numeric,50::numeric)$$,
  'Store Health baseline reuses exact four-week deterministic semantics'
);

select results_eq(
  $$select public.store_health_aggregate(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '31000000-0000-0000-0000-000000000001'::uuid
  ) #>> '{metrics,netSales,baselineStatus}'$$,
  ARRAY['ready'::text],
  'complete Store history makes baseline ready'
);

select results_eq(
  $$select jsonb_array_elements_text(
    public.store_health_aggregate(
      '30000000-0000-0000-0000-000000000001'::uuid,
      '31000000-0000-0000-0000-000000000001'::uuid
    ) #> '{metrics,netSales,baselineDates}'
  )$$,
  ARRAY['2026-08-24','2026-08-31','2026-09-07','2026-09-14']::text[],
  'Store Health exposes exact baseline dates'
);

select results_eq(
  $$select
      h #>> '{store,name}',
      h #>> '{store,timezone}',
      h #>> '{coverage,currentHasData}'
    from (
      select public.store_health_aggregate(
        '30000000-0000-0000-0000-000000000001'::uuid,
        '31000000-0000-0000-0000-000000000001'::uuid
      ) h
    ) q$$,
  $$values ('HCM Store'::text,'Asia/Ho_Chi_Minh'::text,'true'::text)$$,
  'Store Health returns Store identity, timezone, and current coverage'
);

select results_eq(
  $$select public.store_health_aggregate(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '31000000-0000-0000-0000-000000000002'::uuid
  ) #>> '{asOfBusinessDate}'$$,
  ARRAY['2026-09-21'::text],
  'Store Health keeps tenant-aligned date even when selected Store latest local date is earlier'
);

select results_eq(
  $$select
      h #>> '{asOfBusinessDate}',
      (h #>> '{metrics,netSales,current}')::numeric,
      h #>> '{metrics,netSales,baselineStatus}'
    from (
      select public.store_health_aggregate(
        '30000000-0000-0000-0000-000000000001'::uuid,
        '31000000-0000-0000-0000-000000000002'::uuid,
        '2026-09-20'::date
      ) h
    ) q$$,
  $$values ('2026-09-20'::text,30::numeric,'insufficient_history'::text)$$,
  'America/Los_Angeles Store maps the UTC-boundary transaction to its local business date'
);

select results_eq(
  $$select public.store_health_aggregate(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '31000000-0000-0000-0000-000000000002'::uuid,
    '2026-09-20'::date
  ) #> '{metrics,netSales,deltaPct}'$$,
  ARRAY['null'::jsonb],
  'insufficient Store history emits no authoritative delta'
);

select throws_ok(
  $$select public.store_health_aggregate(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '41000000-0000-0000-0000-000000000001'::uuid
  )$$,
  '42501',
  'store access denied',
  'Tenant A cannot select a Tenant B Store'
);

select throws_ok(
  $$select public.store_health_aggregate(
    '40000000-0000-0000-0000-000000000002'::uuid,
    '41000000-0000-0000-0000-000000000001'::uuid
  )$$,
  '42501',
  'tenant access denied',
  'Tenant A cannot choose Tenant B aggregate scope'
);

set local request.jwt.claim.sub='c0000000-0000-0000-0000-000000000002';

select results_eq(
  $$select public.store_health_aggregate(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '31000000-0000-0000-0000-000000000001'::uuid
  ) #>> '{store,id}'$$,
  ARRAY['31000000-0000-0000-0000-000000000001'::text],
  'viewer membership may read Store Health'
);

select results_eq(
  $$select
      s.orders,
      s.net_sales,
      s.aov
    from private.metric_window_samples(
      '30000000-0000-0000-0000-000000000001'::uuid,
      '31000000-0000-0000-0000-000000000001'::uuid,
      '2026-09-21'::date
    ) s
    where s.age_weeks=0$$,
  $$values (2::bigint,80::numeric,40::numeric)$$,
  'shared metric-window primitive exposes the same Store current metrics'
);

select results_eq(
  $$select public.daily_brief_aggregate(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '2026-09-21'::date
  ) #>> '{asOfBusinessDate}'$$,
  ARRAY['2026-09-21'::text],
  'Daily Brief remains callable after shared-primitive refactor'
);

select * from finish();
rollback;
