import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectNamespaceAccountClaims } from "../server/commerce/source-account-provenance.mjs";

const F = JSON.parse(await readFile(
  new URL("../fixtures/commerce-identity/source-account-provenance-review-v1.json", import.meta.url),
  "utf8"
));
const { context, claims } = F;
const inspect = (records, overrides = {}) =>
  inspectNamespaceAccountClaims({ ...context, records, ...overrides });
const assertBoundary = out => {
  assert.equal(out.evidenceAuthority, "unverified_claims_only");
  assert.equal(out.crossSourceLinkAllowed, false);
  assert.equal(out.combinedSalesAllowed, false);
  assert.equal(out.transactionIdsExposed, false);
  for (const secret of [
    claims.base.sourceAccountRef, claims.base.sourceBranchRef, claims.base.evidenceRef,
    claims.otherAccount.sourceAccountRef, context.tenantId, context.storeId
  ]) {
    assert.equal(JSON.stringify(out).includes(secret), false);
  }
};

test("synthetic provenance fixtures have explicit scope, no credentials or real merchant data", () => {
  assert.equal(F.syntheticOnly, true);
  assert.equal(F.schema, "cafeos-source-account-provenance-review-fixtures-v1");
  const source = JSON.stringify(F);
  assert.doesNotMatch(source, /customer_phone|customer_email|service_role|access_token|password/i);
  assert.notEqual(claims.base.sourceAccountRef, claims.otherAccount.sourceAccountRef);
});

test("no source account record remains unknown; no false zero-data or matching claim", () => {
  const out = inspect([]);
  assert.equal(out.status, "unknown");
  assert.equal(out.reviewedCount, 0);
  assertBoundary(out);
});

test("one apparently complete claim can only request review, never confirm identity", () => {
  const out = inspect([claims.base]);
  assert.equal(out.status, "review_required");
  assert.equal(out.reviewedCount, 1);
  assertBoundary(out);
});

test("forged verified, trusted or combined sales flags cannot upgrade a claim", () => {
  const out = inspect([{ ...claims.base,
    verified: true, authority: "signed_connector", crossSourceLinkAllowed: true,
    linkedPosOrderId: "51000000-0000-4000-8000-000000000099",
    combinedSales: "999999999"
  }]);
  assert.equal(out.status, "review_required");
  assertBoundary(out);
  assert.equal(Object.hasOwn(out, "linkedPosOrderId"), false);
});

test("reused source namespace for two merchant accounts is a conflict regardless of order", () => {
  for (const records of [
    [claims.base, claims.otherAccount],
    [claims.otherAccount, claims.base],
    [claims.base, { ...claims.otherAccount,
      effectiveUntil: "2026-10-02T00:00:00.000Z" }]
  ]) {
    const out = inspect(records);
    assert.equal(out.status, "namespace_conflict");
    assertBoundary(out);
  }
});

test("foreign Tenant, Store or namespace claims are rejected before interpretation", () => {
  for (const diff of [
    { tenantId: "20000000-0000-4000-8000-000000000002" },
    { storeId: "11000000-0000-4000-8000-000000000002" },
    { sourceNamespace: "synthetic:tenant-source-b" }
  ]) {
    const out = inspect([claims.base, { ...claims.base, ...diff, revision: 2 }]);
    assert.equal(out.status, "scope_conflict");
    assertBoundary(out);
  }
});

test("revocation is sticky even if someone later submits another proposed claim", () => {
  const again = { ...claims.base, revision: 3,
    evidenceRef: "synthetic-reproposal-3",
    recordedAt: "2026-10-28T10:00:00.000Z",
    effectiveFrom: "2026-10-28T10:00:00.000Z" };
  for (const records of [[claims.base, claims.revoked], [again, claims.revoked, claims.base]]) {
    const out = inspect(records);
    assert.equal(out.status, "revoked");
    assertBoundary(out);
  }
  assert.equal(inspect([claims.base, claims.revoked], {
    asOf: "2026-10-28T08:30:00.000Z"
  }).status, "review_required");
});

test("rejected source claim does not become linkable with a same-account proposal", () => {
  const rejected = { ...claims.base, revision: 2, lifecycle: "rejected",
    evidenceRef: "synthetic-rejection",
    recordedAt: "2026-10-28T10:00:00.000Z",
    effectiveFrom: "2026-10-28T10:00:00.000Z" };
  assert.equal(inspect([claims.base, rejected]).status, "rejected");
  assertBoundary(inspect([rejected]));
});

