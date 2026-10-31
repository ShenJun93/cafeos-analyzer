-- Non-billable topping catalog FOUNDATION. This migration does NOT change
-- commerce_create_order, prices, receipts or order-item financial snapshots.
-- Topping options cannot be charged until the separate server-owned POS price
-- snapshot workflow is implemented and independently verified.
create table public.menu_toppings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  menu_item_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  price numeric(18,2) not null check (price >= 0 and price <= 1000000),
  sort_order integer not null default 0 check (sort_order between -100000 and 100000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_toppings_item_fk
    foreign key (tenant_id, menu_item_id)
    references public.menu_items(tenant_id, id) on delete restrict,
  constraint menu_toppings_tenant_id_id_unique unique (tenant_id, id)
);

create unique index menu_toppings_name_per_item_unique
  on public.menu_toppings (tenant_id, menu_item_id, lower(btrim(name)));
create index menu_toppings_tenant_item_idx
  on public.menu_toppings (tenant_id, menu_item_id, sort_order, name);

alter table public.menu_toppings enable row level security;
revoke all on table public.menu_toppings from public, anon, authenticated;
grant select, insert on table public.menu_toppings to authenticated;
grant update (name, price, sort_order, active)
  on table public.menu_toppings to authenticated;
grant select, insert, update, delete on table public.menu_toppings to service_role;

create policy menu_toppings_member_select on public.menu_toppings
  for select to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy menu_toppings_manager_insert on public.menu_toppings
  for insert to authenticated
  with check ((select private.has_tenant_role(
    tenant_id, array['owner','admin','manager']::text[]
  )));

create policy menu_toppings_manager_update on public.menu_toppings
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['owner','admin','manager']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['owner','admin','manager']::text[]
  )));

create function public.commerce_menu_topping_touch_updated_at()
returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger commerce_menu_topping_updated_at
  before update on public.menu_toppings
  for each row execute function public.commerce_menu_topping_touch_updated_at();
revoke all on function public.commerce_menu_topping_touch_updated_at()
  from public, anon, authenticated;
