import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeCsv } from "../dist/analyze.js";
import { parseCsv } from "../dist/csv.js";
import { mapHeaders } from "../dist/mapping.js";
import { computeCoreMetrics } from "../dist/metrics.js";
import { daypartForInstant, localBusinessClock } from "../dist/time.js";

const fixture = await readFile(new URL("../fixtures/known-anomaly.csv", import.meta.url), "utf8");

test("RFC-style quoted CSV cells parse", () => {
  const rows = parseCsv('a,b\n"x,y","a""b"\n');
  assert.deepEqual(rows, [["a","b"],["x,y",'a"b']]);
});

test("Vietnamese export headers map to canonical fields", () => {
  const mapping = mapHeaders(["Ngày Bán","Mã HĐ","Chi Nhánh","Sản Phẩm","SL","Thành Tiền","SĐT Khách"]);
  assert.equal(mapping.occurred_at, 0);
  assert.equal(mapping.transaction_id, 1);
  assert.equal(mapping.store, 2);
  assert.equal(mapping.net_amount, 5);
  assert.equal(mapping.customer_phone, 6);
});

test("known-answer fixture reproduces deterministic metrics", () => {
  const result = analyzeCsv(fixture);
  assert.equal(result.health.invalidRows, 0);
  assert.equal(result.health.duplicateRows, 0);
  assert.equal(result.metrics.orders, 97);
  assert.equal(result.metrics.netSales, 4_850_000);
  assert.equal(result.metrics.aov, 50_000);
  assert.equal(result.metrics.identifiedOrders, 60);
  assert.equal(result.metrics.identifiedCustomers, 12);
  assert.equal(result.metrics.repeatCustomers, 12);
  assert.ok(Math.abs(result.metrics.identifiedCustomerCoverage - 60/97) < 1e-12);
  assert.equal(result.metrics.repeatRate, 1);
});

test("Q7 evening decline is detected and decomposes to order volume", () => {
  const result = analyzeCsv(fixture);
  const q7 = result.insights.find(x => x.store === "Q7" && x.daypart === "evening");
  assert.ok(q7);
  assert.equal(q7.currentSales, 350_000);
  assert.equal(q7.baselineSales, 500_000);
  assert.equal(q7.currentOrders, 7);
  assert.equal(q7.baselineOrders, 10);
  assert.ok(Math.abs(q7.salesDeltaPct + 0.3) < 1e-12);
  assert.ok(Math.abs(q7.orderDeltaPct + 0.3) < 1e-12);
  assert.equal(result.insights.some(x => x.store === "Q1"), false);
});


test("Vietnamese date and currency formats normalize deterministically", () => {
  const csv = [
    "Ngày Bán,Mã HĐ,Chi Nhánh,Sản Phẩm,SL,Thành Tiền,SĐT Khách",
    "20/09/2026 08:15,VN-1,Q1,Matcha,1,₫72.000,0001234567",
    "20-09-26 09:30,VN-2,Q1,Latte,2,1.200.000,"
  ].join("\n");
  const result = analyzeCsv(csv);
  assert.equal(result.health.invalidRows, 0);
  assert.equal(result.metrics.orders, 2);
  assert.equal(result.metrics.netSales, 1_272_000);
  assert.equal(result.items[0].occurredAt, "2026-09-20T08:15:00.000Z");
});

test("naive timestamps use an explicit source timezone while offset timestamps preserve their instant", () => {
  const csv = [
    "occurred_at,transaction_id,store,product,quantity,net_amount",
    "20/09/2026 08:15,VN-LOCAL,Q1,Latte,1,50000",
    "2026-09-20T08:15:00+07:00,VN-OFFSET,Q1,Latte,1,50000",
    "2026-09-20T01:15:00Z,VN-Z,Q1,Latte,1,50000"
  ].join("\n");

  const result = analyzeCsv(csv, undefined, {
    sourceTimezone: "Asia/Ho_Chi_Minh",
    defaultStoreTimezone: "Asia/Ho_Chi_Minh",
    sourceNamespace: "vn-pos"
  });

  assert.equal(result.items[0].occurredAt, "2026-09-20T01:15:00.000Z");
  assert.equal(result.items[1].occurredAt, "2026-09-20T01:15:00.000Z");
  assert.equal(result.items[2].occurredAt, "2026-09-20T01:15:00.000Z");
  assert.equal(result.items[0].sourceTimezone, "Asia/Ho_Chi_Minh");
  assert.equal(result.items[0].storeTimezone, "Asia/Ho_Chi_Minh");
  assert.equal(result.items[0].sourceNamespace, "vn-pos");

  assert.throws(
    () => analyzeCsv(csv, undefined, { sourceTimezone: "Mars/Olympus" }),
    /Invalid IANA timezone/
  );
});

