-- Menu item lifecycle: owner/admin/manager may edit item configuration.
-- Existing paid/open order lines retain immutable server-snapshotted item_name
-- and unit_price. Never allow clients to update tenant_id/id/audit fields.
grant update (name, sku, category_id, price, active)
  on public.menu_items to authenticated;

create policy menu_items_manager_update
  on public.menu_items for update
  to authenticated
  using (
    (select private.has_tenant_role(
      tenant_id, array['owner','admin','manager']::text[]
    ))
  )
  with check (
    (select private.has_tenant_role(
      tenant_id, array['owner','admin','manager']::text[]
    ))
    and (
      category_id is null
      or exists (
        select 1 from public.menu_categories mc
        where mc.tenant_id = menu_items.tenant_id
          and mc.id = menu_items.category_id
      )
    )
  );

create function public.commerce_menu_item_touch_updated_at()
returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger commerce_menu_item_updated_at
  before update on public.menu_items
  for each row execute function public.commerce_menu_item_touch_updated_at();

-- Defense in depth: no public EXECUTE entry point for this trigger function.
revoke all on function public.commerce_menu_item_touch_updated_at() from public, anon, authenticated;
