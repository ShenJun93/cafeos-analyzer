import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../db/contracts/control_tower_core.sql", import.meta.url),
  "utf8"
);

function has(pattern, message) {
  assert.match(sql, pattern, message);
}

test("Control Tower contract creates only the locked thin-slice tables", () => {
  for (const table of [
    "stores",
    "customers",
    "customer_identifiers",
    "attention_items",
    "actions",
    "action_status_history",
    "measurement_windows"
  ]) {
    has(new RegExp(`create table if not exists public\\.${table}\\s*\\(`, "i"), `missing ${table}`);
  }

  for (const deferred of ["campaigns", "inventory", "payroll", "loyalty_balances", "experiments"]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`create table if not exists public\\.${deferred}\\b`, "i"),
      `deferred table ${deferred} must not enter the thin slice`
    );
  }
});

test("stable Store and Customer identities are tenant-scoped", () => {
  has(/unique\s*\(tenant_id,\s*source_namespace,\s*external_key\)/i);
  has(/unique\s*\(tenant_id,\s*id\)/i);
  has(/customer_identifiers_customer_fk[\s\S]*foreign key\s*\(tenant_id,\s*customer_id\)[\s\S]*references public\.customers\s*\(tenant_id,\s*id\)/i);
  has(/unique\s*\(tenant_id,\s*identifier_type,\s*source_namespace,\s*matching_hmac\)/i);
  has(/matching_hmac char\(64\)[\s\S]*\^\[0-9a-f\]\{64\}\$/i);
});

test("existing line items keep every promoted relationship tenant-scoped", () => {
  has(/alter table public\.transaction_line_items[\s\S]*add column if not exists store_id uuid[\s\S]*add column if not exists customer_id uuid/i);
  has(/transaction_line_items_store_fk[\s\S]*foreign key\s*\(tenant_id,\s*store_id\)[\s\S]*references public\.stores\s*\(tenant_id,\s*id\)/i);
  has(/transaction_line_items_customer_fk[\s\S]*foreign key\s*\(tenant_id,\s*customer_id\)[\s\S]*references public\.customers\s*\(tenant_id,\s*id\)/i);
  has(/imports_tenant_id_id_key[\s\S]*unique\s*\(tenant_id,\s*id\)/i);
  has(/transaction_line_items_first_import_fk[\s\S]*foreign key\s*\(tenant_id,\s*first_import_id\)[\s\S]*references public\.imports\s*\(tenant_id,\s*id\)/i);
  has(/drop constraint(?: if exists)? transaction_line_items_first_import_id_fkey/i);
});

test("attention items are deterministic, evidence-backed, and tenant-idempotent", () => {
  has(/attention_key char\(64\)/i);
  has(/constraint attention_items_tenant_key unique\s*\(tenant_id,\s*attention_key\)/i);
  has(/coverage jsonb not null/i);
  has(/evidence jsonb not null/i);
  has(/detector_version text not null/i);
  has(/confidence numeric\(6,5\)[\s\S]*confidence >= 0[\s\S]*confidence <= 1/i);
});

test("action workflow stays bounded and tenant-scoped", () => {
  has(/action_type text not null[\s\S]*'investigate'[\s\S]*'follow_up'[\s\S]*'segment'[\s\S]*'experiment_hypothesis'/i);
  has(/status text not null default 'open'[\s\S]*'open'[\s\S]*'in_progress'[\s\S]*'resolved'[\s\S]*'dismissed'/i);
  has(/actions_attention_fk[\s\S]*foreign key\s*\(tenant_id,\s*attention_item_id\)[\s\S]*references public\.attention_items\s*\(tenant_id,\s*id\)/i);
  has(/actions_owner_fk[\s\S]*foreign key\s*\(tenant_id,\s*owner_user_id\)[\s\S]*references public\.tenant_members\s*\(tenant_id,\s*user_id\)/i);
  has(/actions_resolution_note_check/i);
  has(/actions_resolved_at_check/i);
});

test("measurement windows encode before/after measurement without client-controlled delta", () => {
  has(/measurement_windows_action_fk[\s\S]*foreign key\s*\(tenant_id,\s*action_id\)[\s\S]*references public\.actions\s*\(tenant_id,\s*id\)/i);
  has(/generated always as\s*\([\s\S]*measured_value - baseline_value[\s\S]*\) stored/i);
  has(/measurement_start >= baseline_end/i);
  has(/status text not null default 'pending'[\s\S]*'pending'[\s\S]*'measured'[\s\S]*'insufficient_data'/i);
});

test("all new public tables have RLS enabled", () => {
  for (const table of [
    "stores",
    "customers",
    "customer_identifiers",
    "attention_items",
    "actions",
    "action_status_history",
    "measurement_windows"
  ]) {
    has(new RegExp(`alter table public\\.${table} enable row level security;`, "i"), `RLS missing on ${table}`);
  }
});

