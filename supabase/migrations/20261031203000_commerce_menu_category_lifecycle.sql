-- Menu category lifecycle. Archiving a category is an organization-only
-- operation: existing active item sales remain available under "All items".
-- Do NOT silently change Menu item active states or historic POS snapshots.
grant update (name, sort_order, active)
  on public.menu_categories to authenticated;

create policy menu_categories_manager_update
  on public.menu_categories for update
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
  );

create function public.commerce_menu_category_touch_updated_at()
returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger commerce_menu_category_updated_at
  before update on public.menu_categories
  for each row execute function public.commerce_menu_category_touch_updated_at();

revoke all on function public.commerce_menu_category_touch_updated_at()
  from public, anon, authenticated;