test("business date and daypart derive from Store timezone rather than UTC", () => {
  const overnight = localBusinessClock("2026-09-20T18:30:00Z", "Asia/Ho_Chi_Minh");
  assert.deepEqual(overnight, {
    date: "2026-09-21",
    hour: 1,
    minute: 30,
    second: 0
  });

  assert.equal(
    daypartForInstant("2026-09-20T04:30:00Z", "Asia/Ho_Chi_Minh"),
    "afternoon"
  );
});

test("order identity is source-scoped and AOV uses the corrected order count", () => {
  const csv = [
    "occurred_at,transaction_id,store,product,quantity,net_amount,customer_phone",
    "2026-09-20T08:00:00Z,SAME-ID,Q1,Latte,1,50000,0001234567"
  ].join("\n");
  const sourceA = analyzeCsv(csv, undefined, { sourceNamespace: "pos-a" }).items;
  const sourceB = analyzeCsv(csv, undefined, { sourceNamespace: "pos-b" }).items;

  const crossSource = computeCoreMetrics([...sourceA, ...sourceB]);
  assert.equal(crossSource.orders, 2);
  assert.equal(crossSource.netSales, 100000);
  assert.equal(crossSource.aov, 50000);
  assert.equal(crossSource.repeatCustomers, 1);

  const repeatedLineSameOrder = computeCoreMetrics([...sourceA, ...sourceA]);
  assert.equal(repeatedLineSameOrder.orders, 1);
  assert.equal(repeatedLineSameOrder.netSales, 100000);
  assert.equal(repeatedLineSameOrder.aov, 100000);
});

test("daypart decline uses Store-local time and exact previous four same-weekday dates", () => {
  const csv = [
    "occurred_at,transaction_id,store,product,quantity,net_amount",
    "2026-08-24T04:30:00Z,W1,Q1,Latte,1,100000",
    "2026-08-31T04:30:00Z,W2,Q1,Latte,1,100000",
    "2026-09-07T04:30:00Z,W3,Q1,Latte,1,100000",
    "2026-09-14T04:30:00Z,W4,Q1,Latte,1,100000",
    "2026-09-21T04:30:00Z,W5,Q1,Latte,1,70000"
  ].join("\n");

  const result = analyzeCsv(csv, undefined, {
    sourceNamespace: "pos-a",
    sourceTimezone: "UTC",
    defaultStoreTimezone: "Asia/Ho_Chi_Minh"
  });
  const insight = result.insights.find(x => x.store === "Q1");
  assert.ok(insight);
  assert.equal(insight.daypart, "afternoon");
  assert.deepEqual(insight.evidenceDates, [
    "2026-08-24",
    "2026-08-31",
    "2026-09-07",
    "2026-09-14",
    "2026-09-21"
  ]);

  const missingWeek = analyzeCsv(
    csv.split("\n").filter(line => !line.startsWith("2026-09-07")).join("\n"),
    undefined,
    {
      sourceNamespace: "pos-a",
      sourceTimezone: "UTC",
      defaultStoreTimezone: "Asia/Ho_Chi_Minh"
    }
  );
  assert.equal(missingWeek.insights.length, 0);
});

test("low identity coverage disables retention capability without blocking sales analytics", () => {
  const lines = ["occurred_at,transaction_id,store,product,quantity,net_amount,customer_phone"];
  for (let i = 0; i < 10; i++) lines.push(`2026-09-20T08:${String(i).padStart(2,"0")}:00Z,O-${i},Q1,Latte,1,50000,${i === 0 ? "0001234567" : ""}`);
  const result = analyzeCsv(lines.join("\n"));
  assert.equal(result.capabilities.salesAnalytics, true);
  assert.equal(result.metrics.identifiedCustomerCoverage, 0.1);
  assert.equal(result.capabilities.customerRetention, false);
});

test("exact duplicate line is surfaced as a data-health warning signal", () => {
  const csv = [
    "occurred_at,transaction_id,store,product,quantity,net_amount",
    "2026-09-20T08:00:00Z,D-1,Q1,Latte,1,50000",
    "2026-09-20T08:00:00Z,D-1,Q1,Latte,1,50000"
  ].join("\n");
  const result = analyzeCsv(csv);
  assert.equal(result.health.duplicateRows, 1);
});

import { inspectXlsx, analyzeXlsx } from "../dist/xlsx.js";
import { InMemoryImportLedger, keyCanonicalItems } from "../dist/imports.js";

const xlsxFixture = new Uint8Array(await readFile(new URL("../fixtures/multi-sheet-vietnamese.xlsx", import.meta.url)));
const ambiguousXlsx = new Uint8Array(await readFile(new URL("../fixtures/ambiguous.xlsx", import.meta.url)));

