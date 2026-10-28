// Import-key provenance guard: preserve existing persisted keys; reject only
// ambiguous reserved characters before deriving a line-item hash.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  keyCanonicalItems, fingerprintImport, planImport, InMemoryImportLedger
} from "../dist/imports.js";

const record = (overrides = {}) => ({
  transactionId: "ORD-1",
  occurredAt: "2026-10-28T02:00:00.000Z",
  store: "Store A",
  product: "Latte",
  quantity: 1,
  netAmount: 50000,
  sourceNamespace: "vendor-one",
  ...overrides
});
const knownHash = "f0075c7bb4e9b6674d17ee7868547a7bd8a74a6fcbe0fa5bbfaf7869834f67d1";
const secondHash = "c428bdf19bf2c5f5833a1cda582f8809469739c653e1ee47b6893792b65afcfe";

test("known legacy record-key hashes remain byte-identical for ordinary data", () => {
  const keyed = keyCanonicalItems([record(), record()]);
  assert.deepEqual(keyed.map(x => x.sourceRecordKey), [knownHash, secondHash]);
  assert.notEqual(keyed[0].sourceRecordKey, keyed[1].sourceRecordKey);
  assert.equal(fingerprintImport("tenant-a", "vendor-one", keyed.slice(0, 1)),
    "2c6bb60c76f6cffd0c95354a77f868ec9058ae0da77f97a9316a7feaee642280");
});

test("legacy delimiter collision witnesses are rejected before record-key hashing", () => {
  const a = record({ store: "Store\u001fA", product: "Latte" });
  const b = record({ store: "Store", product: "A\u001fLatte" });
  const legacy = x => [
    x.transactionId, x.occurredAt, x.store, x.product,
    String(x.quantity), String(x.netAmount), x.customerKey ?? ""
  ].join("\u001f");
  assert.equal(legacy(a), legacy(b), "these distinct source rows used to alias");
  assert.throws(() => keyCanonicalItems([a]), /Unsafe import record identity/);
  assert.throws(() => keyCanonicalItems([b]), /Unsafe import record identity/);
});

test("every legacy hash component refuses reserved U+001F without leaking raw fields", () => {
  const bad = [
    { transactionId: "O\u001f1" },
    { occurredAt: "2026-10-28T02:00:00.000Z\u001f" },
    { store: "A\u001fB" },
    { product: "Latte\u001f" },
    { customerKey: "001\u001f222" }
  ];
  for (const change of bad) {
    assert.throws(() => keyCanonicalItems([record(change)]),
      err => err instanceof Error
        && err.message === "Unsafe import record identity: reserved separator in source field");
  }
  // Pipe and ordinary line breaks are not the legacy U+001F separator.
  assert.equal(keyCanonicalItems([record({ product: "Tea|Coffee\nMilk" })]).length, 1);
});

test("a mixed valid and unsafe import does not mutate in-memory ledger state", () => {
  const ledger = new InMemoryImportLedger();
  assert.throws(() => ledger.ingest("tenant-a", "vendor-one",
    [record(), record({ product: "B\u001fC" })]),
    /Unsafe import record identity/);
  assert.equal(ledger.size("tenant-a", "vendor-one"), 0);
  assert.equal(ledger.ingest("tenant-a", "vendor-one", [record()]).newItems.length, 1);
  assert.equal(ledger.ingest("tenant-a", "vendor-one", [record()]).alreadyKnown, 1);
});

test("tenant and source namespace reject control characters, null and ambiguous scope", () => {
  const ledger = new InMemoryImportLedger();
  for (const namespace of ["vendor\none", "vendor\rone", "vendor\u001fone",
    "vendor\u0000one", "vendor\u007fone", " vendor-one ", "", " "]) {
    assert.throws(() => planImport("tenant-a", namespace, [record()]), /Unsafe import source namespace/);
    assert.throws(() => ledger.ingest("tenant-a", namespace, [record()]), /Unsafe import source namespace/);
    assert.throws(() => ledger.size("tenant-a", namespace), /Unsafe import source namespace/);
    assert.throws(() => fingerprintImport("tenant-a", namespace, []), /Unsafe import source namespace/);
  }
  for (const tenant of ["tenant\na", "tenant\u001fa", "", " tenant-a"]) {
    assert.throws(() => planImport(tenant, "vendor-one", [record()]), /Unsafe import tenant/);
  }
});

test("same source line in different explicit namespaces remains independent", () => {
  const ledger = new InMemoryImportLedger();
  const item = record();
  assert.equal(ledger.ingest("tenant-a", "vendor-one", [item]).newItems.length, 1);
  assert.equal(ledger.ingest("tenant-a", "vendor-two", [item]).newItems.length, 1);
  assert.equal(ledger.ingest("tenant-b", "vendor-one", [item]).newItems.length, 1);
  assert.equal(ledger.size("tenant-a", "vendor-one"), 1);
  assert.equal(ledger.size("tenant-a", "vendor-two"), 1);
  assert.equal(ledger.size("tenant-b", "vendor-one"), 1);
  assert.equal(ledger.ingest("tenant-a", "vendor-one", [item]).alreadyKnown, 1);
  // An arbitrary label alone does not prove that the upstream accounts were distinct.
});

test("fingerprint preserves original source-order independence without a new version", () => {
  const items = [record({ product: "A" }), record({ product: "B" })];
  const keyed = keyCanonicalItems(items);
  const reversed = keyCanonicalItems([...items].reverse());
  assert.equal(fingerprintImport("tenant-a", "vendor-one", keyed),
    fingerprintImport("tenant-a", "vendor-one", reversed));
  assert.notEqual(fingerprintImport("tenant-a", "vendor-one", keyed),
    fingerprintImport("tenant-a", "vendor-two", keyed));
  const expected = createHash("sha256")
    .update(["tenant-a", "vendor-one",
      ...keyed.map(x => x.sourceRecordKey).sort()].join("\n")).digest("hex");
  assert.equal(fingerprintImport("tenant-a", "vendor-one", keyed), expected);
});

test("import planning does not silently claim POS/external correspondence", () => {
  const plan = planImport("tenant-a", "vendor-one", [record()]);
  assert.equal(plan.keyedItems.length, 1);
  assert.equal(plan.newItems.length, 1);
  assert.equal(plan.alreadyKnown, 0);
  assert.equal(Object.hasOwn(plan, "linkedPosOrders"), false);
  assert.equal(Object.hasOwn(plan, "crossSourceDeduplication"), false);
  assert.equal(Object.hasOwn(plan, "combinedSales"), false);
});
