import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../db/contracts/core_commerce_v1.sql", import.meta.url),
  "utf8"
);

function has(pattern, message) {
  assert.match(sql, pattern, message);
}

test("Core Commerce extends tenant roles without weakening existing roles", () => {
  has(/alter table public\.tenant_members[\s\S]*drop constraint if exists tenant_members_role_check/i);
  has(/tenant_members_role_check[\s\S]*'owner'[\s\S]*'admin'[\s\S]*'manager'[\s\S]*'cashier'[\s\S]*'analyst'[\s\S]*'viewer'/i);
});

test("Core Commerce creates the six bounded first-party commerce tables", () => {
  for (const table of [
    "menu_categories",
    "menu_items",
    "pos_orders",
    "pos_order_items",
    "pos_payments",
    "daily_closes"
  ]) {
    has(new RegExp("create table if not exists public\\." + table + "\\s*\\(", "i"), "missing " + table);
    has(new RegExp("alter table public\\." + table + "\\s+enable row level security;", "i"), "RLS missing " + table);
    has(new RegExp("revoke all on table public\\." + table + "\\s+from anon, authenticated;", "i"), "explicit revoke missing " + table);
  }
});

test("commerce relationships stay tenant scoped and foreign-key hot paths are indexed", () => {
  has(/menu_items_category_fk[\s\S]*foreign key \(tenant_id, category_id\)[\s\S]*references public\.menu_categories\(tenant_id, id\)/i);
  has(/pos_orders_store_fk[\s\S]*foreign key \(tenant_id, store_id\)[\s\S]*references public\.stores\(tenant_id, id\)/i);
  has(/pos_orders_opened_by_fk[\s\S]*foreign key \(tenant_id, opened_by_user_id\)[\s\S]*references public\.tenant_members\(tenant_id, user_id\)/i);
  has(/pos_order_items_order_fk[\s\S]*foreign key \(tenant_id, order_id\)[\s\S]*references public\.pos_orders\(tenant_id, id\)/i);
  has(/pos_order_items_menu_item_fk[\s\S]*foreign key \(tenant_id, menu_item_id\)[\s\S]*references public\.menu_items\(tenant_id, id\)/i);
  has(/pos_payments_order_fk[\s\S]*foreign key \(tenant_id, order_id\)[\s\S]*references public\.pos_orders\(tenant_id, id\)/i);
  has(/daily_closes_store_fk[\s\S]*foreign key \(tenant_id, store_id\)[\s\S]*references public\.stores\(tenant_id, id\)/i);

  for (const index of [
    "menu_items_tenant_category_idx",
    "pos_orders_tenant_store_business_date_idx",
    "pos_orders_tenant_opened_by_idx",
    "pos_order_items_tenant_order_idx",
    "pos_order_items_tenant_menu_item_idx",
    "pos_payments_tenant_order_idx",
    "pos_payments_tenant_recorded_by_idx",
    "daily_closes_tenant_store_date_idx",
    "daily_closes_tenant_closed_by_idx"
  ]) {
    has(new RegExp("create index if not exists " + index, "i"), "missing index " + index);
  }
});

