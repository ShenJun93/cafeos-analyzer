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
  "measurement_windows"
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
    ...overrides
  };
  const calls = [];

  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method ?? "GET";
    const table = u.pathname.startsWith("/rest/v1/") ? u.pathname.slice("/rest/v1/".length) : null;
    calls.push({ method, pathname: u.pathname, search: u.search, headers: options.headers ?? {} });

    if (method === "HEAD" && TABLES.includes(table)) {
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
