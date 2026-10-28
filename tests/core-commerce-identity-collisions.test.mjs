// Phase 1.1 negative evidence gates. Tests exercise existing read-only handlers;
// they do NOT introduce or prove a POS/import link resolver.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  handle as importLineageHandle,
  summarizeNamespaceRows,
  storeDayUtcBounds
} from "../server/commerce/import-lineage.mjs";
import { handle as sourceBridgeHandle } from "../server/commerce/source-bridge.mjs";

const F = JSON.parse(await readFile(
  new URL("../fixtures/commerce-identity/overlap-collisions-v1.json", import.meta.url),
  "utf8"
));
const env = {
  SUPABASE_URL: "https://synthetic.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic"
};
const json = (body,headers={}) => new Response(JSON.stringify(body), { status: 200, headers });
const res = () => ({
  statusCode: 0, body: "", setHeader() {}, end(x) { this.body = String(x); }
});
const payload = r => JSON.parse(r.body);
const req = path => ({
  method: "GET", url: path,
  headers: {
    authorization: "Bearer synthetic",
    "x-cafeos-tenant-id": F.tenantId
  }
});
const context = (overrides = {}) => ({
  tenantId: F.tenantId,
  storeId: F.storeId,
  day: F.businessDate,
  formatter: storeDayUtcBounds(F.businessDate, F.storeTimezone).formatter,
  ...overrides
});
const sourceRow = (id, updates = {}) => ({
  ...F.importLineItems[0], id: "31000000-0000-4000-8000-" + String(id).padStart(12, "0"),
  ...updates
});
const storeRecord = () => ({
  id: F.storeId, tenant_id: F.tenantId, name: "Synthetic Store",
  timezone: F.storeTimezone, active: true
});

function fixtureFetch({ role = "manager", lines = F.importLineItems } = {}) {
  const paths = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") return json({ id: F.userId });
    if (parsed.pathname === "/rest/v1/tenant_members") {
      return json([{ tenant_id: F.tenantId, role }]);
    }
    paths.push(parsed.pathname);
    if (parsed.pathname === "/rest/v1/stores") {
      assert.equal(parsed.searchParams.get("tenant_id"), "eq." + F.tenantId);
      assert.equal(parsed.searchParams.get("id"), "eq." + F.storeId);
      return json([storeRecord()]);
    }
    if (parsed.pathname === "/rest/v1/transaction_line_items") {
      assert.equal(options.headers.authorization, "Bearer synthetic");
      assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(parsed.searchParams.get("limit"), "501");
      assert.equal(options.headers.prefer,"count=exact");
      assert.equal(parsed.searchParams.get("tenant_id"), "eq." + F.tenantId);
      assert.equal(parsed.searchParams.get("store_id"), "eq." + F.storeId);
      return json(lines, { "content-range": lines.length
        ? "0-" + (lines.length-1) + "/" + lines.length : "*/0" });
    }
    if (parsed.pathname === "/rest/v1/rpc/commerce_daily_dashboard") {
      assert.equal(options.headers.authorization, "Bearer synthetic");
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).p_store_id, F.storeId);
      return json({
        source: "cafeos_pos", tenantId: F.tenantId, storeId: F.storeId,
        businessDate: F.businessDate, salesTotal: "34000.00",
        paymentTotal: "34000.00", orderCount: 1, openOrderCount: 0,
        aov: "34000.00", paymentMix: { cash: "34000.00" },
        closed: false, closeId: null, closedAt: null
      });
    }
    if (parsed.pathname === "/rest/v1/rpc/store_health_aggregate") {
      assert.equal(options.headers.authorization, "Bearer synthetic");
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).p_store_id, F.storeId);
      return json({
        tenantId: F.tenantId,
        store: { id: F.storeId, name: "Synthetic Store", active: true },
        asOfBusinessDate: F.businessDate,
        coverage: { currentHasData: true },
        freshness: { latestObservedTransactionAt: "2026-10-28T02:00:00Z" },
        metrics: {
          netSales: { current: "34000.00", baselineStatus: "insufficient_history" },
          orders: { current: 1, baselineStatus: "insufficient_history" },
          aov: { current: "34000.00", baselineStatus: "insufficient_history" }
        }
      });
    }
    throw Error("Unexpected synthetic upstream " + parsed.pathname);
  };
  return { env, fetchImpl, paths };
}