test("XLSX inspection identifies the transaction sheet instead of summary/staff sheets", () => {
  const inspection = inspectXlsx(xlsxFixture);
  assert.equal(inspection.suggestedSheet, "SALES");
  assert.equal(inspection.ambiguous, false);
  const sales = inspection.sheets.find(x => x.name === "SALES");
  assert.ok(sales);
  assert.equal(sales.mappedRequired, 6);
  assert.equal(sales.mappedOptional, 1);
  assert.equal(sales.rowCount, 97);
});

test("XLSX date/currency cells reproduce the CSV golden metrics and insight", () => {
  const result = analyzeXlsx(xlsxFixture);
  assert.equal(result.workbook.selectedSheet, "SALES");
  assert.equal(result.metrics.orders, 97);
  assert.equal(result.metrics.netSales, 4_850_000);
  assert.equal(result.metrics.identifiedCustomers, 12);
  const q7 = result.insights.find(x => x.store === "Q7" && x.daypart === "evening");
  assert.ok(q7);
  assert.equal(q7.currentSales, 350_000);
  assert.equal(q7.baselineSales, 500_000);
});

test("ambiguous XLSX transaction sheets require explicit selection", () => {
  const inspection = inspectXlsx(ambiguousXlsx);
  assert.equal(inspection.ambiguous, true);
  assert.throws(() => analyzeXlsx(ambiguousXlsx), /select a sheet explicitly/);
  const selected = analyzeXlsx(ambiguousXlsx, "SALES_B");
  assert.equal(selected.workbook.selectionSource, "explicit");
  assert.equal(selected.metrics.orders, 1);
});

test("overlapping imports are idempotent within a tenant/source namespace", () => {
  const first = analyzeCsv([
    "occurred_at,transaction_id,store,product,quantity,net_amount",
    "2026-09-18T08:00:00Z,O-1,Q1,Latte,1,50000",
    "2026-09-19T08:00:00Z,O-2,Q1,Latte,1,50000",
    "2026-09-20T08:00:00Z,O-3,Q1,Latte,1,50000"
  ].join("\n")).items;
  const second = analyzeCsv([
    "occurred_at,transaction_id,store,product,quantity,net_amount",
    "2026-09-19T08:00:00Z,O-2,Q1,Latte,1,50000",
    "2026-09-20T08:00:00Z,O-3,Q1,Latte,1,50000",
    "2026-09-21T08:00:00Z,O-4,Q1,Latte,1,50000"
  ].join("\n")).items;
  const ledger = new InMemoryImportLedger();
  const a = ledger.ingest("tenant-a", "manual-pos-export", first);
  const b = ledger.ingest("tenant-a", "manual-pos-export", second);
  const otherTenant = ledger.ingest("tenant-b", "manual-pos-export", second);
  assert.equal(a.newItems.length, 3);
  assert.equal(b.alreadyKnown, 2);
  assert.equal(b.newItems.length, 1);
  assert.equal(ledger.size("tenant-a", "manual-pos-export"), 4);
  assert.equal(otherTenant.newItems.length, 3);
});

test("stable import keys preserve two identical lines while making their reimport idempotent", () => {
  const items = analyzeCsv([
    "occurred_at,transaction_id,store,product,quantity,net_amount",
    "2026-09-20T08:00:00Z,O-1,Q1,Latte,1,50000",
    "2026-09-20T08:00:00Z,O-1,Q1,Latte,1,50000"
  ].join("\n")).items;
  const keyed = keyCanonicalItems(items);
  assert.equal(keyed.length, 2);
  assert.notEqual(keyed[0].sourceRecordKey, keyed[1].sourceRecordKey);
  const ledger = new InMemoryImportLedger();
  assert.equal(ledger.ingest("t", "s", items).newItems.length, 2);
  assert.equal(ledger.ingest("t", "s", items).newItems.length, 0);
});

