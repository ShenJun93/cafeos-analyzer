import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../server/commerce/hq-source-coverage.mjs";
import { WORKFLOW_ROUTES } from "../api/app/workflow.mjs";

const TENANT = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const USER = "a0000000-0000-4000-8000-000000000001";
const DATE = "2026-10-28";
const stores = [1, 2, 3, 4].map(i => ({
  id: "11000000-0000-4000-8000-" + String(i).padStart(12, "0"),
  tenant_id: TENANT, name: "Cafe " + i, active: true
}));
const states = [
  { pos: true, imports: true },
  { pos: true, imports: false },
  { pos: false, imports: true },
  { pos: false, imports: false }
];
const env = {
  SUPABASE_URL: "https://synthetic.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic"
};
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const req = (params = "businessDate=" + DATE, method = "GET") => ({
  url: "/api/app/commerce-hq-sources?" + params,
  method, headers: {
    authorization: "Bearer synthetic",
    "x-cafeos-tenant-id": TENANT
  }
});
const res = () => ({
  statusCode: 0, body: "", setHeader() {}, end(s) { this.body = String(s); }
});
const parsed = r => JSON.parse(r.body);

function pos(storeId, paid) {
  return {
    source: "cafeos_pos", tenantId: TENANT, storeId, businessDate: DATE,
    orderCount: paid ? 1 : 0, openOrderCount: paid ? 1 : 0,
    salesTotal: paid ? "12000.25" : "0.00",
    paymentTotal: paid ? "12000.25" : "0.00",
    aov: paid ? "12000.25" : null,
    paymentMix: paid ? { cash: "12000.25" } : {},
    closed: false, closeId: null, closedAt: null
  };
}
function imported(store, present) {
  return {
    tenantId: TENANT,
    store: { id: store.id, name: store.name, active: true },
    asOfBusinessDate: DATE,
    coverage: { currentHasData: present },
    freshness: { latestObservedTransactionAt: present ? "2026-10-28T08:00:00Z" : null },
    metrics: {
      netSales: { current: present ? "7000.00" : null, baselineStatus: "insufficient_history" },
      orders: { current: present ? 1 : null, baselineStatus: "insufficient_history" },
      aov: { current: present ? "7000.00" : null, baselineStatus: "insufficient_history" }
    }
  };
}
function fixture({
  role = "owner", directory = stores,
  overridePos = (p) => p, overrideImport = (x) => x,
  rejectStore = null
} = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url);
    if (path.pathname === "/auth/v1/user") return response({ id: USER });
    if (path.pathname === "/rest/v1/tenant_members") {
      return response([{ tenant_id: TENANT, role }]);
    }
    if (path.pathname === "/rest/v1/stores") {
      assert.equal(path.searchParams.get("tenant_id"), "eq." + TENANT);
      assert.equal(path.searchParams.get("active"), "eq.true");
      assert.equal(path.searchParams.get("limit"), "26");
      calls.push("directory");
      return response(directory);
    }
    if (path.pathname === "/rest/v1/rpc/commerce_daily_dashboard" ||
        path.pathname === "/rest/v1/rpc/store_health_aggregate") {
      const input = JSON.parse(options.body);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, "Bearer synthetic");
      assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(input.p_tenant_id, TENANT);
      assert.equal(input.p_business_date ?? input.p_as_of_business_date, DATE);
      const index = stores.findIndex(row => row.id === input.p_store_id);
      assert.ok(index >= 0, "Expected Store in fixture");
      const store = stores[index];
      const isPos = path.pathname.endsWith("commerce_daily_dashboard");
      calls.push((isPos ? "pos" : "imports") + ":" + index);
      if (rejectStore === store.id && !isPos) {
        return response({ message: "synthetic upstream failure" }, 503);
      }
      return response(isPos
        ? overridePos(pos(store.id, states[index].pos), index)
        : overrideImport(imported(store, states[index].imports), index));
    }
    throw Error("Unexpected upstream: " + path.pathname);
  };
  return { env, fetchImpl, calls };
}
test("HQ source coverage returns four clear states, no mixed money totals", async () => {
  assert.equal(typeof WORKFLOW_ROUTES["commerce-hq-sources"], "function");
  const deps = fixture(), out = res();
  await handle(req(), out, deps);
  assert.equal(out.statusCode, 200);
  const { report } = parsed(out);
  assert.equal(report.businessDate, DATE);
  assert.equal(report.sourceBoundary, "separate_not_deduplicated");
  assert.equal(report.activeStoreCount, 4);
  assert.deepEqual(report.counts, {
    bothPresent: 1, posOnly: 1, importsOnly: 1, neither: 1
  });
  assert.deepEqual(report.stores.map(s => s.status), [
    "both_present_overlap_unresolved",
    "pos_only_observed", "imports_only_observed", "neither_observed"
  ]);
  assert.equal(report.reconciliation.combinedSales, null);
  assert.equal(report.reconciliation.deduplication, "not_performed");
  assert.equal(report.stores[0].pos.salesTotal, "12000.25");
  assert.equal(report.stores[0].imports.netSales, "7000.00");
  assert.equal(report.stores[3].imports.netSales, null);
  assert.equal(report.stores[3].pos.salesTotal, "0.00");
  assert.equal(deps.calls.filter(x => x.startsWith("pos:")).length, 4);
  assert.equal(deps.calls.filter(x => x.startsWith("imports:")).length, 4);
});
test("HQ source coverage requires manager privilege before any Store listing", async () => {
  for (const role of ["cashier", "viewer", "analyst"]) {
    const deps = fixture({ role }), out = res();
    await handle(req(), out, deps);
    assert.equal(out.statusCode, 403);
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture(), out = res();
  await handle({ ...req(), headers: {} }, out, deps);
  assert.equal(out.statusCode, 401);
  assert.equal(deps.calls.length, 0);
});
test("invalid business date, unknown query and non-GET do not read Stores", async () => {
  for (const params of [
    "", "businessDate=2026-02-30",
    "businessDate=2026-10-28&businessDate=2026-10-28",
    "businessDate=%202026-10-28",
    "businessDate=2026-10-28&tenantId=" + TENANT
  ]) {
    const deps = fixture(), out = res();
    await handle(req(params), out, deps);
    assert.equal(out.statusCode, 400, params);
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture(), out = res();
  await handle(req(undefined, "POST"), out, deps);
  assert.equal(out.statusCode, 405);
  assert.equal(deps.calls.length, 0);
});
test("Store directory lookahead, duplicates, inactive and foreign tenants are refused", async () => {
  for (const directory of [
    [...stores, stores[0]],
    [{ ...stores[0], tenant_id: OTHER }],
    [{ ...stores[0], active: false }],
    Array.from({ length: 26 }, (_, i) => ({
      ...stores[0],
      id: "11000000-0000-4000-8000-" + String(i + 1).padStart(12, "0")
    }))
  ]) {
    const deps = fixture({ directory }), out = res();
    await handle(req(), out, deps);
    assert.equal(out.statusCode, 502);
    assert.equal(deps.calls.filter(x => x.startsWith("pos:")).length, 0);
    assert.equal(Object.hasOwn(parsed(out), "report"), false);
  }
});
test("one mismatched source or failed RPC refuses the entire multi-store report", async () => {
  const scenarios = [
    { overridePos: (p, i) => i === 1 ? { ...p, tenantId: OTHER } : p },
    { overridePos: (p, i) => i === 1 ? { ...p, salesTotal: "12000.26" } : p },
    { overrideImport: (p, i) => i === 1 ? { ...p, store: { ...p.store, id: OTHER } } : p },
    { overrideImport: (p, i) => i === 1 ? { ...p, asOfBusinessDate: "2026-10-27" } : p },
    { overrideImport: (p, i) => i === 1 ? { ...p, store: { ...p.store, name: "Forged" } } : p },
    { rejectStore: stores[1].id }
  ];
  for (const options of scenarios) {
    const deps = fixture(options), out = res();
    await handle(req(), out, deps);
    assert.ok(out.statusCode >= 400, JSON.stringify(options));
    assert.equal(Object.hasOwn(parsed(out), "report"), false);
  }
});
test("empty tenant has zero coverage, not a fabricated imported sales number", async () => {
  const deps = fixture({ directory: [] }), out = res();
  await handle(req(), out, deps);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(parsed(out).report.counts, {
    bothPresent: 0, posOnly: 0, importsOnly: 0, neither: 0
  });
  assert.deepEqual(parsed(out).report.stores, []);
  assert.equal(parsed(out).report.reconciliation.combinedSales, null);
});