test("synthetic identity fixture is tenant/Store scoped and contains collision witnesses, not PII", () => {
  assert.equal(F.schema, "cafeos-identity-collision-fixture-v1");
  assert.equal(F.syntheticOnly, true);
  assert.notEqual(F.tenantId, F.otherTenantId);
  assert.notEqual(F.storeId, F.otherStoreId);
  assert.ok(F.importLineItems.every(x =>
    x.tenant_id === F.tenantId && x.store_id === F.storeId));
  assert.ok(F.posOrders.every(x =>
    x.tenant_id === F.tenantId && x.store_id === F.storeId));
  assert.equal(F.posOrders[0].order_number, F.importLineItems[0].transaction_id);
  assert.equal(F.posOrders[0].total, F.importLineItems[2].net_amount);
  assert.equal(F.posOrders[0].opened_at, F.importLineItems[0].occurred_at);
  assert.equal(F.importLineItems[0].transaction_id, F.importLineItems[1].transaction_id);
  assert.notEqual(F.importLineItems[0].source_record_key, F.importLineItems[1].source_record_key);
  assert.equal(F.importLineItems[0].transaction_id, F.importLineItems[2].transaction_id);
  assert.notEqual(F.importLineItems[0].source_namespace, F.importLineItems[2].source_namespace);
  const dump = JSON.stringify(F);
  assert.doesNotMatch(dump, /(?:@|customer_phone|customer_email|customer_name|service.role|password)/i);
});

test("imported counting respects namespace-scoped IDs despite identical POS order number", () => {
  const s = summarizeNamespaceRows(F.importLineItems, context());
  assert.equal(s.observedLineItemCount, F.expectedObserved.lineItems);
  assert.equal(s.observedNamespaceCount, F.expectedObserved.namespaceCount);
  assert.deepEqual(s.namespaces, F.expectedObserved.namespaces);
  assert.equal(s.namespaces.reduce((sum, x) => sum + x.sourceScopedTransactionCount, 0),
    F.expectedObserved.namespaceScopedTransactionCount);
  assert.equal(s.namespaces[0].sourceScopedTransactionCount, 2);
  assert.equal(s.namespaces[1].sourceScopedTransactionCount, 2);
});

test("source rows belonging to a different Tenant or Store fail closed, even with same external ID", () => {
  for (const altered of [
    sourceRow(10, { tenant_id: F.otherTenantId }),
    sourceRow(11, { store_id: F.otherStoreId })
  ]) {
    assert.throws(() => summarizeNamespaceRows([altered], context()),
      /Untrusted source lineage/);
  }
  const foreignStoreSummary = summarizeNamespaceRows(
    [sourceRow(12, { store_id: F.otherStoreId })],
    context({ storeId: F.otherStoreId })
  );
  assert.equal(foreignStoreSummary.observedLineItemCount, 1);
  assert.equal(foreignStoreSummary.namespaces[0].sourceScopedTransactionCount, 1);
});

test("same imported identifier can occur on another Store-local date without becoming a link", () => {
  const bounds = storeDayUtcBounds(F.businessDate, F.storeTimezone);
  assert.equal(bounds.start, "2026-10-27T17:00:00.000Z");
  assert.equal(bounds.end, "2026-10-28T17:00:00.000Z");
  const firstMillisecond = sourceRow(13, { occurred_at: bounds.start });
  const lastMillisecond = sourceRow(14, {
    occurred_at: "2026-10-28T16:59:59.999Z"
  });
  const atNextDay = sourceRow(15, { occurred_at: bounds.end });
  assert.equal(summarizeNamespaceRows(
    [firstMillisecond, lastMillisecond], context()
  ).namespaces[0].sourceScopedTransactionCount, 1);
  assert.throws(() => summarizeNamespaceRows([atNextDay], context()),
    /Untrusted source lineage/);
  assert.equal(summarizeNamespaceRows(
    [atNextDay],
    context({ day: "2026-10-29", formatter: storeDayUtcBounds("2026-10-29", F.storeTimezone).formatter })
  ).namespaces[0].sourceScopedTransactionCount, 1);
});

test("duplicate line UUID fails closed while two distinct lines of one imported order are valid", () => {
  assert.equal(summarizeNamespaceRows(F.importLineItems.slice(0, 2), context())
    .namespaces[0].sourceScopedTransactionCount, 1);
  assert.throws(() => summarizeNamespaceRows(
    [F.importLineItems[0], { ...F.importLineItems[0] }], context()
  ), /Untrusted source lineage/);
});