test("database migration encodes tenant RLS and idempotency uniqueness", async () => {
  const sql = await readFile(new URL("../db/migrations/001_analyzer_core.sql", import.meta.url), "utf8");
  for (const table of ["tenants", "tenant_members", "imports", "transaction_line_items"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /unique \(tenant_id, source_namespace, source_record_key\)/i);
  assert.match(sql, /unique \(tenant_id, source_namespace, fingerprint\)/i);
  assert.match(sql, /private\.has_tenant_access\(tenant_id\)/i);
});

import { inspectBytes, analyzeBytes } from "../dist/file.js";

for (const [name, expectedSales] of [
  ["kiotviet-style.csv", 235_000],
  ["cukcuk-style.csv", 165_000],
  ["pos365-style.csv", 200_000]
]) {
  test(`vendor-style fixture auto-maps required fields: ${name}`, async () => {
    const bytes = new Uint8Array(await readFile(new URL(`../fixtures/vendor/${name}`, import.meta.url)));
    const inspection = inspectBytes(name, bytes);
    assert.equal(inspection.kind, "csv");
    if (inspection.kind !== "csv") return;
    for (const field of ["transaction_id","occurred_at","store","product","quantity","net_amount"]) {
      assert.notEqual(inspection.mapping[field], undefined, `missing ${field}`);
    }
    const result = analyzeBytes(name, bytes);
    assert.equal(result.metrics.orders, 3);
    assert.equal(result.metrics.netSales, expectedSales);
  });
}

test("unknown headers stop automatic analysis but explicit manual mapping unblocks it", async () => {
  const name = "manual-fallback.csv";
  const bytes = new Uint8Array(await readFile(new URL(`../fixtures/vendor/${name}`, import.meta.url)));
  const inspection = inspectBytes(name, bytes);
  assert.equal(inspection.kind, "csv");
  if (inspection.kind !== "csv") return;
  assert.equal(Object.keys(inspection.mapping).length, 0);
  assert.throws(() => analyzeBytes(name, bytes), /Missing required mapping/);
  const result = analyzeBytes(name, bytes, undefined, {
    occurred_at: 0,
    transaction_id: 1,
    store: 2,
    product: 3,
    quantity: 4,
    net_amount: 5,
    customer_phone: 6
  });
  assert.equal(result.metrics.orders, 2);
  assert.equal(result.metrics.netSales, 115_000);
  assert.equal(result.metrics.identifiedCustomerCoverage, 1);
});

test("manual mapping rejects assigning one column to two canonical fields", async () => {
  const name = "manual-fallback.csv";
  const bytes = new Uint8Array(await readFile(new URL(`../fixtures/vendor/${name}`, import.meta.url)));
  assert.throws(() => analyzeBytes(name, bytes, undefined, {
    occurred_at: 0,
    transaction_id: 1,
    store: 2,
    product: 3,
    quantity: 4,
    net_amount: 4
  }), /mapped to both/);
});

import { buildCompatibilityProfile, buildShareableValidationPack } from "../dist/validation.js";

test("compatibility profile contains schema metadata but no row values", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../fixtures/vendor/kiotviet-style.csv", import.meta.url)));
  const profile = buildCompatibilityProfile("merchant.csv", bytes);
  assert.equal(profile.fileKind, "csv");
  assert.equal(profile.csv.rowCount, 3);
  assert.equal(profile.csv.unmappedRequiredFields.length, 0);
  const serialized = JSON.stringify(profile);
  assert.doesNotMatch(serialized, /0001234567|0012345678|Q1|Matcha Latte/i);
  assert.match(serialized, /purchaseDate|branchName/i);
});

test("shareable validation pack removes raw customer/store/product/transaction identifiers", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../fixtures/vendor/kiotviet-style.csv", import.meta.url)));
  const pack = buildShareableValidationPack("merchant.csv", bytes, "validation-secret-2026");
  const serialized = JSON.stringify(pack);
  for (const raw of ["0001234567", "0012345678", "Q1", "Matcha Latte", "KV-001"]) {
    assert.equal(serialized.includes(raw), false, `leaked raw value: ${raw}`);
  }
  assert.match(pack.sanitizedCanonicalCsv, /customer_[0-9a-f]{20}/);
  assert.match(pack.sanitizedCanonicalCsv, /store_[0-9a-f]{20}/);
  assert.match(pack.sanitizedCanonicalCsv, /product_[0-9a-f]{20}/);
  assert.match(pack.sanitizedCanonicalCsv, /txn_[0-9a-f]{20}/);
});

test("pseudonymized canonical CSV reproduces source metrics and customer grouping", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../fixtures/known-anomaly.csv", import.meta.url)));
  const original = analyzeBytes("known-anomaly.csv", bytes);
  const pack = buildShareableValidationPack("known-anomaly.csv", bytes, "validation-secret-2026");
  const replay = analyzeCsv(pack.sanitizedCanonicalCsv);
  assert.equal(replay.metrics.netSales, original.metrics.netSales);
  assert.equal(replay.metrics.orders, original.metrics.orders);
  assert.equal(replay.metrics.identifiedCustomers, original.metrics.identifiedCustomers);
  assert.equal(replay.metrics.repeatCustomers, original.metrics.repeatCustomers);
  assert.equal(replay.insights.length, original.insights.length);
});

