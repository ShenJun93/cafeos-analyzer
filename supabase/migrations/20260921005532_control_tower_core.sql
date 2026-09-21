-- CafeOS Control Tower schema contract.
-- This file is intentionally NOT a Supabase migration yet.
-- Promote it with `supabase migration new control_tower_core` after local/staging DB validation.
--
-- Security model:
-- - RLS on every new public table.
-- - Explicit grants/revokes because new Supabase projects may not auto-expose public tables.
-- - authenticated users read tenant data; only bounded workflow writes are allowed.
-- - trusted numeric insight/measurement values are server-owned.
-- - composite tenant foreign keys prevent cross-tenant references.

-- Existing private schema helpers are referenced by RLS policies.
revoke all on schema private from anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.has_tenant_role(
  target_tenant uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = target_tenant
        and tm.user_id = (select auth.uid())
        and tm.role = any(allowed_roles)
    );
$$;

revoke all on function private.has_tenant_role(uuid, text[]) from public, anon;
grant execute on function private.has_tenant_role(uuid, text[]) to authenticated, service_role;

-- Make the v0.1 Data API contract explicit for projects where auto-grants are disabled.
revoke all on table public.tenants from anon, authenticated;
revoke all on table public.tenant_members from anon, authenticated;
revoke all on table public.imports from anon, authenticated;
revoke all on table public.transaction_line_items from anon, authenticated;

grant select on table public.tenants to authenticated;
grant select on table public.tenant_members to authenticated;
grant select, insert, update on table public.imports to authenticated;
grant select, insert on table public.transaction_line_items to authenticated;

grant select, insert, update, delete on table public.tenants to service_role;
grant select, insert, update, delete on table public.tenant_members to service_role;
grant select, insert, update, delete on table public.imports to service_role;
grant select, insert, update, delete on table public.transaction_line_items to service_role;

-- Preserve import lineage inside the same tenant. The Analyzer v0.1 FK referenced
-- imports(id) only, which allowed a Tenant A line item to point at a Tenant B import.
-- This migration is ordered after the Analyzer baseline and targets that known state.
alter table public.imports
  add constraint imports_tenant_id_id_key unique (tenant_id, id);

alter table public.transaction_line_items
  drop constraint if exists transaction_line_items_first_import_id_fkey;

alter table public.transaction_line_items
  add constraint transaction_line_items_first_import_fk
  foreign key (tenant_id, first_import_id)
  references public.imports(tenant_id, id)
  on delete restrict;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_namespace text not null,
  external_key text not null,
  name text not null,
  timezone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_source_identity_key unique (tenant_id, source_namespace, external_key),
  constraint stores_tenant_id_id_key unique (tenant_id, id)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_tenant_id_id_key unique (tenant_id, id)
);

create table if not exists public.customer_identifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  identifier_type text not null
    check (identifier_type in ('source_customer_id','phone','email')),
  matching_hmac char(64) not null
    check (matching_hmac ~ '^[0-9a-f]{64}$'),
  source_namespace text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint customer_identifiers_customer_fk
    foreign key (tenant_id, customer_id)
    references public.customers(tenant_id, id)
    on delete cascade,
  constraint customer_identifiers_match_key
    unique (tenant_id, identifier_type, source_namespace, matching_hmac)
);

alter table public.transaction_line_items
  add column if not exists store_id uuid,
  add column if not exists customer_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaction_line_items_store_fk'
      and conrelid = 'public.transaction_line_items'::regclass
  ) then
    alter table public.transaction_line_items
      add constraint transaction_line_items_store_fk
      foreign key (tenant_id, store_id)
      references public.stores(tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaction_line_items_customer_fk'
      and conrelid = 'public.transaction_line_items'::regclass
  ) then
    alter table public.transaction_line_items
      add constraint transaction_line_items_customer_fk
      foreign key (tenant_id, customer_id)
      references public.customers(tenant_id, id)
      on delete restrict;
  end if;
end
$$;

create index if not exists transaction_line_items_tenant_store_id_time_idx
  on public.transaction_line_items (tenant_id, store_id, occurred_at desc)
  where store_id is not null;

create index if not exists transaction_line_items_tenant_customer_id_time_idx
  on public.transaction_line_items (tenant_id, customer_id, occurred_at desc)
  where customer_id is not null;

