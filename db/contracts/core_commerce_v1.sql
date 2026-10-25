-- CafeOS Core Commerce v1.
-- First-party Menu -> POS Order -> Payment Record -> Daily Close.
-- Trusted order/payment/close writes are exposed only through hardened fixed RPCs.
-- Raw commerce fact tables stay read-only to authenticated clients.

alter table public.tenant_members
  drop constraint if exists tenant_members_role_check;

alter table public.tenant_members
  add constraint tenant_members_role_check
  check (role in ('owner','admin','manager','cashier','analyst','viewer'));

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_categories_tenant_id_id_key unique (tenant_id, id)
);

create unique index if not exists menu_categories_tenant_name_key
  on public.menu_categories (tenant_id, lower(btrim(name)));

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid,
  sku text,
  name text not null check (char_length(btrim(name)) between 1 and 300),
  price numeric(18,2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_items_tenant_id_id_key unique (tenant_id, id),
  constraint menu_items_category_fk
    foreign key (tenant_id, category_id)
    references public.menu_categories(tenant_id, id)
    on delete restrict,
  constraint menu_items_sku_check
    check (sku is null or char_length(btrim(sku)) between 1 and 100)
);

create unique index if not exists menu_items_tenant_sku_key
  on public.menu_items (tenant_id, sku)
  where sku is not null;

create index if not exists menu_items_tenant_category_idx
  on public.menu_items (tenant_id, category_id)
  where category_id is not null;

create table if not exists public.pos_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null,
  client_order_key text not null
    check (char_length(client_order_key) between 1 and 128),
  order_number text not null
    check (char_length(order_number) between 1 and 100),
  request_fingerprint char(64) not null
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  business_date date not null,
  channel text not null
    check (channel in ('counter','takeaway','pickup','delivery')),
  status text not null default 'open'
    check (status in ('open','paid','voided')),
  subtotal numeric(18,2) not null
    check (subtotal >= 0),
  discount_total numeric(18,2) not null default 0
    check (discount_total >= 0),
  tax_total numeric(18,2) not null default 0
    check (tax_total >= 0),
  total numeric(18,2) not null
    check (total >= 0),
  opened_by_user_id uuid not null,
  opened_at timestamptz not null default now(),
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_orders_store_fk
    foreign key (tenant_id, store_id)
    references public.stores(tenant_id, id)
    on delete restrict,
  constraint pos_orders_opened_by_fk
    foreign key (tenant_id, opened_by_user_id)
    references public.tenant_members(tenant_id, user_id)
    on delete restrict,
  constraint pos_orders_tenant_id_id_key unique (tenant_id, id),
  constraint pos_orders_client_key unique (tenant_id, store_id, client_order_key),
  constraint pos_orders_number_key unique (tenant_id, store_id, order_number),
  constraint pos_orders_total_math_check
    check (total = subtotal - discount_total + tax_total),
  constraint pos_orders_paid_at_check
    check (
      (status = 'paid' and paid_at is not null and voided_at is null)
      or (status = 'voided' and voided_at is not null and paid_at is null)
      or (status = 'open' and paid_at is null and voided_at is null)
    )
);

create index if not exists pos_orders_tenant_store_business_date_idx
  on public.pos_orders (tenant_id, store_id, business_date, status);

create index if not exists pos_orders_tenant_opened_by_idx
  on public.pos_orders (tenant_id, opened_by_user_id);

create table if not exists public.pos_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null,
  menu_item_id uuid not null,
  item_name text not null,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  quantity numeric(12,3) not null check (quantity > 0),
  line_total numeric(18,2)
    generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  constraint pos_order_items_order_fk
    foreign key (tenant_id, order_id)
    references public.pos_orders(tenant_id, id)
    on delete cascade,
  constraint pos_order_items_menu_item_fk
    foreign key (tenant_id, menu_item_id)
    references public.menu_items(tenant_id, id)
    on delete restrict,
  constraint pos_order_items_tenant_id_id_key unique (tenant_id, id)
);

create index if not exists pos_order_items_tenant_order_idx
  on public.pos_order_items (tenant_id, order_id);

create index if not exists pos_order_items_tenant_menu_item_idx
  on public.pos_order_items (tenant_id, menu_item_id);

