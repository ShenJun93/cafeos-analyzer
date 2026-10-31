import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { offboardTenant } from "../scripts/operator-offboard-tenant.mjs";

const BASE = "https://example.supabase.co";
const SECRET = "sb_secret_operator_test";
const TENANT_ID = "a2000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "b2000000-0000-4000-8000-000000000002";

const TABLES = [
  "tenants",
  "tenant_members",
  "imports",
  "transaction_line_items",
  "stores",
  "customers",
  "customer_identifiers",
  "attention_items",
  "actions",
  "action_status_history",
  "measurement_windows",
  "menu_categories",
  "menu_items",
  "pos_orders",
  "pos_order_items",
  "pos_payments",
  "daily_closes",
  "pos_order_voids"
];

function noContent(status = 204, headers = {}) {
  return new Response(null, { status, headers });
}

function operatorFixture(overrides = {}) {
  const counts = {
    tenants: 1,
    tenant_members: 2,
    imports: 1,
    transaction_line_items: 3,
    stores: 1,
    customers: 1,
    customer_identifiers: 1,
    attention_items: 1,
    actions: 1,
    action_status_history: 1,
    measurement_windows: 1,
    menu_categories: 2,
    menu_items: 2,
    pos_orders: 0,
    pos_order_items: 0,
    pos_payments: 0,
    daily_closes: 0,
    pos_order_voids: 0,
    ...overrides
  };
  const calls = [];

  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method ?? "GET";
    const table = u.pathname.startsWith("/rest/v1/") ? u.pathname.slice("/rest/v1/".length) : null;
    calls.push({ method, pathname: u.pathname, search: u.search, headers: options.headers ?? {} });

    if (method === "HEAD" && TABLES.includes(table)) {
      const column = table === "tenant_members" ? "user_id"
        : table === "pos_order_voids" ? "order_id" : "id";
      assert.equal(u.searchParams.get("select"), column, "invalid count column for " + table);
      assert.equal(u.searchParams.get(table === "tenants" ? "id" : "tenant_id"),
        "eq." + TENANT_ID, "missing tenant-scoped count filter for " + table);
      assert.equal(options.headers.Prefer, "count=exact");
      const count = counts[table] ?? 0;
      const range = count === 0 ? "*/0" : "0-0/" + String(count);
      return noContent(count > 1 ? 206 : 200, { "content-range": range });
    }

    if (method === "DELETE" && table === "tenant_members") {
      counts.tenant_members = 0;
      return noContent();
    }

    if (method === "DELETE" && table === "tenants") {
      for (const name of TABLES) counts[name] = 0;
      return noContent();
    }

    return new Response(JSON.stringify({ error_code: "unexpected_request" }), { status: 500 });
  };

  return { calls, counts, fetchImpl };
}

test("prepare dry-run exposes bounded plan and performs no mutation", async () => {
  const { calls, fetchImpl } = operatorFixture();
  const logs = [];
  const result = await offboardTenant({
    supabaseUrl: BASE,
    secretKey: SECRET,
    tenantId: TENANT_ID,
    fetchImpl,
    now: () => new Date("2026-09-21T12:00:00.000Z"),
    log: value => logs.push(value)
  });

  assert.equal(result.mode, "dry_run");
  assert.equal(result.operation, "tenant_offboarding_prepare");
  assert.equal(result.membershipCount, 2);
  assert.equal(result.defaultGraceDeadline, "2026-10-05");
  assert.equal(calls.some(call => call.method === "DELETE"), false);
  assert.equal(logs[0].includes(TENANT_ID), false);
  assert.equal(logs[0].includes(SECRET), false);
  assert.match(logs[0], /sha256:/);
});

test("prepare execution revokes memberships and verifies zero", async () => {
  const { calls, counts, fetchImpl } = operatorFixture();
  const result = await offboardTenant({
    supabaseUrl: BASE,
    secretKey: SECRET,
    tenantId: TENANT_ID,
    confirmTenantId: TENANT_ID,
    execute: true,
    fetchImpl,
    now: () => new Date("2026-09-21T12:00:00.000Z")
  });

  assert.equal(result.result, "prepared");
  assert.equal(result.membershipsRemoved, 2);
  assert.equal(counts.tenant_members, 0);
  assert.equal(counts.tenants, 1);
  const deleteIndex = calls.findIndex(call => call.pathname === "/rest/v1/tenant_members" && call.method === "DELETE");
  const verifyIndex = calls.findIndex((call, index) => index > deleteIndex && call.pathname === "/rest/v1/tenant_members" && call.method === "HEAD");
  assert.ok(deleteIndex >= 0);
  assert.ok(verifyIndex > deleteIndex);
});