test("effective intervals use UTC boundaries and cannot silently revive expired claims", () => {
  const old = { ...claims.base,
    effectiveFrom: "2026-10-01T00:00:00.000Z",
    effectiveUntil: "2026-10-28T10:00:00.000Z" };
  assert.equal(inspect([old], { asOf: "2026-10-28T09:59:59.999Z" }).status,
    "review_required");
  assert.equal(inspect([old], { asOf: "2026-10-28T10:00:00.000Z" }).status,
    "expired");
  const futureEffective = { ...claims.base,
    effectiveFrom: "2026-11-01T00:00:00.000Z" };
  assert.equal(inspect([futureEffective]).status, "not_effective");
  assertBoundary(inspect([futureEffective]));
});

test("evidence recorded after the cutoff cannot retroactively validate history", () => {
  const futureRecord = { ...claims.base, revision: 2,
    recordedAt: "2026-11-01T00:00:00.000Z" };
  assert.equal(inspect([futureRecord]).status, "not_recorded");
  assert.equal(inspect([claims.base, futureRecord]).status, "review_required");
  assertBoundary(inspect([futureRecord]));
});

test("replayed binding version and contradictory revision fail closed", () => {
  assert.equal(inspect([claims.base, { ...claims.base }]).status, "revision_conflict");
  assert.equal(inspect([claims.base, { ...claims.base,
    evidenceRef: "different-claim-reusing-version"
  }]).status, "revision_conflict");
});

test("consistent revisions keep review-only status without elevating authority", () => {
  const second = { ...claims.base, revision: 2,
    evidenceKind: "connector_claim", evidenceRef: "synthetic-connector-ref",
    recordedAt: "2026-10-28T11:00:00.000Z" };
  const out = inspect([second, claims.base]);
  assert.equal(out.status, "review_required");
  assert.equal(out.reviewedCount, 2);
  assertBoundary(out);
});

test("bad UTC, invalid scope and mismatched empty inputs fail closed", () => {
  for (const asOf of [
    "2026-02-30T00:00:00.000Z", "2026-10-28", "2026-10-28T12:00:00+07:00",
    "2026-10-28T12:00:00Z", null
  ]) {
    assert.equal(inspect([claims.base], { asOf }).status, "invalid_scope");
  }
  for (const sourceNamespace of ["", "bad\nnamespace", " namespace", "\u001f"]) {
    assert.equal(inspect([claims.base], { sourceNamespace }).status, "invalid_scope");
  }
  assert.equal(inspect([], { tenantId: "not-uuid" }).status, "invalid_scope");
  assert.equal(inspect(null).status, "evidence_limit");
});

test("malformed evidence is rejected, including invalid intervals and fake lifecycle", () => {
  const invalid = [
    { ...claims.base, effectiveFrom: "2026-02-30T00:00:00.000Z" },
    { ...claims.base, effectiveUntil: "2026-10-01T00:00:00.000Z" },
    { ...claims.base, sourceAccountRef: "" },
    { ...claims.base, sourceAccountRef: "bad\naccount" },
    { ...claims.base, sourceNamespace: "synthetic:other" },
    { ...claims.base, evidenceKind: "verified" },
    { ...claims.base, lifecycle: "verified" },
    { ...claims.base, revision: 0 },
    { ...claims.base, recordedAt: "2026-10-28T12:00:00+00:00" }
  ];
  for (const row of invalid) {
    const out = inspect([row]);
    assert.ok(["invalid_evidence", "scope_conflict"].includes(out.status),
      JSON.stringify(row));
    assertBoundary(out);
  }
});

test("bounded record cap refuses untrusted provenance floods without leaking identifiers", () => {
  const many = Array.from({ length: 101 }, (_, i) => ({
    ...claims.base, revision: i + 1
  }));
  const out = inspect(many);
  assert.equal(out.status, "evidence_limit");
  assertBoundary(out);
});

test("input events are never mutated and output contains classification only", () => {
  const event = structuredClone(claims.base);
  const original = JSON.stringify(event);
  const out = inspect([event]);
  assert.equal(JSON.stringify(event), original);
  assert.deepEqual(Object.keys(out).sort(), [
    "combinedSalesAllowed", "crossSourceLinkAllowed", "evidenceAuthority",
    "reviewedCount", "scope", "status", "transactionIdsExposed"
  ].sort());
  assert.equal(Object.isFrozen(out), true);
});
