-- CafeOS bounded Attention -> Action -> Measurement loop (issue #56).
-- Workflow writes stay RLS-scoped; trusted measurement values remain server-computed.

create or replace function private.mark_attention_acted_from_action()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.attention_item_id is not null then
    update public.attention_items
    set status = 'acted',
        updated_at = now()
    where tenant_id = new.tenant_id
      and id = new.attention_item_id
      and status = 'open';
  end if;

  return new;
end;
$$;

revoke all on function private.mark_attention_acted_from_action()
  from public, anon, authenticated;
grant execute on function private.mark_attention_acted_from_action()
  to service_role;

drop trigger if exists actions_mark_attention_acted on public.actions;
create trigger actions_mark_attention_acted
after insert on public.actions
for each row execute function private.mark_attention_acted_from_action();

create or replace function public.measurement_window_result(
  p_tenant_id uuid,
  p_measurement_window_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_window record;
  v_store record;
  v_baseline_rows bigint;
  v_measured_rows bigint;
  v_baseline_sales numeric;
  v_measured_sales numeric;
  v_baseline_orders bigint;
  v_measured_orders bigint;
  v_baseline_value numeric;
  v_measured_value numeric;
  v_status text;
begin
  if (select auth.uid()) is null
     or not (select private.has_tenant_access(p_tenant_id)) then
    raise exception 'tenant access denied'
      using errcode = '42501';
  end if;

  select
    mw.id,
    mw.action_id,
    mw.metric,
    mw.scope_type,
    mw.scope_key,
    mw.baseline_start,
    mw.baseline_end,
    mw.measurement_start,
    mw.measurement_end
  into v_window
  from public.measurement_windows mw
  where mw.tenant_id = p_tenant_id
    and mw.id = p_measurement_window_id;

  if not found then
    raise exception 'measurement access denied'
      using errcode = '42501';
  end if;

  if v_window.scope_type <> 'store'
     or v_window.metric not in ('net_sales', 'orders', 'aov')
     or v_window.scope_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'unsupported measurement definition'
      using errcode = '22023';
  end if;

  select s.id, s.name, s.timezone
  into v_store
  from public.stores s
  where s.tenant_id = p_tenant_id
    and s.id = v_window.scope_key::uuid;

  if not found then
    raise exception 'store access denied'
      using errcode = '42501';
  end if;

  select
    count(*)::bigint,
    sum(tli.net_amount)::numeric,
    count(distinct (tli.source_namespace, tli.transaction_id))::bigint
  into v_baseline_rows, v_baseline_sales, v_baseline_orders
  from public.transaction_line_items tli
  where tli.tenant_id = p_tenant_id
    and tli.store_id = v_store.id
    and tli.occurred_at >= v_window.baseline_start
    and tli.occurred_at < v_window.baseline_end;

  select
    count(*)::bigint,
    sum(tli.net_amount)::numeric,
    count(distinct (tli.source_namespace, tli.transaction_id))::bigint
  into v_measured_rows, v_measured_sales, v_measured_orders
  from public.transaction_line_items tli
  where tli.tenant_id = p_tenant_id
    and tli.store_id = v_store.id
    and tli.occurred_at >= v_window.measurement_start
    and tli.occurred_at < v_window.measurement_end;

  if v_baseline_rows = 0 or v_measured_rows = 0 then
    v_status := 'insufficient_data';
    v_baseline_value := null;
    v_measured_value := null;
  else
    v_status := 'measured';
    v_baseline_value := case v_window.metric
      when 'net_sales' then v_baseline_sales
      when 'orders' then v_baseline_orders::numeric
      when 'aov' then
        case when v_baseline_orders > 0
          then v_baseline_sales / v_baseline_orders
          else null
        end
    end;
    v_measured_value := case v_window.metric
      when 'net_sales' then v_measured_sales
      when 'orders' then v_measured_orders::numeric
      when 'aov' then
        case when v_measured_orders > 0
          then v_measured_sales / v_measured_orders
          else null
        end
    end;

    if v_baseline_value is null or v_measured_value is null then
      v_status := 'insufficient_data';
      v_baseline_value := null;
      v_measured_value := null;
    end if;
  end if;

  return jsonb_build_object(
    'tenantId', p_tenant_id,
    'measurementWindowId', v_window.id,
    'actionId', v_window.action_id,
    'metric', v_window.metric,
    'scope', jsonb_build_object(
      'type', v_window.scope_type,
      'key', v_window.scope_key,
      'store', jsonb_build_object(
        'id', v_store.id,
        'name', v_store.name,
        'timezone', v_store.timezone
      )
    ),
    'baseline', jsonb_build_object(
      'start', v_window.baseline_start,
      'end', v_window.baseline_end,
      'observedRows', v_baseline_rows,
      'value', v_baseline_value
    ),
    'measurement', jsonb_build_object(
      'start', v_window.measurement_start,
      'end', v_window.measurement_end,
      'observedRows', v_measured_rows,
      'value', v_measured_value
    ),
    'result', jsonb_build_object(
      'status', v_status,
      'deltaValue',
        case when v_status = 'measured'
          then v_measured_value - v_baseline_value
          else null
        end,
      'deltaPct',
        case
          when v_status = 'measured' and v_baseline_value <> 0
            then v_measured_value / v_baseline_value - 1
          else null
        end,
      'interpretation', 'before_after_not_causal'
    )
  );
end;
$$;

revoke all on function public.measurement_window_result(uuid, uuid)
  from public, anon;
grant execute on function public.measurement_window_result(uuid, uuid)
  to authenticated;

comment on function public.measurement_window_result(uuid, uuid) is
  'Caller-RLS deterministic before/after measurement result for bounded Store-scoped Action windows. Does not claim causal attribution.';