test("hard-delete refuses to run while tenant memberships remain", async () => {
  const { calls, fetchImpl } = operatorFixture();
  await assert.rejects(
    offboardTenant({
      supabaseUrl: BASE,
      secretKey: SECRET,
      tenantId: TENANT_ID,
      phase: "hard-delete",
      confirmTenantId: TENANT_ID,
      execute: true,
      graceDeadline: "2026-09-20",
      exportCleared: true,
      legalHoldCleared: true,
      fetchImpl,
      now: () => new Date("2026-09-21T12:00:00.000Z")
    }),
    /run prepare phase first/
  );
  assert.equal(calls.some(call => call.pathname === "/rest/v1/tenants" && call.method === "DELETE"), false);
});

test("hard-delete requires export and legal-hold clearance plus deadline or early approval", async () => {
  const fixture = operatorFixture({ tenant_members: 0 });
  await assert.rejects(
    offboardTenant({
      supabaseUrl: BASE,
      secretKey: SECRET,
      tenantId: TENANT_ID,
      phase: "hard-delete",
      confirmTenantId: TENANT_ID,
      execute: true,
      graceDeadline: "2026-10-05",
      exportCleared: true,
      legalHoldCleared: true,
      fetchImpl: fixture.fetchImpl,
      now: () => new Date("2026-09-21T12:00:00.000Z")
    }),
    /reached graceDeadline or earlyDeleteApproved/
  );
  assert.equal(fixture.calls.some(call => call.pathname === "/rest/v1/tenants" && call.method === "DELETE"), false);

  await assert.rejects(
    offboardTenant({
      supabaseUrl: BASE,
      secretKey: SECRET,
      tenantId: TENANT_ID,
      phase: "hard-delete",
      confirmTenantId: TENANT_ID,
      execute: true,
      graceDeadline: "2026-09-20",
      exportCleared: false,
      legalHoldCleared: true,
      fetchImpl: fixture.fetchImpl,
      now: () => new Date("2026-09-21T12:00:00.000Z")
    }),
    /exportCleared/
  );
});

test("hard-delete removes exactly the selected tenant graph and verifies all counts zero", async () => {
  const { calls, counts, fetchImpl } = operatorFixture({ tenant_members: 0 });
  const logs = [];
  const result = await offboardTenant({
    supabaseUrl: BASE,
    secretKey: SECRET,
    tenantId: TENANT_ID,
    phase: "hard-delete",
    confirmTenantId: TENANT_ID,
    execute: true,
    graceDeadline: "2026-09-20",
    exportCleared: true,
    legalHoldCleared: true,
    fetchImpl,
    now: () => new Date("2026-09-21T12:00:00.000Z"),
    log: value => logs.push(value)
  });

  assert.equal(result.result, "deleted");
  assert.equal(result.completedAt, "2026-09-21T12:00:00.000Z");
  assert.deepEqual(result.countsAfter, Object.fromEntries(TABLES.map(name => [name, 0])));
  for (const name of TABLES) assert.equal(counts[name], 0);
  assert.equal(logs[0].includes(TENANT_ID), false);
  assert.equal(logs[0].includes(SECRET), false);

  const deletes = calls.filter(call => call.method === "DELETE");
  assert.deepEqual(deletes.map(call => call.pathname), ["/rest/v1/tenants"]);
  assert.equal(deletes[0].search, `?id=eq.${TENANT_ID}`);
});

test("explicit earlier-delete approval can override an unreached grace deadline", async () => {
  const { fetchImpl } = operatorFixture({ tenant_members: 0 });
  const result = await offboardTenant({
    supabaseUrl: BASE,
    secretKey: SECRET,
    tenantId: TENANT_ID,
    phase: "hard-delete",
    confirmTenantId: TENANT_ID,
    execute: true,
    graceDeadline: "2026-10-05",
    earlyDeleteApproved: true,
    exportCleared: true,
    legalHoldCleared: true,
    fetchImpl,
    now: () => new Date("2026-09-21T12:00:00.000Z")
  });
  assert.equal(result.result, "deleted");
});

test("confirmation mismatch fails before any mutation", async () => {
  const { calls, fetchImpl } = operatorFixture();
  await assert.rejects(
    offboardTenant({
      supabaseUrl: BASE,
      secretKey: SECRET,
      tenantId: TENANT_ID,
      confirmTenantId: OTHER_TENANT_ID,
      execute: true,
      fetchImpl
    }),
    /confirmTenantId must exactly match tenantId/
  );
  assert.equal(calls.length, 0);
});


