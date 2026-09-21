-- CafeOS shared deterministic metric window + Store Health read model (issue #53).
-- One metric-sample primitive is reused by Daily Brief and Store Health.

create or replace function private.metric_window_samples(
  p_tenant_id uuid,
  p_store_id uuid default null,
  p_as_of_business_date date default null
)
returns table (
  as_of_business_date date,
  business_date date,
  age_weeks integer,
  net_sales numeric,
  orders bigint,
  aov numeric,
  stores_represented integer,
  has_data boolean
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if (select auth.uid()) is null
     or not (select private.has_tenant_access(p_tenant_id)) then
    raise exception 'tenant access denied'
      using errcode = '42501';
  end if;

  return query
  with
  scope_date as (
    select coalesce(
      p_as_of_business_date,
      max((tli.occurred_at at time zone s.timezone)::date)
    ) as value
    from public.transaction_line_items tli
    join public.stores s
      on s.tenant_id = tli.tenant_id
     and s.id = tli.store_id
     and s.active
    where tli.tenant_id = p_tenant_id
  ),
  requested_dates as (
    select sd.value as business_date, 0::integer as age_weeks
    from scope_date sd
    where sd.value is not null
    union all
    select sd.value - (g.weeks * 7), g.weeks
    from scope_date sd
    cross join (values (1), (2), (3), (4)) as g(weeks)
    where sd.value is not null
  ),
  mapped as (
    select
      tli.source_namespace,
      tli.transaction_id,
      tli.net_amount,
      tli.store_id,
      (tli.occurred_at at time zone s.timezone)::date as business_date
    from public.transaction_line_items tli
    join public.stores s
      on s.tenant_id = tli.tenant_id
     and s.id = tli.store_id
     and s.active
    where tli.tenant_id = p_tenant_id
      and (p_store_id is null or tli.store_id = p_store_id)
  ),
  daily as (
    select
      m.business_date,
      sum(m.net_amount)::numeric as net_sales,
      count(distinct (m.source_namespace, m.transaction_id))::bigint as orders,
      count(distinct m.store_id)::integer as stores_represented
    from mapped m
    join requested_dates rd
      on rd.business_date = m.business_date
    group by m.business_date
  )
  select
    sd.value as as_of_business_date,
    rd.business_date,
    rd.age_weeks,
    d.net_sales,
    d.orders,
    case when d.orders > 0 then d.net_sales / d.orders else null end as aov,
    coalesce(d.stores_represented, 0)::integer as stores_represented,
    (d.business_date is not null) as has_data
  from scope_date sd
  join requested_dates rd on true
  left join daily d
    on d.business_date = rd.business_date
  order by rd.age_weeks;
end;
$$;

revoke all on function private.metric_window_samples(uuid, uuid, date) from public, anon;
grant execute on function private.metric_window_samples(uuid, uuid, date) to authenticated;

comment on function private.metric_window_samples(uuid, uuid, date) is
  'Shared RLS-safe five-sample metric window for Daily Brief and Store Health. Uses Store-local business dates and source-scoped order identity.';

create or replace function public.daily_brief_aggregate(
  p_tenant_id uuid,
  p_as_of_business_date date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_as_of date;
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not (select private.has_tenant_access(p_tenant_id)) then
    raise exception 'tenant access denied'
      using errcode = '42501';
  end if;

  select max(s.as_of_business_date)
  into v_as_of
  from private.metric_window_samples(
    p_tenant_id,
    null,
    p_as_of_business_date
  ) s;

  with
  active_store_count as (
    select count(*)::integer as value
    from public.stores s
    where s.tenant_id = p_tenant_id
      and s.active
  ),
  freshness as (
    select
      (
        select max(i.committed_at)
        from public.imports i
        where i.tenant_id = p_tenant_id
          and i.status = 'committed'
      ) as latest_committed_import_at,
      (
        select max(tli.occurred_at)
        from public.transaction_line_items tli
        where tli.tenant_id = p_tenant_id
      ) as latest_observed_transaction_at
  ),
  mapping_coverage as (
    select
      count(*)::bigint as total_rows,
      count(*) filter (where tli.store_id is not null)::bigint as mapped_rows
    from public.transaction_line_items tli
    where tli.tenant_id = p_tenant_id
  ),
  samples as (
    select *
    from private.metric_window_samples(
      p_tenant_id,
      null,
      p_as_of_business_date
    )
  ),
  current_sample as (
    select s.*
    from samples s
    where s.age_weeks = 0
  ),
  baseline_samples as (
    select s.*
    from samples s
    where s.age_weeks between 1 and 4
  ),
  baseline_state as (
    select
      case
        when v_as_of is null
          or count(*) filter (where bs.has_data) <> 4
          then 'insufficient_history'
        when (select value from active_store_count) <= 0
          or coalesce((select cs.stores_represented from current_sample cs), 0)
             <> (select value from active_store_count)
          or not bool_and(
            bs.stores_represented = (select value from active_store_count)
          )
          then 'insufficient_coverage'
        else 'ready'
      end as status
    from baseline_samples bs
  ),
  baseline_values as (
    select
      avg(bs.net_sales) as net_sales,
      avg(bs.orders::numeric) as orders,
      avg(bs.aov) as aov
    from baseline_samples bs
    where bs.has_data
  ),
  evidence as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', bs.business_date,
            'storesRepresented', bs.stores_represented,
            'hasData', bs.has_data
          )
          order by bs.business_date
        ),
        '[]'::jsonb
      ) as baseline_samples,
      coalesce(
        jsonb_agg(to_jsonb(bs.business_date) order by bs.business_date),
        '[]'::jsonb
      ) as baseline_dates
    from baseline_samples bs
  )
  select jsonb_build_object(
    'tenantId', p_tenant_id,
    'asOfBusinessDate', v_as_of,
    'freshness', jsonb_build_object(
      'latestCommittedImportAt', f.latest_committed_import_at,
      'latestObservedTransactionAt', f.latest_observed_transaction_at
    ),
    'coverage', jsonb_build_object(
      'activeStores', ascnt.value,
      'storesRepresented', coalesce(cs.stores_represented, 0),
      'stableStoreMappingRate',
        case
          when mc.total_rows = 0 then null
          else mc.mapped_rows::numeric / mc.total_rows
        end,
      'baselineSamples', e.baseline_samples
    ),
    'metrics', jsonb_build_object(
      'netSales', jsonb_build_object(
        'current', cs.net_sales,
        'baseline', case when bs.status = 'ready' then bv.net_sales else null end,
        'deltaPct',
          case
            when bs.status = 'ready' and bv.net_sales <> 0
              then cs.net_sales / bv.net_sales - 1
            else null
          end,
        'baselineType', 'same_weekday_4w',
        'baselineDates', e.baseline_dates,
        'baselineStatus', bs.status
      ),
      'orders', jsonb_build_object(
        'current', cs.orders,
        'baseline', case when bs.status = 'ready' then bv.orders else null end,
        'deltaPct',
          case
            when bs.status = 'ready' and bv.orders <> 0
              then cs.orders::numeric / bv.orders - 1
            else null
          end,
        'baselineType', 'same_weekday_4w',
        'baselineDates', e.baseline_dates,
        'baselineStatus', bs.status
      ),
      'aov', jsonb_build_object(
        'current', cs.aov,
        'baseline', case when bs.status = 'ready' then bv.aov else null end,
        'deltaPct',
          case
            when bs.status = 'ready' and bv.aov <> 0
              then cs.aov / bv.aov - 1
            else null
          end,
        'baselineType', 'same_weekday_4w',
        'baselineDates', e.baseline_dates,
        'baselineStatus', bs.status
      )
    )
  )
  into v_result
  from active_store_count ascnt
  cross join freshness f
  cross join mapping_coverage mc
  cross join baseline_state bs
  cross join baseline_values bv
  cross join evidence e
  left join current_sample cs on true;

  return v_result;