test("pseudonymization is stable with the same key and different across keys", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../fixtures/vendor/kiotviet-style.csv", import.meta.url)));
  const a = buildShareableValidationPack("merchant.csv", bytes, "validation-secret-2026");
  const b = buildShareableValidationPack("merchant.csv", bytes, "validation-secret-2026");
  const c = buildShareableValidationPack("merchant.csv", bytes, "different-secret-2026");
  assert.equal(a.sanitizedCanonicalCsv, b.sanitizedCanonicalCsv);
  assert.notEqual(a.sanitizedCanonicalCsv, c.sanitizedCanonicalCsv);
});

test("shareable pack refuses weak HMAC keys", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../fixtures/vendor/kiotviet-style.csv", import.meta.url)));
  assert.throws(() => buildShareableValidationPack("merchant.csv", bytes, "short"), /at least 16/);
});

import { evaluateFieldValidation } from "../dist/validation-gates.js";

function validationRecord(id, overrides = {}) {
  return {
    id,
    source: "test-pos",
    targetIcp: true,
    importAttempted: true,
    importSucceeded: true,
    reconciliationAttempted: true,
    metricTrusted: true,
    insightReviewed: true,
    usefulNewInsight: true,
    repeatUseAsked: true,
    repeatUseIntent: true,
    continuousSyncAsked: true,
    continuousSyncIntent: true,
    valueDemonstrated: true,
    wtpAsked: true,
    willingnessToPay: true,
    ...overrides
  };
}

test("field-validation scorecard refuses to PASS below minimum sample size", () => {
  const score = evaluateFieldValidation(Array.from({length: 9}, (_, i) => validationRecord(`R${i}`)));
  assert.equal(score.sampleReady, false);
  assert.equal(score.overall, "INSUFFICIENT_EVIDENCE");
});

test("field-validation scorecard passes only when every locked gate passes", () => {
  const records = Array.from({length: 10}, (_, i) => validationRecord(`R${i}`));
  const score = evaluateFieldValidation(records);
  assert.equal(score.sampleReady, true);
  assert.equal(score.overall, "PASS");
  assert.equal(score.metricTrust.denominator, 10);
});

test("field-validation scorecard uses evidence-specific denominators and fails a broken gate", () => {
  const records = Array.from({length: 10}, (_, i) => validationRecord(`R${i}`, i < 7 ? { importSucceeded: true } : { importSucceeded: false, reconciliationAttempted: false, metricTrusted: false, insightReviewed: false }));
  const score = evaluateFieldValidation(records);
  assert.equal(score.importSuccess.denominator, 10);
  assert.equal(score.importSuccess.numerator, 7);
  assert.equal(score.importSuccess.pass, false);
  assert.equal(score.metricTrust.denominator, 7);
  assert.equal(score.overall, "FAIL");
});

import { analyzeFileBatch } from "../dist/batch.js";

test("split-period batch merges multiple exports without double-counting overlap", () => {
  const a = new TextEncoder().encode([
    "occurred_at,transaction_id,store,product,quantity,net_amount,customer_id",
    "2026-09-18T08:00:00Z,O-1,Q1,Latte,1,50000,C-1",
    "2026-09-19T08:00:00Z,O-2,Q1,Latte,1,50000,C-1",
    "2026-09-20T08:00:00Z,O-3,Q1,Latte,1,50000,C-2"
  ].join("\n"));
  const b = new TextEncoder().encode([
    "occurred_at,transaction_id,store,product,quantity,net_amount,customer_id",
    "2026-09-20T08:00:00Z,O-3,Q1,Latte,1,50000,C-2",
    "2026-09-21T08:00:00Z,O-4,Q1,Latte,1,50000,C-2"
  ].join("\n"));
  const result = analyzeFileBatch([{ filename: "part-a.csv", data: a }, { filename: "part-b.csv", data: b }]);
  assert.equal(result.batch.fileCount, 2);
  assert.equal(result.batch.sourceValidRows, 5);
  assert.equal(result.batch.overlapRows, 1);
  assert.equal(result.batch.uniqueRows, 4);
  assert.equal(result.metrics.orders, 4);
  assert.equal(result.metrics.netSales, 200000);
  assert.equal(result.metrics.identifiedCustomers, 2);
});

test("batch supports independently mapped vendor-style files", async () => {
  const kiot = new Uint8Array(await readFile(new URL("../fixtures/vendor/kiotviet-style.csv", import.meta.url)));
  const cuk = new Uint8Array(await readFile(new URL("../fixtures/vendor/cukcuk-style.csv", import.meta.url)));
  const result = analyzeFileBatch([{ filename: "kiot.csv", data: kiot }, { filename: "cuk.csv", data: cuk }], "mixed-validation");
  assert.equal(result.batch.fileCount, 2);
  assert.equal(result.metrics.orders, 6);
  assert.equal(result.metrics.netSales, 400000);
});

