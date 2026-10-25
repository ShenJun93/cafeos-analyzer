-- Incremental Core Commerce price-snapshot consistency fix.
-- Candidate for blank-DB Supabase CI ONLY until staging ledger is reconciled.
-- Never mutate the previously applied Core Commerce migration.
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
  v_snapshot_items jsonb := '[]'::jsonb;
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

      -- A single SQL statement snapshot must own each trusted line price.
      -- A later Menu edit must never change the price recorded for this order.
      v_snapshot_items := v_snapshot_items || jsonb_build_array(jsonb_build_object(
        'menuItemId', v_menu.id,
        'name', v_menu.name,
        'unitPrice', v_menu.price,
        'quantity', v_quantity
      ));
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

    -- Materialize the exact validated Menu snapshot. Never requery prices.
    for v_item in
      select value from jsonb_array_elements(v_snapshot_items)
    loop
      v_menu_item_id := (v_item->>'menuItemId')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;

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
        v_menu_item_id,
        v_item->>'name',
        (v_item->>'unitPrice')::numeric,
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