test("500 row observation is bounded; 501 refuses to publish any partial namespace metric", () => {
  const rows = Array.from({ length: 500 }, (_, i) =>
    sourceRow(1000 + i, { transaction_id: "BULK-" + i }));
  assert.equal(summarizeNamespaceRows(rows, context()).observedLineItemCount, 500);
  assert.throws(() => summarizeNamespaceRows(
    [...rows, sourceRow(1500, { transaction_id: "BULK-500" })], context()
  ), /exceeds the bounded audit/);
  // Synthetic 501 lookahead does NOT establish upstream PostgREST completeness.
});

test("read-only namespace HTTP response never exposes external IDs or a cross-source match", async () => {
  const deps = fixtureFetch(), out = res();
  await importLineageHandle(req(
    "/api/app/commerce-import-lineage?storeId=" + F.storeId + "&businessDate=" + F.businessDate
  ), out, deps);
  assert.equal(out.statusCode, 200, out.body);
  const p = payload(out);
  assert.equal(p.observedLineItemCount, 5);
  assert.equal(p.sourceBoundary.comparedToPos, false);
  assert.equal(p.sourceBoundary.sourceAccountProvenance, "not_verified");
  assert.equal(p.sourceBoundary.deduplication, "not_performed");
  assert.equal(p.sourceBoundary.combinedSales, null);
  assert.equal(p.sourceBoundary.transactionIdsExposed, false);
  assert.equal(p.completeness.status, "bounded_read_only");
  assert.equal(p.completeness.exactResponseVerified, true);
  assert.equal(p.completeness.exactMatchedLineItemCount, 5);
  assert.deepEqual(p.namespaces, F.expectedObserved.namespaces);
  for (const external of ["COLLIDE-001", "COLLIDE-002", "COLLIDE-003"]) {
    assert.equal(out.body.includes(external), false);
  }
  assert.deepEqual(deps.paths, ["/rest/v1/stores", "/rest/v1/transaction_line_items"]);
  assert.equal(Object.hasOwn(p, "linkedOrders"), false);
});

test("client-supplied mapping proof is not an accepted query or write route", async () => {
  const endpoint = "/api/app/commerce-import-lineage?storeId=" + F.storeId
    + "&businessDate=" + F.businessDate + "&verified=true";
  const deps = fixtureFetch(), out = res();
  await importLineageHandle(req(endpoint), out, deps);
  assert.equal(out.statusCode, 400);
  assert.deepEqual(deps.paths, []);
  const write = res();
  await importLineageHandle({ ...req(endpoint), method: "POST" }, write, deps);
  assert.equal(write.statusCode, 405);
  assert.deepEqual(deps.paths, []);
});

test("identical POS/import money cannot produce a combined sale or dedup result", async () => {
  const deps = fixtureFetch(), out = res();
  await sourceBridgeHandle(req(
    "/api/app/commerce-source-bridge?storeId=" + F.storeId + "&businessDate=" + F.businessDate
  ), out, deps);
  assert.equal(out.statusCode, 200, out.body);
  const p = payload(out);
  assert.equal(p.sourceBoundary.status, "separate_not_deduplicated");
  assert.equal(p.sources.cafeosPos.salesTotal, "34000.00");
  assert.equal(p.sources.imports.netSales, "34000.00");
  assert.equal(Object.hasOwn(p, "combinedSales"), false);
  assert.equal(Object.hasOwn(p, "unifiedSales"), false);
  assert.equal(Object.hasOwn(p, "linkedOrders"), false);
  assert.equal(Object.hasOwn(p, "deduplication"), false);
  assert.deepEqual(deps.paths.sort(), [
    "/rest/v1/rpc/commerce_daily_dashboard",
    "/rest/v1/rpc/store_health_aggregate"
  ]);
});

test("source-of-record SQL keeps distinct native idempotency and import line-item keys", async () => {
  const posSql = await readFile(
    new URL("../db/contracts/core_commerce_v1.sql", import.meta.url), "utf8"
  );
  const importSql = await readFile(
    new URL("../db/migrations/001_analyzer_core.sql", import.meta.url), "utf8"
  );
  assert.match(posSql, /constraint pos_orders_client_key[\s\S]*?unique\s*\(tenant_id,\s*store_id,\s*client_order_key\)/i);
  assert.match(posSql, /constraint pos_orders_number_key[\s\S]*?unique\s*\(tenant_id,\s*store_id,\s*order_number\)/i);
  assert.match(importSql, /unique\s*\(tenant_id,\s*source_namespace,\s*source_record_key\)/i);
  assert.match(importSql, /transaction_id text not null/i);
  assert.doesNotMatch(posSql, /\b(?:external_transaction_id|import_source_namespace)\b/i);
  assert.doesNotMatch(importSql, /\bpos_order_id\b/i);
});