import { buildInboundValidationRecord, buildInboundValidationDraft, finalizeInboundValidationDraft, summarizeAcquisitionFunnel, acquisitionBreakdown } from "../dist/acquisition.js";

test("inbound validation record derives target ICP from 3-15 stores without PII fields", () => {
  const record = buildInboundValidationRecord({
    id: "V-1",
    source: "kiotviet",
    storeCount: 7,
    importAttempted: true,
    importSucceeded: true,
    reconciliationAttempted: true,
    metricTrusted: true,
    insightReviewed: true,
    usefulNewInsight: true,
    repeatUseAsked: true,
    repeatUseIntent: true,
    continuousSyncAsked: true,
    continuousSyncIntent: false,
    valueDemonstrated: true,
    wtpAsked: true,
    willingnessToPay: true,
    wtpBand: "1m-2m",
    acquisitionSource: "google",
    acquisitionMedium: "organic",
    acquisitionCampaign: "free-analyzer",
    privacyMode: "pseudonymized"
  });
  assert.equal(record.targetIcp, true);
  assert.equal(record.storeBucket, "6-10");
  assert.equal(record.wtpBand, "1m-2m");
  assert.equal(Object.hasOwn(record, "email"), false);
  assert.equal(Object.hasOwn(record, "phone"), false);
});

test("inbound validation record excludes 1-2 and 16+ store operators from target ICP", () => {
  const base = {
    id: "x", source: "test", importAttempted: true, importSucceeded: true,
    reconciliationAttempted: true, metricTrusted: true, insightReviewed: true,
    usefulNewInsight: true, repeatUseAsked: true, repeatUseIntent: true,
    continuousSyncAsked: true, continuousSyncIntent: true, valueDemonstrated: true,
    wtpAsked: true, willingnessToPay: true
  };
  assert.equal(buildInboundValidationRecord({ ...base, storeCount: 2 }).targetIcp, false);
  assert.equal(buildInboundValidationRecord({ ...base, storeCount: 3 }).targetIcp, true);
  assert.equal(buildInboundValidationRecord({ ...base, storeCount: 15 }).targetIcp, true);
  assert.equal(buildInboundValidationRecord({ ...base, storeCount: 16 }).targetIcp, false);
});

test("acquisition funnel deduplicates repeated events by anonymous session", () => {
  const events = [
    { id: "1", at: "2026-09-20T00:00:00Z", event: "landing_view", anonymousSessionId: "A", source: "google", medium: "organic" },
    { id: "2", at: "2026-09-20T00:00:01Z", event: "landing_view", anonymousSessionId: "A", source: "google", medium: "organic" },
    { id: "3", at: "2026-09-20T00:00:02Z", event: "analyzer_opened", anonymousSessionId: "A", source: "google", medium: "organic" },
    { id: "4", at: "2026-09-20T00:00:03Z", event: "upload_started", anonymousSessionId: "A", source: "google", medium: "organic" },
    { id: "5", at: "2026-09-20T00:00:04Z", event: "report_completed", anonymousSessionId: "A", source: "google", medium: "organic" },
    { id: "6", at: "2026-09-20T00:00:05Z", event: "landing_view", anonymousSessionId: "B", source: "direct", medium: "none" }
  ];
  const summary = summarizeAcquisitionFunnel(events);
  assert.equal(summary.uniqueSessions, 2);
  assert.equal(summary.landingViews, 2);
  assert.equal(summary.analyzerOpened, 1);
  assert.equal(summary.uploadToReport, 1);
  assert.equal(summary.landingToAnalyzer, 0.5);
  assert.deepEqual(acquisitionBreakdown(events), {
    "direct / none / none": 1,
    "google / organic / none": 1
  });
});

import { Readable } from "node:stream";
import { PUBLIC_MAX_BYTES, readRawBody } from "../api/_shared.mjs";
import analyzeApi from "../api/analyze.mjs";
import healthApi from "../api/health.mjs";

function mockReq({ method = "GET", url = "/", body = Buffer.alloc(0), headers = {} } = {}) {
  const req = Readable.from(body.length ? [body] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost", ...headers };
  return req;
}

function mockRes() {
  const headers = {};
  let resolve;
  const finished = new Promise(r => { resolve = r; });
  return {
    statusCode: 200,
    body: Buffer.alloc(0),
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    getHeader(name) { return headers[String(name).toLowerCase()]; },
    end(value = "") { this.body = Buffer.from(value); resolve(); },
    async done() { await finished; return this; }
  };
}

test("public deployment raw-body gate stays safely below Vercel 4.5MB function payload cap", async () => {
  assert.equal(PUBLIC_MAX_BYTES, 4 * 1024 * 1024);
  const ok = await readRawBody(mockReq({ method: "POST", body: Buffer.alloc(1024) }));
  assert.equal(ok.byteLength, 1024);
  await assert.rejects(
    readRawBody(mockReq({ method: "POST", body: Buffer.alloc(1), headers: { "content-length": String(PUBLIC_MAX_BYTES + 1) } })),
    /up to 4MB/
  );
});

test("Vercel-shape health endpoint declares transient no-persistence mode", async () => {
  const res = mockRes();
  await healthApi(mockReq({ method: "GET", url: "/api/health" }), res);
  await res.done();
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body.toString("utf8"));
  assert.equal(body.persistence, "none");
  assert.equal(body.maxUploadBytes, PUBLIC_MAX_BYTES);
});

