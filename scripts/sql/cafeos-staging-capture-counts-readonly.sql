-- CafeOS staged source cardinality drift detector, SELECT ONLY.
-- Metadata aggregates only; no data values, usernames, credentials, receipts,
-- Vault ciphertext, SQL statement bodies, email addresses or JWTs.
-- This is NOT a snapshot and cannot detect same-count edits.
select jsonb_build_object(
  'auth_users', (select count(*) from auth.users),
  'auth_identities', (select count(*) from auth.identities),
  'storage_buckets', (select count(*) from storage.buckets),
  'storage_objects', (select count(*) from storage.objects),
  'vault_secrets', (select count(*) from vault.secrets),
  'migration_receipts', (select count(*) from supabase_migrations.schema_migrations),
  'tenants', (select count(*) from public.tenants),
  'tenant_members', (select count(*) from public.tenant_members),
  'stores', (select count(*) from public.stores),
  'imports', (select count(*) from public.imports),
  'transaction_line_items', (select count(*) from public.transaction_line_items),
  'customers', (select count(*) from public.customers),
  'customer_identifiers', (select count(*) from public.customer_identifiers),
  'attention_items', (select count(*) from public.attention_items),
  'actions', (select count(*) from public.actions),
  'action_status_history', (select count(*) from public.action_status_history),
  'measurement_windows', (select count(*) from public.measurement_windows),
  'menu_categories', (select count(*) from public.menu_categories),
  'menu_items', (select count(*) from public.menu_items),
  'pos_orders', (select count(*) from public.pos_orders),
  'pos_order_items', (select count(*) from public.pos_order_items),
  'pos_payments', (select count(*) from public.pos_payments),
  'daily_closes', (select count(*) from public.daily_closes)
)::text;
