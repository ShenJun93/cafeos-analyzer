import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sourceScopedOrderIdentity, computeCoreMetrics } from "../dist/metrics.js";
import { computeDataHealth } from "../dist/health.js";
import { analyzeCsv } from "../dist/analyze.js";

const evidence = JSON.parse(await readFile(
  new URL("../fixtures/commerce-identity/vendor-identity-evidence-v1.json", import.meta.url), "utf8"
));
const line = (sourceNamespace, transactionId, product = "Latte", netAmount = 100) => ({
  sourceNamespace, transactionId, store: "Synthetic Store",
  occurredAt: "2026-10-28T02:00:00.000Z",
  product, quantity: 1, netAmount
});

test("source-scoped identity is an unambiguous tuple even when source fields contain separators", () => {
  const a = line("k\u001fv", "SALE-1");
  const b = line("k", "v\u001fSALE-1");
  assert.notEqual(sourceScopedOrderIdentity(a), sourceScopedOrderIdentity(b));
  assert.deepEqual(JSON.parse(sourceScopedOrderIdentity(a)), ["k\u001fv", "SALE-1"]);
  assert.deepEqual(JSON.parse(sourceScopedOrderIdentity(b)), ["k", "v\u001fSALE-1"]);
  assert.notEqual(sourceScopedOrderIdentity(line("v|n", "001")),
    sourceScopedOrderIdentity(line("v", "n|001")));
  assert.notEqual(sourceScopedOrderIdentity(line("v", "x\u001fy")),
    sourceScopedOrderIdentity(line("v\u001fx", "y")));
});

test("delimiter collisions cannot under-count imported orders or skew AOV", () => {
  const a = line("k\u001fv", "SALE-1", "Latte", 110);
  const b = line("k", "v\u001fSALE-1", "Latte", 90);
  const metrics = computeCoreMetrics([a, b]);
  assert.equal(metrics.orders, 2);
  assert.equal(metrics.netSales, 200);
  assert.equal(metrics.aov, 100);
  assert.equal(metrics.identifiedOrders, 0);
  assert.equal(metrics.identifiedCustomerCoverage, 0);
});

test("duplicate-line health key is tuple-safe when external ID and product contain pipe", () => {
  const a = line("src", "txn|part", "latte");
  const b = line("src", "txn", "part|latte");
  assert.equal(computeDataHealth([a, b], 0).duplicateRows, 0);
  assert.equal(computeDataHealth([a, { ...a }], 0).duplicateRows, 1);
});

test("source-scoped counting still deduplicates repeated lines inside one transaction only", () => {
  const a = line("sourceA", "X", "Latte", 200);
  const b = line("sourceA", "X", "Tea", 100);
  const c = line("sourceB", "X", "Latte", 300);
  assert.equal(computeCoreMetrics([a, b, c]).orders, 2);
  assert.equal(computeCoreMetrics([a, b, c]).netSales, 600);
});

test("vendor evidence registry explicitly denies unverified cross-POS identity authority", () => {
  assert.equal(evidence.schemaVersion, "cafeos-vendor-identity-evidence-v1");
  assert.equal(evidence.syntheticOnly, true);
  assert.equal(evidence.vendors.length, 4);
  assert.deepEqual(evidence.vendors.map(v => v.vendor).sort(),
    ["cukcuk", "kiotviet", "pos365", "sapo_fnb"]);
  for (const entry of evidence.vendors) {
    assert.match(entry.sourceUrl, /^https:\/\//);
    assert.equal(entry.stableIdentityAcrossLifecycleVerified, false);
    assert.equal(entry.globalUniquenessVerified, false);
    assert.equal(entry.crossPosLinkVerified, false);
    assert.ok(entry.productFamily.length > 5);
    assert.ok(entry.documentedFields.length > 0);
    assert.equal(Object.hasOwn(entry, "merchantToken"), false);
    assert.equal(Object.hasOwn(entry, "vendorSecret"), false);
    if (entry.candidateVendorOrderId !== null) {
      assert.ok(entry.documentedFields.includes(entry.candidateVendorOrderId));
    }
  }
});

test("CUKCUK published example proves display No is insufficient even inside one upstream", () => {
  const c = evidence.vendors.find(x => x.vendor === "cukcuk");
  assert.equal(c.accountScopeField, "CompanyCode");
  assert.equal(c.branchScopeField, "BranchId");
  assert.equal(c.displayOrderField, "No");
  assert.equal(c.observedDocCollision.sameDisplay, "1.2");
  assert.equal(c.observedDocCollision.distinctIds.length, 2);
  assert.notEqual(...c.observedDocCollision.distinctIds);
  assert.equal(c.crossPosLinkVerified, false);
});

test("KiotViet retail API fields cannot be silently promoted to F&B integration proof", () => {
  const k = evidence.vendors.find(x => x.vendor === "kiotviet");
  assert.match(k.productFamily, /Retail/);
  assert.equal(k.sourceFamilyScopeProven, false);
  assert.equal(k.candidateVendorOrderId, "id");
  assert.equal(k.displayOrderField, "code");
});

test("POS365 API schema does not certify stable CSV ID or cross-source match", () => {
  const p = evidence.vendors.find(x => x.vendor === "pos365");
  assert.match(p.productFamily, /OrderSave/);
  assert.equal(p.accountScopeField, "RetailerId");
  assert.equal(p.branchScopeField, "BranchId");
  assert.equal(p.sourceFamilyScopeProven, false);
  assert.equal(p.crossPosLinkVerified, false);
});

test("Sapo FnB documented Excel line cap is not complete transaction coverage", () => {
  const s = evidence.vendors.find(x => x.vendor === "sapo_fnb");
  assert.equal(s.candidateVendorOrderId, null);
  assert.ok(s.documentedFields.includes("max-20000-lines"));
  assert.equal(s.stableIdentityAcrossLifecycleVerified, false);
});

test("vendor-style CSV fixture proves mapping only, not API identity stability", async () => {
  for (const vendor of [
    { file: "kiotviet-style.csv", source: "kiotviet" },
    { file: "cukcuk-style.csv", source: "cukcuk" },
    { file: "pos365-style.csv", source: "pos365" }
  ]) {
    const csv = await readFile(new URL("../fixtures/vendor/" + vendor.file, import.meta.url), "utf8");
    const result = analyzeCsv(csv, undefined, {
      sourceNamespace: "synthetic:" + vendor.source,
      sourceTimezone: "Asia/Ho_Chi_Minh"
    });
    assert.equal(result.metrics.orders, 3);
    assert.ok(result.items.every(row => row.sourceNamespace === "synthetic:" + vendor.source));
    assert.equal(evidence.vendors.find(x => x.vendor === vendor.source).crossPosLinkVerified, false);
  }
});
