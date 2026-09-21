\set ON_ERROR_STOP on

do $verify$
declare
  v_count bigint;
  v_value text;
begin
  select count(*) into v_count
  from public.tenants
  where id in (
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000002'::uuid
  );
  if v_count <> 2 then
    raise exception 'restore verification failed: expected 2 tenants, got %', v_count;
  end if;

  select count(*) into v_count
  from public.transaction_line_items
  where tenant_id='71000000-0000-4000-8000-000000000001'::uuid;
  if v_count <> 10 then
    raise exception 'restore verification failed: Tenant A line items expected 10, got %', v_count;
  end if;

  select count(*) into v_count
  from public.transaction_line_items
  where tenant_id='72000000-0000-4000-8000-000000000002'::uuid;
  if v_count <> 1 then
    raise exception 'restore verification failed: Tenant B line items expected 1, got %', v_count;
  end if;

  select count(*) into v_count
  from public.actions
  where tenant_id in (
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000002'::uuid
  );
  if v_count <> 2 then
    raise exception 'restore verification failed: actions expected 2, got %', v_count;
  end if;

  select count(*) into v_count
  from public.action_status_history
  where tenant_id in (
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000002'::uuid
  );
  if v_count <> 2 then
    raise exception 'restore verification failed: action history expected 2, got %', v_count;
  end if;

  select count(*) into v_count
  from public.measurement_windows
  where tenant_id in (
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000002'::uuid
  );
  if v_count <> 2 then
    raise exception 'restore verification failed: measurement windows expected 2, got %', v_count;
  end if;

  select max(committed_at)::text into v_value
  from public.imports
  where tenant_id in (
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000002'::uuid
  );
  if v_value is distinct from '2026-09-21 10:00:00+00' then
    raise exception 'restore verification failed: recovery point mismatch: %', v_value;
  end if;
end
$verify$;

set role authenticated;
set request.jwt.claim.sub = '71000000-0000-4000-8000-000000000011';

do $verify$
declare
  v_count bigint;
  v_brief jsonb;
begin
  select count(*) into v_count from public.stores;
  if v_count <> 1 then
    raise exception 'restore RLS verification failed: Tenant A user sees % stores', v_count;
  end if;

  select count(*) into v_count
  from public.stores
  where tenant_id='72000000-0000-4000-8000-000000000002'::uuid;
  if v_count <> 0 then
    raise exception 'restore RLS verification failed: Tenant A can see Tenant B store';
  end if;

  if private.has_tenant_access('72000000-0000-4000-8000-000000000002'::uuid) then
    raise exception 'restore RLS verification failed: Tenant A has Tenant B access';
  end if;

  v_brief := public.daily_brief_aggregate(
    '71000000-0000-4000-8000-000000000001'::uuid
  );

  if v_brief #>> '{asOfBusinessDate}' <> '2026-09-21' then
    raise exception 'restore metric verification failed: as-of date %',
      v_brief #>> '{asOfBusinessDate}';
  end if;
  if v_brief #>> '{metrics,netSales,baselineStatus}' <> 'ready' then
    raise exception 'restore metric verification failed: baseline status %',
      v_brief #>> '{metrics,netSales,baselineStatus}';
  end if;
  if (v_brief #>> '{metrics,netSales,current}')::numeric <> 80 then
    raise exception 'restore metric verification failed: current net sales %',
      v_brief #>> '{metrics,netSales,current}';
  end if;
  if (v_brief #>> '{metrics,netSales,baseline}')::numeric <> 100 then
    raise exception 'restore metric verification failed: baseline net sales %',
      v_brief #>> '{metrics,netSales,baseline}';
  end if;
  if (v_brief #>> '{metrics,orders,current}')::numeric <> 2 then
    raise exception 'restore metric verification failed: current orders %',
      v_brief #>> '{metrics,orders,current}';
  end if;
  if (v_brief #>> '{metrics,aov,current}')::numeric <> 40 then
    raise exception 'restore metric verification failed: current AOV %',
      v_brief #>> '{metrics,aov,current}';
  end if;
end
$verify$;

reset role;

select
  'RESTORE_VERIFY_PASS' as result,
  '2026-09-21T10:00:00Z' as recovered_point,
  2 as tenants,
  11 as transaction_line_items;