create table if not exists public.attention_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attention_key char(64) not null
    check (attention_key ~ '^[0-9a-f]{64}$'),
  type text not null,
  severity text not null check (severity in ('info','low','medium','high')),
  metric text not null,
  scope_type text not null
    check (scope_type in ('tenant','store','customer','product','daypart','store_daypart','other')),
  scope_key text not null,
  current_value numeric(18,4),
  baseline_value numeric(18,4),
  delta_value numeric(18,4),
  coverage jsonb not null default '{}'::jsonb,
  confidence numeric(6,5)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  detector_version text not null,
  status text not null default 'open'
    check (status in ('open','acted','dismissed','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attention_items_tenant_key unique (tenant_id, attention_key),
  constraint attention_items_tenant_id_id_key unique (tenant_id, id)
);

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attention_item_id uuid,
  owner_user_id uuid,
  action_type text not null
    check (action_type in ('investigate','follow_up','segment','experiment_hypothesis')),
  title text not null check (char_length(title) between 1 and 500),
  expected_metric text,
  expected_direction text
    check (expected_direction is null or expected_direction in ('increase','decrease','stabilize','investigate')),
  status text not null default 'open'
    check (status in ('open','in_progress','resolved','dismissed')),
  resolution_note text,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint actions_attention_fk
    foreign key (tenant_id, attention_item_id)
    references public.attention_items(tenant_id, id)
    on delete restrict,
  constraint actions_owner_fk
    foreign key (tenant_id, owner_user_id)
    references public.tenant_members(tenant_id, user_id)
    on delete restrict,
  constraint actions_resolution_note_check
    check (
      status in ('open','in_progress')
      or nullif(btrim(resolution_note), '') is not null
    ),
  constraint actions_resolved_at_check
    check (
      (status in ('resolved','dismissed') and resolved_at is not null)
      or (status in ('open','in_progress') and resolved_at is null)
    ),
  constraint actions_tenant_id_id_key unique (tenant_id, id)
);

create table if not exists public.action_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  action_id uuid not null,
  from_status text
    check (from_status is null or from_status in ('open','in_progress','resolved','dismissed')),
  to_status text not null
    check (to_status in ('open','in_progress','resolved','dismissed')),
  actor_user_id uuid,
  note text,
  created_at timestamptz not null default now(),
  constraint action_status_history_action_fk
    foreign key (tenant_id, action_id)
    references public.actions(tenant_id, id)
    on delete cascade
);

create table if not exists public.measurement_windows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  action_id uuid not null,
  metric text not null,
  scope_type text not null
    check (scope_type in ('tenant','store','customer','product','daypart','store_daypart','other')),
  scope_key text not null,
  baseline_start timestamptz not null,
  baseline_end timestamptz not null,
  measurement_start timestamptz not null,
  measurement_end timestamptz not null,
  baseline_value numeric(18,4),
  measured_value numeric(18,4),
  delta_value numeric(18,4)
    generated always as (
      case
        when baseline_value is null or measured_value is null then null
        else measured_value - baseline_value
      end
    ) stored,
  status text not null default 'pending'
    check (status in ('pending','measured','insufficient_data')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_windows_action_fk
    foreign key (tenant_id, action_id)
    references public.actions(tenant_id, id)
    on delete cascade,
  constraint measurement_windows_baseline_range_check
    check (baseline_start < baseline_end),
  constraint measurement_windows_measurement_range_check
    check (measurement_start < measurement_end),
  constraint measurement_windows_sequence_check
    check (measurement_start >= baseline_end),
  constraint measurement_windows_measured_values_check
    check (
      status <> 'measured'
      or (baseline_value is not null and measured_value is not null)
    )
);

create index if not exists stores_tenant_active_idx
  on public.stores (tenant_id, active);

create index if not exists customer_identifiers_tenant_customer_idx
  on public.customer_identifiers (tenant_id, customer_id);

create index if not exists attention_items_tenant_status_created_idx
  on public.attention_items (tenant_id, status, created_at desc);

create index if not exists actions_tenant_status_created_idx
  on public.actions (tenant_id, status, created_at desc);

create index if not exists actions_tenant_owner_status_idx
  on public.actions (tenant_id, owner_user_id, status)
  where owner_user_id is not null;

create index if not exists actions_tenant_attention_idx
  on public.actions (tenant_id, attention_item_id)
  where attention_item_id is not null;

drop index if exists public.transaction_line_items_first_import_id_idx;
create index if not exists transaction_line_items_tenant_first_import_idx
  on public.transaction_line_items (tenant_id, first_import_id);

