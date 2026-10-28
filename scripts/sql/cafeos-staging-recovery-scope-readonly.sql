-- CafeOS staging recovery SCOPE inventory. SELECT ONLY.
-- Counts/catalog metadata only: never select Auth identities, tenant rows,
-- payment values, passwords, Vault ciphertext, SQL receipt statements or JWTs.
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
   (select count(*)::bigint from public.menu_items) as menu_items,
   (select count(*)::bigint from public.pos_orders) as pos_orders,
   (select count(*)::bigint from public.pos_payments) as pos_payments,
   (select count(*)::bigint from public.daily_closes) as daily_closes
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
 catalog_counts.*,
 'SCOPE_INVENTORY_ONLY_BACKUP_AND_RESTORE_NOT_PROVEN'::text as audit_phase
from source_counts cross join catalog_counts;