create table if not exists public.pos_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null,
  method text not null
    check (method in ('cash','card','bank_transfer','wallet','other')),
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'captured'
    check (status = 'captured'),
  reference text
    check (reference is null or char_length(reference) <= 500),
  recorded_by_user_id uuid not null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_payments_order_fk
    foreign key (tenant_id, order_id)
    references public.pos_orders(tenant_id, id)
    on delete restrict,
  constraint pos_payments_recorded_by_fk
    foreign key (tenant_id, recorded_by_user_id)
    references public.tenant_members(tenant_id, user_id)
    on delete restrict,
  constraint pos_payments_tenant_id_id_key unique (tenant_id, id)
);

create unique index if not exists pos_payments_one_captured_per_order_idx
  on public.pos_payments (tenant_id, order_id)
  where status = 'captured';

create index if not exists pos_payments_tenant_order_idx
  on public.pos_payments (tenant_id, order_id);

create index if not exists pos_payments_tenant_recorded_by_idx
  on public.pos_payments (tenant_id, recorded_by_user_id);

create table if not exists public.daily_closes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null,
  business_date date not null,
  order_count integer not null check (order_count >= 0),
  sales_total numeric(18,2) not null check (sales_total >= 0),
  payment_total numeric(18,2) not null check (payment_total >= 0),
  cash_total numeric(18,2) not null check (cash_total >= 0),
  non_cash_total numeric(18,2) not null check (non_cash_total >= 0),
  closed_by_user_id uuid not null,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint daily_closes_store_fk
    foreign key (tenant_id, store_id)
    references public.stores(tenant_id, id)
    on delete restrict,
  constraint daily_closes_closed_by_fk
    foreign key (tenant_id, closed_by_user_id)
    references public.tenant_members(tenant_id, user_id)
    on delete restrict,
  constraint daily_closes_tenant_store_date_key
    unique (tenant_id, store_id, business_date),
  constraint daily_closes_balance_check
    check (payment_total = cash_total + non_cash_total)
);

create index if not exists daily_closes_tenant_store_date_idx
  on public.daily_closes (tenant_id, store_id, business_date);

create index if not exists daily_closes_tenant_closed_by_idx
  on public.daily_closes (tenant_id, closed_by_user_id);

alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.pos_payments enable row level security;
alter table public.daily_closes enable row level security;

revoke all on table public.menu_categories from anon, authenticated;
revoke all on table public.menu_items from anon, authenticated;
revoke all on table public.pos_orders from anon, authenticated;
revoke all on table public.pos_order_items from anon, authenticated;
revoke all on table public.pos_payments from anon, authenticated;
revoke all on table public.daily_closes from anon, authenticated;

grant select, insert on table public.menu_categories to authenticated;
grant select, insert on table public.menu_items to authenticated;
grant select on table public.pos_orders to authenticated;
grant select on table public.pos_order_items to authenticated;
grant select on table public.pos_payments to authenticated;
grant select on table public.daily_closes to authenticated;

grant select, insert, update, delete on table public.menu_categories to service_role;
grant select, insert, update, delete on table public.menu_items to service_role;
grant select, insert, update, delete on table public.pos_orders to service_role;
grant select, insert, update, delete on table public.pos_order_items to service_role;
grant select, insert, update, delete on table public.pos_payments to service_role;
grant select, insert, update, delete on table public.daily_closes to service_role;

create policy menu_categories_member_select
  on public.menu_categories for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy menu_categories_manager_insert
  on public.menu_categories for insert
  to authenticated
  with check (
    (select private.has_tenant_role(
      tenant_id,
      array['owner','admin','manager']::text[]
    ))
  );

create policy menu_items_member_select
  on public.menu_items for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy menu_items_manager_insert
  on public.menu_items for insert
  to authenticated
  with check (
    (select private.has_tenant_role(
      tenant_id,
      array['owner','admin','manager']::text[]
    ))
    and (
      category_id is null
      or exists (
        select 1
        from public.menu_categories mc
        where mc.tenant_id = menu_items.tenant_id
          and mc.id = menu_items.category_id
      )
    )
  );