test("Vercel-shape analyze endpoint reproduces known fixture metrics", async () => {
  const bytes = await readFile(new URL("../fixtures/known-anomaly.csv", import.meta.url));
  const req = mockReq({ method: "POST", url: "/api/analyze?filename=known-anomaly.csv", body: bytes });
  const res = mockRes();
  await analyzeApi(req, res);
  await res.done();
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body.toString("utf8"));
  assert.equal(body.metrics.orders, 97);
  assert.equal(body.metrics.netSales, 4850000);
  assert.equal(body.itemCount, 97);
  assert.equal(body.insights.some(x => x.store === "Q7"), true);
});

test("public pages disclose 4MB transient processing instead of local-only promise", async () => {
  const landing = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const analyzer = await readFile(new URL("../public/analyzer.html", import.meta.url), "utf8");
  assert.match(landing, /không lưu file vào database\/object storage/i);
  assert.match(landing, /4 MB\/file/i);
  assert.match(analyzer, /tối đa 4MB/i);
  assert.doesNotMatch(analyzer, /tối đa 20MB/i);
});


test("field-session draft keeps unanswered evidence nullable and cannot silently count as negative evidence", () => {
  const draft = buildInboundValidationDraft({ id: "D-1", source: "kiotviet", storeCount: 7, importSucceeded: true, acquisitionSource: "organic", privacyMode: "local-only" });
  assert.equal(draft.status, "DRAFT_NOT_SCOREABLE");  assert.equal(draft.targetIcp, true);
  assert.equal(draft.importSucceeded, true);
  assert.equal(draft.metricTrusted, null);
  assert.equal(draft.usefulNewInsight, null);
  assert.equal(draft.willingnessToPay, null);
  assert.equal(Object.hasOwn(draft, "email"), false);
  assert.equal(Object.hasOwn(draft, "phone"), false);
});


test("field-session finalization enforces evidence ordering and produces canonical scorecard record", () => {
  const draft = buildInboundValidationDraft({ id: "D-2", source: "cukcuk", storeCount: 5, importSucceeded: true, privacyMode: "local-only" });
  assert.throws(() => finalizeInboundValidationDraft(draft, {
    reconciliationAttempted: false, metricTrusted: true, insightReviewed: true, usefulNewInsight: true,
    repeatUseAsked: true, repeatUseIntent: true, continuousSyncAsked: true, continuousSyncIntent: true,
    valueDemonstrated: true, wtpAsked: true, willingnessToPay: true, wtpBand: "1m-2m"
  }), /metricTrusted requires/);
  const record = finalizeInboundValidationDraft(draft, {
    reconciliationAttempted: true, metricTrusted: true, insightReviewed: true, usefulNewInsight: true,
    repeatUseAsked: true, repeatUseIntent: true, continuousSyncAsked: true, continuousSyncIntent: false,
    valueDemonstrated: true, wtpAsked: true, willingnessToPay: true, wtpBand: "1m-2m"
  });
  assert.equal(record.targetIcp, true);
  assert.equal(record.metricTrusted, true);
  assert.equal(record.continuousSyncIntent, false);
  assert.equal(record.willingnessToPay, true);
});

import { assertCanonicalValidationRecord, emptyValidationRegistry, upsertValidationRecord } from "../dist/validation-registry.js";

const canonicalFieldRecord = {
  id: "field-001",
  source: "kiotviet",
  targetIcp: true,
  importAttempted: true,
  importSucceeded: true,
  reconciliationAttempted: true,
  metricTrusted: true,
  insightReviewed: true,
  usefulNewInsight: true,
  repeatUseAsked: true,
  repeatUseIntent: true,
  continuousSyncAsked: true,
  continuousSyncIntent: true,
  valueDemonstrated: true,
  wtpAsked: true,
  willingnessToPay: true
};