end;
$$;

revoke all on function public.daily_brief_aggregate(uuid, date) from public, anon;
grant execute on function public.daily_brief_aggregate(uuid, date) to authenticated;

comment on function public.daily_brief_aggregate(uuid, date) is
  'RLS-safe deterministic Daily Brief aggregate backed by the shared metric-window primitive.';

create or replace function public.store_health_aggregate(
  p_tenant_id uuid,
  p_store_id uuid,
  p_as_of_business_date date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_store record;
  v_as_of date;
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not (select private.has_tenant_access(p_tenant_id)) then
    raise exception 'tenant access denied'
      using errcode = '42501';
  end if;

  select s.id, s.name, s.timezone, s.active
  into v_store
  from public.stores s
  where s.tenant_id = p_tenant_id
    and s.id = p_store_id
    and s.active;

  if not found then
    raise exception 'store access denied'
      using errcode = '42501';
  end if;

  select max(s.as_of_business_date)
  into v_as_of
  from private.metric_window_samples(
    p_tenant_id,
    p_store_id,
    p_as_of_business_date
  ) s;

  with
  freshness as (
    select
      (
        select max(i.committed_at)
        from public.imports i
        where i.tenant_id = p_tenant_id
          and i.status = 'committed'
      ) as latest_committed_import_at,
      (
        select max(tli.occurred_at)
        from public.transaction_line_items tli
        where tli.tenant_id = p_tenant_id
          and tli.store_id = p_store_id
      ) as latest_observed_transaction_at
  ),
  samples as (
    select *
    from private.metric_window_samples(
      p_tenant_id,
      p_store_id,
      p_as_of_business_date
    )
  ),
  current_sample as (
    select s.*
    from samples s
    where s.age_weeks = 0
  ),
  baseline_samples as (
    select s.*
    from samples s
    where s.age_weeks between 1 and 4
  ),
  baseline_state as (
    select
      case
        when v_as_of is null
          or count(*) filter (where bs.has_data) <> 4
          then 'insufficient_history'
        when coalesce((select cs.has_data from current_sample cs), false) = false
          then 'insufficient_coverage'
        else 'ready'
      end as status
    from baseline_samples bs
  ),
  baseline_values as (
    select
      avg(bs.net_sales) as net_sales,
      avg(bs.orders::numeric) as orders,
      avg(bs.aov) as aov
    from baseline_samples bs
    where bs.has_data
  ),
  evidence as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', bs.business_date,
            'hasData', bs.has_data
          )
          order by bs.business_date
        ),
        '[]'::jsonb
      ) as baseline_samples,
      coalesce(
        jsonb_agg(to_jsonb(bs.business_date) order by bs.business_date),
        '[]'::jsonb
      ) as baseline_dates
    from baseline_samples bs
  )
  select jsonb_build_object(
    'tenantId', p_tenant_id,
    'store', jsonb_build_object(
      'id', v_store.id,
      'name', v_store.name,
      'timezone', v_store.timezone,
      'active', v_store.active
    ),
    'asOfBusinessDate', v_as_of,
    'freshness', jsonb_build_object(
      'latestCommittedImportAt', f.latest_committed_import_at,
      'latestObservedTransactionAt', f.latest_observed_transaction_at
    ),
    'coverage', jsonb_build_object(
      'currentHasData', coalesce(cs.has_data, false),
      'baselineSamples', e.baseline_samples
    ),
    'metrics', jsonb_build_object(
      'netSales', jsonb_build_object(
        'current', cs.net_sales,
        'baseline', case when bs.status = 'ready' then bv.net_sales else null end,
        'deltaPct',
          case
            when bs.status = 'ready' and bv.net_sales <> 0
              then cs.net_sales / bv.net_sales - 1
            else null
          end,
        'baselineType', 'same_weekday_4w',
        'baselineDates', e.baseline_dates,
        'baselineStatus', bs.status
      ),
      'orders', jsonb_build_object(
        'current', cs.orders,
        'baseline', case when bs.status = 'ready' then bv.orders else null end,
        'deltaPct',
          case
            when bs.status = 'ready' and bv.orders <> 0
              then cs.orders::numeric / bv.orders - 1
            else null
          end,
        'baselineType', 'same_weekday_4w',
        'baselineDates', e.baseline_dates,
        'baselineStatus', bs.status
      ),
      'aov', jsonb_build_object(
        'current', cs.aov,
        'baseline', case when bs.status = 'ready' then bv.aov else null end,
        'deltaPct',
          case
            when bs.status = 'ready' and bv.aov <> 0
              then cs.aov / bv.aov - 1
            else null
          end,
        'baselineType', 'same_weekday_4w',
        'baselineDates', e.baseline_dates,
        'baselineStatus', bs.status
      )
    )
  )
  into v_result
  from freshness f
  cross join baseline_state bs
  cross join baseline_values bv
  cross join evidence e
  left join current_sample cs on true;

  return v_result;
end;
$$;

revoke all on function public.store_health_aggregate(uuid, uuid, date) from public, anon;
grant execute on function public.store_health_aggregate(uuid, uuid, date) to authenticated;

comment on function public.store_health_aggregate(uuid, uuid, date) is
  'RLS-safe deterministic Store Health aggregate using the same metric-window primitive as Daily Brief.';