test("Commerce history is a permanent hard-delete stop even with export/legal/grace approval", async () => {
  const facts = ["pos_orders", "pos_order_items", "pos_payments", "daily_closes", "pos_order_voids"];
  for (const table of facts) {
    const fixture = operatorFixture({ tenant_members: 0, [table]: 1 });
    const args = {
      supabaseUrl: BASE, secretKey: SECRET, tenantId: TENANT_ID,
      phase: "hard-delete", confirmTenantId: TENANT_ID, execute: true,
      exportCleared: true, legalHoldCleared: true, earlyDeleteApproved: true,
      fetchImpl: fixture.fetchImpl, now: () => new Date("2026-09-21T12:00:00.000Z")
    };
    await assert.rejects(offboardTenant(args), /Commerce history must be retained/);
    assert.equal(fixture.calls.some(call => call.method === "DELETE"), false, table);
    const dryRun = await offboardTenant({ ...args, execute: false });
    assert.equal(dryRun.commerceHistoryRetentionHold, true);
    assert.deepEqual(dryRun.commerceHistoryTables, [table]);
  }
});

test("offboarding count preflight never converts missing or malformed exact Content-Range into zero", async () => {
  const invalid = [null, "*/*", "*/10", "0-0/0", "0-2/3", "0-0/99999999999999999999999999"];
  for (const value of invalid) {
    const fixture = operatorFixture({ tenant_members: 0 });
    const fetchImpl = async (url, options) => {
      const u = new URL(url);
      if (options?.method === "HEAD" && u.pathname === "/rest/v1/pos_order_voids") {
        return noContent(200, value === null ? {} : { "content-range": value });
      }
      return fixture.fetchImpl(url, options);
    };
    await assert.rejects(offboardTenant({
      supabaseUrl: BASE, secretKey: SECRET, tenantId: TENANT_ID,
      phase: "hard-delete", confirmTenantId: TENANT_ID, execute: true,
      exportCleared: true, legalHoldCleared: true, earlyDeleteApproved: true,
      fetchImpl
    }), /Unable to verify exact row count for pos_order_voids/);
    assert.equal(fixture.calls.some(call => call.method === "DELETE"), false);
  }
});

test("missing Commerce relation refuses offboarding before any DELETE", async () => {
  const fixture = operatorFixture({ tenant_members: 0 });
  const fetchImpl = async (url, options) => {
    if (options?.method === "HEAD" && new URL(url).pathname === "/rest/v1/pos_order_voids")
      return new Response(JSON.stringify({ code: "PGRST205" }), { status: 404 });
    return fixture.fetchImpl(url, options);
  };
  await assert.rejects(offboardTenant({
    supabaseUrl: BASE, secretKey: SECRET, tenantId: TENANT_ID,
    phase: "hard-delete", confirmTenantId: TENANT_ID, execute: true,
    exportCleared: true, legalHoldCleared: true, earlyDeleteApproved: true, fetchImpl
  }), /Supabase request failed status=404/);
  assert.equal(fixture.calls.some(call => call.method === "DELETE"), false);
});

test("prepare revokes memberships even when existing Commerce actor history must be kept", async () => {
  const fixture = operatorFixture({ pos_orders: 3, pos_payments: 2, daily_closes: 1, pos_order_voids: 1 });
  const result = await offboardTenant({
    supabaseUrl: BASE, secretKey: SECRET, tenantId: TENANT_ID,
    confirmTenantId: TENANT_ID, execute: true, fetchImpl: fixture.fetchImpl
  });
  assert.equal(result.result, "prepared");
  assert.equal(fixture.counts.tenant_members, 0);
  assert.equal(fixture.counts.pos_orders, 3);
  assert.equal(fixture.counts.pos_order_voids, 1);
  assert.deepEqual(fixture.calls.filter(c => c.method === "DELETE").map(c => c.pathname),
    ["/rest/v1/tenant_members"]);
});

test("tenant operator script contains no hard-coded elevated credential or browser endpoint", async () => {
  const source = await readFile(
    new URL("../scripts/operator-offboard-tenant.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /SUPABASE_SECRET_KEY/);
  assert.match(source, /sb_secret_/);
  assert.doesNotMatch(source, /service_role/i);
  assert.doesNotMatch(source, /sb_secret_[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(source, /api\/app\/.*delete/i);
});