test("validation registry accepts canonical PII-free records and deduplicates by session id", () => {
  assert.doesNotThrow(() => assertCanonicalValidationRecord(canonicalFieldRecord));
  const one = upsertValidationRecord(emptyValidationRegistry(), canonicalFieldRecord);
  const replacement = { ...canonicalFieldRecord, willingnessToPay: false };
  const two = upsertValidationRecord(one, replacement);
  assert.equal(two.records.length, 1);
  assert.equal(two.records[0].willingnessToPay, false);
});

test("validation registry rejects PII/local fields before aggregation", () => {
  assert.throws(() => assertCanonicalValidationRecord({ ...canonicalFieldRecord, email: "owner@example.com" }), /forbidden PII/);
  assert.throws(() => assertCanonicalValidationRecord({ ...canonicalFieldRecord, meta: { phone: "0000000000" } }), /forbidden PII/);
});

test("Windows field kit launcher has explicit task-owned server cleanup", async () => {
  const ps = await readFile(new URL("../field-kit/windows/start-cafeos.ps1", import.meta.url), "utf8");
  assert.match(ps, /finally\s*\{/);
  assert.match(ps, /Stop-Process -Id \$Process\.Id/);
  assert.match(ps, /127\.0\.0\.1:4173/);
});

test("packaged field kit can run without npm dependency installation", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.packages[""].dependencies, undefined);
  assert.equal(lock.packages[""].devDependencies, undefined);
});

test("Windows field finalizer records only evidence answers and updates the PII-free registry", async () => {
  const ps = await readFile(new URL("../field-kit/windows/finalize-field-session.ps1", import.meta.url), "utf8");
  assert.match(ps, /field-registry\.mjs'\) add/);
  assert.match(ps, /willingnessToPay/);
  assert.doesNotMatch(ps, /Read-Host ['\"](?:Name|Email|Phone|Merchant name)/i);
});

test("local health endpoint identifies CafeOS so launcher cannot accept an unrelated port occupant", async () => {
  const source = await readFile(new URL("../scripts/serve.mjs", import.meta.url), "utf8");
  assert.match(source, /service: "cafeos-analyzer"/);
  const launcher = await readFile(new URL("../field-kit/windows/start-cafeos.ps1", import.meta.url), "utf8");
  assert.match(launcher, /Health\.service -eq 'cafeos-analyzer'/);
});

test("field-kit builder packages the committed runtime without node_modules", async () => {
  const source = await readFile(new URL("../scripts/build-field-kit.mjs", import.meta.url), "utf8");
  assert.match(source, /\['dist','scripts','web','field-kit'\]/);
  assert.doesNotMatch(source, /node_modules/);
  assert.match(source, /No npm install required/);
});

test("field-session workflow emits a local operator report but does not mark it shareable", async () => {
  const source = await readFile(new URL("../scripts/field-session.mjs", import.meta.url), "utf8");
  assert.match(source, /operator-report\.local\.html/);
  assert.match(source, /may contain store names\/business metrics/);
  assert.match(source, /Shareable by default:\\n- compatibility-profile\.shareable\.json\\n\\nKeep local\/private:\\n- analysis\.local\.json[\s\S]*operator-report\.local\.html/);
});

test("inbound pull pages stay aligned to the existing-POS analysis wedge", async () => {
  const kiot = await readFile(new URL("../public/phan-tich-file-kiotviet-cafe.html", import.meta.url), "utf8");
  const sapo = await readFile(new URL("../public/phan-tich-file-sapo-fnb.html", import.meta.url), "utf8");
  const generic = await readFile(new URL("../public/phan-tich-doanh-thu-quan-cafe-excel.html", import.meta.url), "utf8");
  assert.match(kiot, /không cần đổi POS/i);
  assert.match(kiot, /chưa claim tương thích với mọi biến thể Excel/i);
  assert.match(sapo, /20\.000 dòng/);
  assert.match(sapo, /chưa claim general-purpose Sapo FnB API connector/i);
  assert.match(generic, /3–15 cửa hàng/);
  for (const page of [kiot,sapo,generic]) assert.match(page, /utm_source=seo/);
});

test("Vercel routing exposes only the three locked Wave 13 pull surfaces", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const sources = new Set(config.rewrites.map(x => x.source));
  assert.equal(sources.has('/phan-tich-file-kiotviet-cafe'), true);
  assert.equal(sources.has('/phan-tich-file-sapo-fnb'), true);
  assert.equal(sources.has('/phan-tich-doanh-thu-quan-cafe-excel'), true);
});

test("Vercel deploy launcher uses committed-dist gate and never requires npm test", async () => {
  const ps = await readFile(new URL("../scripts/deploy-vercel.ps1", import.meta.url), "utf8");
  assert.match(ps, /npm run test:dist/);
  assert.doesNotMatch(ps, /(^|\s)npm test(\s|$)/m);
});
