-- Incremental Core Commerce future-close safety fix.
-- IMPORTANT: Do not apply on cafeos-staging until migration-history drift
-- is independently reconciled. GitHub Supabase DB CI uses a blank database.
-- Replaces only the close-day RPC; preserves signed-in role checks and grants.
create or replace function public.commerce_close_day(
  p_tenant_id uuid,
  p_store_id uuid,
  p_business_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_timezone text;
  v_business_date date;
  v_open_count integer;
  v_order_count integer;
  v_sales_total numeric(18,2);
  v_payment_total numeric(18,2);
  v_cash_total numeric(18,2);
  v_non_cash_total numeric(18,2);
  v_close record;
begin
  if v_user_id is null
     or not (select private.has_tenant_role(
       p_tenant_id,
       array['owner','admin','manager']::text[]
     )) then
    raise exception 'COMMERCE_CLOSE_ROLE_FORBIDDEN'
      using errcode = '42501';
  end if;

  select s.timezone
  into v_timezone
  from public.stores s
  where s.tenant_id = p_tenant_id
    and s.id = p_store_id
    and s.active;

  if not found then
    raise exception 'COMMERCE_STORE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  v_business_date := coalesce(
    p_business_date,
    (clock_timestamp() at time zone v_timezone)::date
  );

  -- Block closes of future business dates in the Store's own timezone.
  -- Historic dates remain closable for the operator's reconciliation workflow.
  if v_business_date > (clock_timestamp() at time zone v_timezone)::date then
    raise exception 'COMMERCE_CLOSE_FUTURE_DATE'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_tenant_id::text || ':' || p_store_id::text || ':' || v_business_date::text,
      0
    )
  );

  select dc.*
  into v_close
  from public.daily_closes dc
  where dc.tenant_id = p_tenant_id
    and dc.store_id = p_store_id
    and dc.business_date = v_business_date
  limit 1;

  if found then
    return jsonb_build_object(
      'id', v_close.id,
      'tenantId', v_close.tenant_id,
      'storeId', v_close.store_id,
      'businessDate', v_close.business_date,
      'orderCount', v_close.order_count,
      'salesTotal', v_close.sales_total,
      'paymentTotal', v_close.payment_total,
      'cashTotal', v_close.cash_total,
      'nonCashTotal', v_close.non_cash_total,
      'closedByUserId', v_close.closed_by_user_id,
      'closedAt', v_close.closed_at,
      'idempotent', true
    );
  end if;

  select count(*)::integer
  into v_open_count
  from public.pos_orders o
  where o.tenant_id = p_tenant_id
    and o.store_id = p_store_id
    and o.business_date = v_business_date
    and o.status = 'open';

  if v_open_count > 0 then
    raise exception 'COMMERCE_CLOSE_OPEN_ORDERS'
      using errcode = '55000';
  end if;

  select
    count(*)::integer,
    coalesce(sum(o.total), 0)::numeric(18,2)
  into v_order_count, v_sales_total
  from public.pos_orders o
  where o.tenant_id = p_tenant_id
    and o.store_id = p_store_id
    and o.business_date = v_business_date
    and o.status = 'paid';

  select
    coalesce(sum(p.amount), 0)::numeric(18,2),
    coalesce(sum(p.amount) filter (where p.method = 'cash'), 0)::numeric(18,2),
    coalesce(sum(p.amount) filter (where p.method <> 'cash'), 0)::numeric(18,2)
  into v_payment_total, v_cash_total, v_non_cash_total
  from public.pos_payments p
  join public.pos_orders o
    on o.tenant_id = p.tenant_id
   and o.id = p.order_id
  where o.tenant_id = p_tenant_id
    and o.store_id = p_store_id
    and o.business_date = v_business_date
    and o.status = 'paid'
    and p.status = 'captured';

  insert into public.daily_closes (
    tenant_id,
    store_id,
    business_date,
    order_count,
    sales_total,
    payment_total,
    cash_total,
    non_cash_total,
    closed_by_user_id,
    closed_at
  ) values (
    p_tenant_id,
    p_store_id,
    v_business_date,
    v_order_count,
    v_sales_total,
    v_payment_total,
    v_cash_total,
    v_non_cash_total,
    v_user_id,
    clock_timestamp()
  )
  returning * into v_close;

  return jsonb_build_object(
    'id', v_close.id,
    'tenantId', v_close.tenant_id,
    'storeId', v_close.store_id,
    'businessDate', v_close.business_date,
    'orderCount', v_close.order_count,
    'salesTotal', v_close.sales_total,
    'paymentTotal', v_close.payment_total,
    'cashTotal', v_close.cash_total,
    'nonCashTotal', v_close.non_cash_total,
    'closedByUserId', v_close.closed_by_user_id,
    'closedAt', v_close.closed_at,
    'idempotent', false
  );
end;
$$;

revoke all on function public.commerce_close_day(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.commerce_close_day(uuid, uuid, date)
  to authenticated, service_role;
