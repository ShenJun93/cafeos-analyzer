-- CafeOS POS: manager-only void of unpaid orders, with immutable audit evidence.
-- Incremental canonical migration for disposable/local test databases.
-- NEVER run against cafeos-staging before owner-approved ledger/backup gates.
-- Historical actor UUIDs are immutable evidence, not references to active access.
-- Core Commerce RPCs verify authenticated Tenant membership at write time.
-- A live tenant_members FK would block offboarding after the first order/payment/
-- close, leaving former staff with an undeletable membership.
-- This migration is a local/Draft candidate; staging history/backup gates remain.
alter table public.pos_orders drop constraint if exists pos_orders_opened_by_fk;
alter table public.pos_payments drop constraint if exists pos_payments_recorded_by_fk;
alter table public.daily_closes drop constraint if exists daily_closes_closed_by_fk;

create table public.pos_order_voids (
  tenant_id uuid not null,
  order_id uuid not null,
  store_id uuid not null,
  business_date date not null,
  reason text not null check (char_length(reason) between 5 and 240 and reason = btrim(reason)),
  voided_by_user_id uuid not null,
  voided_at timestamptz not null,
  primary key (tenant_id, order_id),
  constraint pos_order_voids_order_fk foreign key (tenant_id, order_id)
    references public.pos_orders(tenant_id, id) on delete restrict,
  constraint pos_order_voids_store_fk foreign key (tenant_id, store_id)
    references public.stores(tenant_id, id) on delete restrict
);
create index pos_order_voids_tenant_store_day_idx
  on public.pos_order_voids (tenant_id, store_id, business_date);

alter table public.pos_order_voids enable row level security;
revoke all on table public.pos_order_voids from public, anon, authenticated;
grant select on table public.pos_order_voids to authenticated;
grant select, insert, update, delete on table public.pos_order_voids to service_role;
-- Audit reasons and actor identifiers are privileged manager evidence.
-- Cashier/viewer may read general POS order status but not audit details.
create policy pos_order_voids_manager_select on public.pos_order_voids
  for select to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['owner','admin','manager']::text[]
  )));

create or replace function public.commerce_void_order(
  p_tenant_id uuid,
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_probe record;
  v_order record;
  v_receipt record;
begin
  if v_user_id is null
    or not (select private.has_tenant_role(
      p_tenant_id, array['owner','admin','manager']::text[]
    )) then
    raise exception 'COMMERCE_VOID_ROLE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_reason is null or char_length(v_reason) < 5
    or char_length(v_reason) > 240 then
    raise exception 'COMMERCE_VOID_REASON_INVALID' using errcode = '22023';
  end if;

  -- Read only the stable order date to acquire the SAME advisory lock used by
  -- commerce_close_day before taking the order row lock. Store/date are
  -- immutable under this RPC. A close cannot race between this lock and void.
  select o.tenant_id, o.store_id, o.business_date
  into v_probe
  from public.pos_orders o
  where o.tenant_id = p_tenant_id and o.id = p_order_id;
  if not found then
    raise exception 'COMMERCE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':' || v_probe.store_id::text || ':' || v_probe.business_date::text, 0
  ));
  select o.* into v_order
  from public.pos_orders o
  where o.tenant_id = p_tenant_id and o.id = p_order_id
  for update;
  if not found then
    raise exception 'COMMERCE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_order.status = 'voided' then
    select v.* into v_receipt from public.pos_order_voids v
    where v.tenant_id = p_tenant_id and v.order_id = p_order_id;
    if not found then
      raise exception 'COMMERCE_VOID_CONFLICT' using errcode = '55000';
    end if;
    if v_receipt.reason <> v_reason
      or v_receipt.voided_by_user_id <> v_user_id then
      raise exception 'COMMERCE_VOID_CONFLICT' using errcode = '55000';
    end if;
    return jsonb_build_object(
      'orderId', v_order.id, 'storeId', v_order.store_id,
      'businessDate', v_order.business_date, 'status', 'voided',
      'voidedByUserId', v_receipt.voided_by_user_id,
      'voidedAt', v_receipt.voided_at, 'reason', v_receipt.reason,
      'idempotent', true
    );
  end if;
  if v_order.status <> 'open' then
    raise exception 'COMMERCE_ORDER_NOT_OPEN' using errcode = '55000';
  end if;
  if exists (select 1 from public.daily_closes dc
    where dc.tenant_id = p_tenant_id
      and dc.store_id = v_order.store_id
      and dc.business_date = v_order.business_date) then
    raise exception 'COMMERCE_DAY_CLOSED' using errcode = '55000';
  end if;
  if exists (select 1 from public.pos_payments p
    where p.tenant_id = p_tenant_id and p.order_id = p_order_id) then
    raise exception 'COMMERCE_ORDER_HAS_PAYMENT' using errcode = '55000';
  end if;

  update public.pos_orders
  set status = 'voided', voided_at = clock_timestamp(), updated_at = clock_timestamp()
  where tenant_id = p_tenant_id and id = p_order_id
  returning * into v_order;

  insert into public.pos_order_voids (
    tenant_id, order_id, store_id, business_date, reason, voided_by_user_id, voided_at
  ) values (
    p_tenant_id, p_order_id, v_order.store_id, v_order.business_date,
    v_reason, v_user_id, v_order.voided_at
  ) returning * into v_receipt;

  return jsonb_build_object(
    'orderId', v_order.id, 'storeId', v_order.store_id,
    'businessDate', v_order.business_date, 'status', 'voided',
    'voidedByUserId', v_receipt.voided_by_user_id,
    'voidedAt', v_receipt.voided_at, 'reason', v_receipt.reason,
    'idempotent', false
  );
end;
$$;
revoke all on function public.commerce_void_order(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.commerce_void_order(uuid, uuid, text)
  to authenticated, service_role;