create index if not exists action_status_history_tenant_action_created_idx
  on public.action_status_history (tenant_id, action_id, created_at);

create index if not exists measurement_windows_tenant_action_idx
  on public.measurement_windows (tenant_id, action_id);

alter table public.stores enable row level security;
alter table public.customers enable row level security;
alter table public.customer_identifiers enable row level security;
alter table public.attention_items enable row level security;
alter table public.actions enable row level security;
alter table public.action_status_history enable row level security;
alter table public.measurement_windows enable row level security;

-- Explicit grants: no anonymous product-table access.
revoke all on table public.stores from anon, authenticated;
revoke all on table public.customers from anon, authenticated;
revoke all on table public.customer_identifiers from anon, authenticated;
revoke all on table public.attention_items from anon, authenticated;
revoke all on table public.actions from anon, authenticated;
revoke all on table public.action_status_history from anon, authenticated;
revoke all on table public.measurement_windows from anon, authenticated;

grant select on table public.stores to authenticated;
grant select on table public.customers to authenticated;
grant select on table public.attention_items to authenticated;
grant select, insert, update on table public.actions to authenticated;
grant select on table public.action_status_history to authenticated;
grant select, insert on table public.measurement_windows to authenticated;

grant select, insert, update, delete on table public.stores to service_role;
grant select, insert, update, delete on table public.customers to service_role;
grant select, insert, update, delete on table public.customer_identifiers to service_role;
grant select, insert, update, delete on table public.attention_items to service_role;
grant select, insert, update, delete on table public.actions to service_role;
grant select, insert, update, delete on table public.action_status_history to service_role;
grant select, insert, update, delete on table public.measurement_windows to service_role;

create policy stores_member_select
  on public.stores for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy customers_member_select
  on public.customers for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

-- Matching HMACs remain server-only in the first Control Tower slice.
-- Explicit deny policy is defense-in-depth and keeps Security Advisor unambiguous.
create policy customer_identifiers_authenticated_deny
  on public.customer_identifiers for select
  to authenticated
  using (false);

create policy attention_items_member_select
  on public.attention_items for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy actions_member_select
  on public.actions for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy actions_operator_insert
  on public.actions for insert
  to authenticated
  with check (
    (select private.has_tenant_role(tenant_id, array['owner','admin','analyst']::text[]))
    and (
      owner_user_id is null
      or exists (
        select 1
        from public.tenant_members tm
        where tm.tenant_id = actions.tenant_id
          and tm.user_id = actions.owner_user_id
      )
    )
  );

create policy actions_operator_update
  on public.actions for update
  to authenticated
  using ((select private.has_tenant_role(tenant_id, array['owner','admin','analyst']::text[])))
  with check ((select private.has_tenant_role(tenant_id, array['owner','admin','analyst']::text[])));

create policy action_status_history_member_select
  on public.action_status_history for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy measurement_windows_member_select
  on public.measurement_windows for select
  to authenticated
  using ((select private.has_tenant_access(tenant_id)));

create policy measurement_windows_operator_insert
  on public.measurement_windows for insert
  to authenticated
  with check (
    (select private.has_tenant_role(tenant_id, array['owner','admin','analyst']::text[]))
    and status = 'pending'
    and baseline_value is null
    and measured_value is null
  );

create or replace function private.record_action_status_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.action_status_history (
      tenant_id,
      action_id,
      from_status,
      to_status,
      actor_user_id,
      note
    ) values (
      new.tenant_id,
      new.id,
      null,
      new.status,
      (select auth.uid()),
      null
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.action_status_history (
      tenant_id,
      action_id,
      from_status,
      to_status,
      actor_user_id,
      note
    ) values (
      new.tenant_id,
      new.id,
      old.status,
      new.status,
      (select auth.uid()),
      case
        when new.status in ('resolved','dismissed') then new.resolution_note
        else null
      end
    );
  end if;

  return new;
end;
$$;

revoke all on function private.record_action_status_history() from public, anon, authenticated;
grant execute on function private.record_action_status_history() to service_role;

drop trigger if exists actions_record_status_history on public.actions;
create trigger actions_record_status_history
after insert or update of status on public.actions
for each row execute function private.record_action_status_history();

-- No authenticated UPDATE policy/grant exists for attention_items or measurement_windows.
-- Trusted metrics and measured values must be produced by server-side deterministic code.