test("menu writes are manager bounded while commerce facts are raw read-only to authenticated users", () => {
  has(/grant select, insert on table public\.menu_categories to authenticated;/i);
  has(/grant select, insert on table public\.menu_items to authenticated;/i);
  has(/menu_categories_manager_insert[\s\S]*has_tenant_role\(\s*tenant_id\s*,\s*array\['owner','admin','manager'\]/i);
  has(/menu_items_manager_insert[\s\S]*has_tenant_role\(\s*tenant_id\s*,\s*array\['owner','admin','manager'\]/i);

  for (const table of ["pos_orders", "pos_order_items", "pos_payments", "daily_closes"]) {
    has(new RegExp("grant select on table public\\." + table + "\\s+to authenticated;", "i"));
    assert.doesNotMatch(
      sql,
      new RegExp("grant\\s+[^;]*(insert|update|delete)[^;]*on table public\\." + table + "\\s+to authenticated", "i"),
      table + " must not have direct authenticated writes"
    );
  }
});

test("order model is idempotent and all trusted totals are constrained", () => {
  has(/client_order_key text not null[\s\S]*char_length\(client_order_key\) between 1 and 128/i);
  has(/request_fingerprint char\(64\) not null[\s\S]*\^\[0-9a-f\]\{64\}\$/i);
  has(/unique \(tenant_id, store_id, client_order_key\)/i);
  has(/unique \(tenant_id, store_id, order_number\)/i);
  has(/status text not null default 'open'[\s\S]*'open'[\s\S]*'paid'[\s\S]*'voided'/i);
  has(/subtotal numeric\(18,2\) not null[\s\S]*subtotal >= 0/i);
  has(/total numeric\(18,2\) not null[\s\S]*total >= 0/i);
  has(/line_total numeric\(18,2\)[\s\S]*generated always as[\s\S]*unit_price \* quantity/i);
});

test("order RPC is atomic, role checked, derives menu price, and detects conflicting retries", () => {
  has(/create or replace function public\.commerce_create_order\(/i);
  has(/security definer/i);
  has(/auth\.uid\(\)[\s\S]*has_tenant_role\(\s*p_tenant_id\s*,\s*array\['owner','admin','manager','cashier'\]/i);
  has(/jsonb_array_elements\(p_items\)/i);
  has(/from public\.menu_items/i);
  has(/mi\.price/i);
  has(/mi\.name/i);
  has(/request_fingerprint/i);
  has(/client_order_key = p_client_order_key/i);
  has(/COMMERCE_IDEMPOTENCY_CONFLICT/i);
  assert.doesNotMatch(sql, /p_(?:unit_)?price/i);
  assert.doesNotMatch(sql, /p_(?:sub)?total/i);
});

test("payment RPC locks one order and requires the exact remaining balance", () => {
  has(/create or replace function public\.commerce_capture_payment\(/i);
  has(/security definer/i);
  has(/for update/i);
  has(/coalesce\(sum\(p\.amount\), 0\)/i);
  has(/v_remaining/i);
  has(/p_amount <> v_remaining/i);
  has(/COMMERCE_PAYMENT_AMOUNT_MISMATCH/i);
  has(/update public\.pos_orders[\s\S]*status = 'paid'[\s\S]*paid_at/i);
  has(/unique[\s\S]*pos_payments[\s\S]*order_id/i);
});

test("dashboard is read-only security invoker and daily close is deterministic/idempotent", () => {
  has(/create or replace function public\.commerce_daily_dashboard\(/i);
  has(/security invoker/i);
  has(/create or replace function public\.commerce_close_day\(/i);
  has(/security definer/i);
  has(/status = 'open'/i);
  has(/COMMERCE_CLOSE_OPEN_ORDERS/i);
  has(/unique \(tenant_id, store_id, business_date\)/i);
  has(/from public\.pos_orders/i);
  has(/from public\.pos_payments/i);
});

test("commerce RPC execution is explicitly revoked from public/anon and granted only to authenticated callers", () => {
  for (const signature of [
    "commerce_create_order\\(uuid, uuid, text, text, jsonb\\)",
    "commerce_capture_payment\\(uuid, uuid, text, numeric, text\\)",
    "commerce_daily_dashboard\\(uuid, uuid, date\\)",
    "commerce_close_day\\(uuid, uuid, date\\)"
  ]) {
    has(new RegExp("revoke all on function public\\." + signature + "\\s+from public, anon", "i"));
    has(new RegExp("grant execute on function public\\." + signature + "\\s+to authenticated, service_role", "i"));
  }
});

test("service role keeps explicit maintenance access", () => {
  for (const table of [
    "menu_categories",
    "menu_items",
    "pos_orders",
    "pos_order_items",
    "pos_payments",
    "daily_closes"
  ]) {
    has(new RegExp("grant select, insert, update, delete on table public\\." + table + "\\s+to service_role;", "i"));
  }
});
