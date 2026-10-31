-- CafeOS staging recovery SCOPE inventory. SELECT ONLY.
-- Counts/catalog metadata only: never select Auth identities, tenant rows,
-- payment values, passwords, Vault ciphertext, SQL receipt statements or JWTs.
-- All persistent public tables are counted; catalog coverage must be exact.
-- Scope is not a verified backup, encryption test or isolated restore.
-- Requires authorized, separately confirmed cafeos-staging project selection.
with
source_counts as (
 select
   (select count(*)::bigint from auth.users) as auth_users,
   (select count(*)::bigint from auth.identities) as auth_identities,
   (select count(*)::bigint from storage.buckets) as storage_buckets,
   (select count(*)::bigint from storage.objects) as storage_objects,
   (select count(*)::bigint from vault.secrets) as vault_secrets,
   (select count(*)::bigint from supabase_migrations.schema_migrations) as migration_receipts,
   (select count(*)::bigint from public.tenants) as tenants,
   (select count(*)::bigint from public.tenant_members) as tenant_memberships,
   (select count(*)::bigint from public.stores) as stores,
   (select count(*)::bigint from public.imports) as imports,
   (select count(*)::bigint from public.transaction_line_items) as transaction_line_items,
   (select count(*)::bigint from public.customers) as customers,
   (select count(*)::bigint from public.customer_identifiers) as customer_identifiers,
   (select count(*)::bigint from public.attention_items) as attention_items,
   (select count(*)::bigint from public.actions) as actions,
   (select count(*)::bigint from public.action_status_history) as action_status_history,
   (select count(*)::bigint from public.measurement_windows) as measurement_windows,
   (select count(*)::bigint from public.menu_categories) as menu_categories,
   (select count(*)::bigint from public.menu_items) as menu_items,
   (select count(*)::bigint from public.pos_orders) as pos_orders,
   (select count(*)::bigint from public.pos_order_items) as pos_order_items,
   (select count(*)::bigint from public.pos_payments) as pos_payments,
   (select count(*)::bigint from public.daily_closes) as daily_closes
),
public_table_catalog as (
 select coalesce(array_agg(c.relname::text order by c.relname), array[]::text[]) as names
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p')
),
catalog_counts as (
 select
   (select count(*)::bigint
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('auth','storage') and not t.tgisinternal
   ) as managed_schema_noninternal_triggers,
   (select count(*)::bigint from pg_policies
    where schemaname in ('auth','storage')) as managed_schema_policies,
   (select coalesce(
      array_agg(extname || '@' || extversion order by extname),
      array[]::text[])
    from pg_extension) as installed_extensions
)
select
 current_database() as database_name,
 pg_database_size(current_database()) as database_bytes,
 source_counts.*,
 cardinality(public_table_catalog.names) as public_table_count,
 (public_table_catalog.names = array[
   'action_status_history', 'actions', 'attention_items', 'customer_identifiers', 'customers', 'daily_closes', 'imports', 'measurement_windows', 'menu_categories', 'menu_items', 'pos_order_items', 'pos_orders', 'pos_payments', 'stores', 'tenant_members', 'tenants', 'transaction_line_items'
 ]::text[]) as public_scope_complete,
 catalog_counts.*,
 'SCOPE_INVENTORY_ONLY_BACKUP_AND_RESTORE_NOT_PROVEN'::text as audit_phase
from source_counts cross join public_table_catalog cross join catalog_counts;
