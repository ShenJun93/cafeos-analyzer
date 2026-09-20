-- CafeOS Analyzer v0.1 persistence model.
-- Supabase/Postgres: tenant isolation and import idempotency are release blockers.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','admin','analyst','viewer')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create or replace function private.has_tenant_access(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = target_tenant and tm.user_id = auth.uid()
  );
$$;

revoke all on function private.has_tenant_access(uuid) from public;
grant execute on function private.has_tenant_access(uuid) to authenticated;

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_namespace text not null,
  source_filename text,
  fingerprint char(64) not null,
  status text not null check (status in ('pending','validated','committed','failed')),
  row_count integer not null default 0 check (row_count >= 0),
  invalid_row_count integer not null default 0 check (invalid_row_count >= 0),
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  unique (tenant_id, source_namespace, fingerprint)
);

create table if not exists public.transaction_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  first_import_id uuid not null references public.imports(id) on delete restrict,
  source_namespace text not null,
  source_record_key char(64) not null,
  transaction_id text not null,
  occurred_at timestamptz not null,
  store text not null,
  product text not null,
  quantity numeric not null,
  net_amount numeric(18,2) not null,
  customer_key text,
  created_at timestamptz not null default now(),
  unique (tenant_id, source_namespace, source_record_key)
);

create index if not exists transaction_line_items_tenant_time_idx
  on public.transaction_line_items (tenant_id, occurred_at desc);
create index if not exists transaction_line_items_tenant_store_time_idx
  on public.transaction_line_items (tenant_id, store, occurred_at desc);
create index if not exists transaction_line_items_tenant_customer_idx
  on public.transaction_line_items (tenant_id, customer_key)
  where customer_key is not null;

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.imports enable row level security;
alter table public.transaction_line_items enable row level security;

create policy tenants_member_select on public.tenants
  for select to authenticated using (private.has_tenant_access(id));

create policy tenant_members_member_select on public.tenant_members
  for select to authenticated using (private.has_tenant_access(tenant_id));

create policy imports_member_select on public.imports
  for select to authenticated using (private.has_tenant_access(tenant_id));
create policy imports_member_insert on public.imports
  for insert to authenticated with check (private.has_tenant_access(tenant_id));
create policy imports_member_update on public.imports
  for update to authenticated using (private.has_tenant_access(tenant_id))
  with check (private.has_tenant_access(tenant_id));

create policy line_items_member_select on public.transaction_line_items
  for select to authenticated using (private.has_tenant_access(tenant_id));
create policy line_items_member_insert on public.transaction_line_items
  for insert to authenticated with check (private.has_tenant_access(tenant_id));

-- Intentionally no direct delete/update policy for line items in v0.1.
-- Corrections should be modeled as controlled import/admin workflows with audit evidence.