create policy pos_orders_member_select
  on public.pos_orders for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy pos_order_items_member_select
  on public.pos_order_items for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy pos_payments_member_select
  on public.pos_payments for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy daily_closes_member_select
  on public.daily_closes for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create or replace function public.commerce_create_order(
  p_tenant_id uuid,
  p_store_id uuid,
  p_client_order_key text,
  p_channel text,
  p_items jsonb
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
  v_client_order_key text := btrim(coalesce(p_client_order_key, ''));
  v_channel text := btrim(coalesce(p_channel, ''));
  v_request_fingerprint char(64);
  v_order_id uuid;
  v_order_number text;
  v_existing record;
  v_menu record;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity numeric(12,3);
  v_subtotal numeric(18,2) := 0;
  v_result jsonb;
begin
  if v_user_id is null
     or not (select private.has_tenant_role(
       p_tenant_id,
       array['owner','admin','manager','cashier']::text[]
     )) then
    raise exception 'COMMERCE_ROLE_FORBIDDEN'
      using errcode = '42501';
  end if;

  if char_length(v_client_order_key) < 1
     or char_length(v_client_order_key) > 128 then
    raise exception 'COMMERCE_CLIENT_ORDER_KEY_INVALID'
      using errcode = '22023';
  end if;

  if v_channel not in ('counter','takeaway','pickup','delivery') then
    raise exception 'COMMERCE_CHANNEL_INVALID'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'COMMERCE_ITEMS_INVALID'
      using errcode = '22023';
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

  -- A retry must resolve to the original order even if its business date has
  -- since been closed. Lock the intent key independently of the business day,
  -- then check for an existing matching request BEFORE the daily-close gate.
  v_request_fingerprint := encode(
    sha256(convert_to(
      p_store_id::text || '|' ||
      v_client_order_key || '|' ||
      v_channel || '|' ||
      p_items::text,
      'UTF8'
    )),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'commerce:client-order-key:' ||
      p_tenant_id::text || ':' || p_store_id::text || ':' || v_client_order_key,
      0
    )
  );

  select o.id, o.request_fingerprint
  into v_existing
  from public.pos_orders o
  where o.tenant_id = p_tenant_id
    and o.store_id = p_store_id
    and o.client_order_key = v_client_order_key
  limit 1;

  if found then
    if v_existing.request_fingerprint <> v_request_fingerprint then
      raise exception 'COMMERCE_IDEMPOTENCY_CONFLICT'
        using errcode = '23505';
    end if;
    v_order_id := v_existing.id;
  else
    v_business_date := (clock_timestamp() at time zone v_timezone)::date;
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_tenant_id::text || ':' || p_store_id::text || ':' || v_business_date::text,
        0
      )
    );

    if exists (
      select 1
      from public.daily_closes dc
      where dc.tenant_id = p_tenant_id
        and dc.store_id = p_store_id
        and dc.business_date = v_business_date
    ) then
      raise exception 'COMMERCE_DAY_CLOSED'
        using errcode = '55000';
    end if;
    for v_item in
      select value from jsonb_array_elements(p_items)
    loop
      if jsonb_typeof(v_item) <> 'object'
         or exists (
           select 1
           from jsonb_object_keys(v_item) as k(key)
           where k.key not in ('menuItemId','quantity')
         )
         or coalesce(v_item->>'menuItemId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or coalesce(v_item->>'quantity', '') !~ '^[0-9]+([.][0-9]{1,3})?$' then
        raise exception 'COMMERCE_ITEMS_INVALID'
          using errcode = '22023';
      end if;

      v_menu_item_id := (v_item->>'menuItemId')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;

      if v_quantity <= 0 then
        raise exception 'COMMERCE_QUANTITY_INVALID'
          using errcode = '22023';
      end if;

      select mi.id, mi.name, mi.price
      into v_menu
      from public.menu_items mi
      where mi.tenant_id = p_tenant_id
        and mi.id = v_menu_item_id
        and mi.active;

      if not found then
        raise exception 'COMMERCE_MENU_ITEM_NOT_FOUND'
          using errcode = 'P0002';
      end if;

      v_subtotal := v_subtotal + (v_menu.price * v_quantity);
    end loop;

    if v_subtotal <= 0 then
      raise exception 'COMMERCE_ORDER_TOTAL_INVALID'
        using errcode = '22023';
    end if;

    v_order_id := gen_random_uuid();
    v_order_number := 'POS-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 10));

    insert into public.pos_orders (
      id,
      tenant_id,
      store_id,
      client_order_key,
      order_number,
      request_fingerprint,
      business_date,
      channel,
      status,
      subtotal,
      discount_total,
      tax_total,
      total,
      opened_by_user_id,
      opened_at,
      created_at,
      updated_at
    ) values (
      v_order_id,
      p_tenant_id,
      p_store_id,
      v_client_order_key,
      v_order_number,
      v_request_fingerprint,
      v_business_date,
      v_channel,
      'open',
      v_subtotal,
      0,
      0,
      v_subtotal,
      v_user_id,
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp()
    );

    for v_item in
      select value from jsonb_array_elements(p_items)
    loop
      v_menu_item_id := (v_item->>'menuItemId')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;

      select mi.id, mi.name, mi.price
      into v_menu
      from public.menu_items mi
      where mi.tenant_id = p_tenant_id
        and mi.id = v_menu_item_id
        and mi.active;

      insert into public.pos_order_items (
        tenant_id,
        order_id,
        menu_item_id,
        item_name,
        unit_price,
        quantity
      ) values (
        p_tenant_id,
        v_order_id,
        v_menu.id,
        v_menu.name,
        v_menu.price,
        v_quantity
      );
    end loop;
  end if;

  select jsonb_build_object(
    'order',
    jsonb_build_object(
      'id', o.id,
      'tenantId', o.tenant_id,
      'storeId', o.store_id,
      'clientOrderKey', o.client_order_key,
      'orderNumber', o.order_number,
      'businessDate', o.business_date,
      'channel', o.channel,
      'status', o.status,
      'subtotal', o.subtotal,
      'discountTotal', o.discount_total,
      'taxTotal', o.tax_total,
      'total', o.total,
      'openedAt', o.opened_at,
      'paidAt', o.paid_at
    ),
    'items',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'menuItemId', oi.menu_item_id,
          'name', oi.item_name,
          'unitPrice', oi.unit_price,
          'quantity', oi.quantity,
          'lineTotal', oi.line_total
        )
        order by oi.created_at, oi.id
      )
      from public.pos_order_items oi
      where oi.tenant_id = p_tenant_id
        and oi.order_id = o.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.pos_orders o
  where o.tenant_id = p_tenant_id
    and o.id = v_order_id;

  return v_result;