test("Data API exposure is explicit and anonymous product access is revoked", () => {
  for (const table of [
    "stores",
    "customers",
    "customer_identifiers",
    "attention_items",
    "actions",
    "action_status_history",
    "measurement_windows"
  ]) {
    has(new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`, "i"));
  }

  assert.doesNotMatch(sql, /grant\s+[^;]+\s+on table public\.[^;]+\s+to anon\b/i);
  has(/grant select on table public\.stores to authenticated;/i);
  has(/grant select on table public\.customers to authenticated;/i);
  has(/grant select on table public\.attention_items to authenticated;/i);
  has(/grant select, insert, update on table public\.actions to authenticated;/i);
  has(/grant select on table public\.action_status_history to authenticated;/i);
  has(/grant select, insert on table public\.measurement_windows to authenticated;/i);
});

test("customer matching identifiers and trusted metric writes stay server-owned", () => {
  assert.doesNotMatch(sql, /grant\s+[^;]+on table public\.customer_identifiers to authenticated;/i);
  assert.doesNotMatch(sql, /grant\s+[^;]*(insert|update)[^;]*on table public\.attention_items to authenticated;/i);
  assert.doesNotMatch(sql, /grant\s+[^;]*update[^;]*on table public\.measurement_windows to authenticated;/i);
  has(/measurement_windows_operator_insert[\s\S]*status = 'pending'[\s\S]*baseline_value is null[\s\S]*measured_value is null/i);
});

test("viewer is read-only while bounded action writes require operator roles", () => {
  has(/has_tenant_role\(tenant_id, array\['owner','admin','analyst'\]::text\[\]\)/i);
  assert.doesNotMatch(sql, /array\[[^\]]*'viewer'[^\]]*\]::text\[\][\s\S]{0,250}(insert|update)/i);
  has(/create policy actions_member_select[\s\S]*has_tenant_access\(tenant_id\)/i);
});

test("private helpers are not public APIs and the private schema has explicit usage", () => {
  has(/grant usage on schema private to authenticated, service_role;/i);
  has(/revoke all on function private\.has_tenant_role\(uuid, text\[\]\) from public, anon;/i);
  has(/revoke all on function private\.record_action_status_history\(\) from public, anon, authenticated;/i);
});

test("action status audit history is database-enforced", () => {
  has(/create or replace function private\.record_action_status_history\(\)/i);
  has(/insert into public\.action_status_history/i);
  has(/create trigger actions_record_status_history[\s\S]*after insert or update of status on public\.actions/i);
  has(/actor_user_id[\s\S]*\(select auth\.uid\(\)\)/i);
});

test("legacy Analyzer tables get explicit grants compatible with new Supabase defaults", () => {
  has(/revoke all on table public\.tenants from anon, authenticated;/i);
  has(/revoke all on table public\.tenant_members from anon, authenticated;/i);
  has(/revoke all on table public\.imports from anon, authenticated;/i);
  has(/revoke all on table public\.transaction_line_items from anon, authenticated;/i);
  has(/grant select on table public\.tenants to authenticated;/i);
  has(/grant select on table public\.tenant_members to authenticated;/i);
  has(/grant select, insert, update on table public\.imports to authenticated;/i);
  has(/grant select, insert on table public\.transaction_line_items to authenticated;/i);
});

test("server-only customer identifiers have an explicit deny policy", () => {
  has(/create policy customer_identifiers_authenticated_deny[\s\S]*to authenticated[\s\S]*using \(false\)/i);
});

test("foreign-key hot paths have covering indexes found by staging advisors", () => {
  has(/create index if not exists actions_tenant_attention_idx[\s\S]*on public\.actions \(tenant_id, attention_item_id\)/i);
  has(/create index if not exists transaction_line_items_tenant_first_import_idx[\s\S]*on public\.transaction_line_items \(tenant_id, first_import_id\)/i);
});

test("Daily Brief correctness contract records and validates IANA timezone assumptions", async () => {
  const daily = await readFile(
    new URL("../db/contracts/daily_brief_correctness.sql", import.meta.url),
    "utf8"
  );
  assert.match(daily, /add column if not exists source_timezone text/i);
  assert.match(daily, /private\.is_valid_timezone\(source_timezone\)/i);
  assert.match(daily, /stores_timezone_valid_check/i);
  assert.match(daily, /private\.is_valid_timezone\(timezone\)/i);
  assert.match(daily, /pg_timezone_names\(\)/i);
  assert.match(daily, /NULL is allowed only for legacy imports or sources whose timestamps are already absolute instants/i);
});