end;
$$;

revoke all on function public.commerce_create_order(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.commerce_create_order(uuid, uuid, text, text, jsonb)
  to authenticated, service_role;

create or replace function public.commerce_capture_payment(
  p_tenant_id uuid,
  p_order_id uuid,
  p_method text,
  p_amount numeric,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_method text := btrim(coalesce(p_method, ''));
  v_order record;
  v_paid numeric(18,2);
  v_remaining numeric(18,2);
  v_payment record;
begin
  if v_user_id is null
     or not (select private.has_tenant_role(
       p_tenant_id,
       array['owner','admin','manager','cashier']::text[]
     )) then
    raise exception 'COMMERCE_ROLE_FORBIDDEN'
      using errcode = '42501';
  end if;

  if v_method not in ('cash','card','bank_transfer','wallet','other') then
    raise exception 'COMMERCE_PAYMENT_METHOD_INVALID'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'COMMERCE_PAYMENT_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  if p_reference is not null and char_length(p_reference) > 500 then
    raise exception 'COMMERCE_PAYMENT_REFERENCE_INVALID'
      using errcode = '22023';
  end if;

  select o.*
  into v_order
  from public.pos_orders o
  where o.tenant_id = p_tenant_id
    and o.id = p_order_id
  for update;

  if not found then
    raise exception 'COMMERCE_ORDER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_order.status <> 'open' then
    raise exception 'COMMERCE_ORDER_NOT_OPEN'
      using errcode = '55000';
  end if;

  select coalesce(sum(p.amount), 0)
  into v_paid
  from public.pos_payments p
  where p.tenant_id = p_tenant_id
    and p.order_id = p_order_id
    and p.status = 'captured';

  v_remaining := v_order.total - v_paid;

  if p_amount <> v_remaining then
    raise exception 'COMMERCE_PAYMENT_AMOUNT_MISMATCH'
      using errcode = '22023';
  end if;

  insert into public.pos_payments (
    tenant_id,
    order_id,
    method,
    amount,
    status,
    reference,
    recorded_by_user_id,
    paid_at
  ) values (
    p_tenant_id,
    p_order_id,
    v_method,
    p_amount,
    'captured',
    nullif(btrim(p_reference), ''),
    v_user_id,
    clock_timestamp()
  )
  returning * into v_payment;

  update public.pos_orders
  set status = 'paid',
      paid_at = v_payment.paid_at,
      updated_at = clock_timestamp()
  where tenant_id = p_tenant_id
    and id = p_order_id;

  return jsonb_build_object(
    'orderId', p_order_id,
    'status', 'paid',
    'paidAt', v_payment.paid_at,
    'payment', jsonb_build_object(
      'id', v_payment.id,
      'method', v_payment.method,
      'amount', v_payment.amount,
      'status', v_payment.status,
      'reference', v_payment.reference
    )
  );
end;
$$;

revoke all on function public.commerce_capture_payment(uuid, uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.commerce_capture_payment(uuid, uuid, text, numeric, text)
  to authenticated, service_role;

create or replace function public.commerce_daily_dashboard(
  p_tenant_id uuid,
  p_store_id uuid,
  p_business_date date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_timezone text;
  v_business_date date;
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not (select private.has_tenant_access(p_tenant_id)) then
    raise exception 'COMMERCE_TENANT_FORBIDDEN'
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

  with
  paid_orders as (
    select o.id, o.total
    from public.pos_orders o
    where o.tenant_id = p_tenant_id
      and o.store_id = p_store_id
      and o.business_date = v_business_date
      and o.status = 'paid'
  ),
  order_summary as (
    select
      count(*)::integer as order_count,
      coalesce(sum(po.total), 0)::numeric(18,2) as sales_total
    from paid_orders po
  ),
  open_summary as (
    select count(*)::integer as open_order_count
    from public.pos_orders o
    where o.tenant_id = p_tenant_id
      and o.store_id = p_store_id
      and o.business_date = v_business_date
      and o.status = 'open'
  ),
  payment_by_method as (
    select
      p.method,
      coalesce(sum(p.amount), 0)::numeric(18,2) as amount
    from public.pos_payments p
    join paid_orders po on po.id = p.order_id
    where p.tenant_id = p_tenant_id
      and p.status = 'captured'
    group by p.method
  ),
  payment_summary as (
    select
      coalesce(sum(pbm.amount), 0)::numeric(18,2) as payment_total,
      coalesce(
        jsonb_object_agg(pbm.method, pbm.amount order by pbm.method),
        '{}'::jsonb
      ) as payment_mix
    from payment_by_method pbm
  ),
  close_state as (
    select dc.id, dc.closed_at
    from public.daily_closes dc
    where dc.tenant_id = p_tenant_id
      and dc.store_id = p_store_id
      and dc.business_date = v_business_date
    limit 1
  )
  select jsonb_build_object(
    'tenantId', p_tenant_id,
    'storeId', p_store_id,
    'businessDate', v_business_date,
    'orderCount', os.order_count,
    'salesTotal', os.sales_total,
    'aov', case
      when os.order_count > 0 then os.sales_total / os.order_count
      else null
    end,
    'paymentTotal', ps.payment_total,
    'paymentMix', ps.payment_mix,
    'openOrderCount', oo.open_order_count,
    'closed', (cs.id is not null),
    'closeId', cs.id,
    'closedAt', cs.closed_at,
    'source', 'cafeos_pos'
  )
  into v_result
  from order_summary os
  cross join open_summary oo
  cross join payment_summary ps
  left join close_state cs on true;

  return v_result;
end;
$$;

revoke all on function public.commerce_daily_dashboard(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.commerce_daily_dashboard(uuid, uuid, date)
  to authenticated, service_role;

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
