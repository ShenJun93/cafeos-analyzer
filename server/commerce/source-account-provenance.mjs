// Phase 1.1 local policy evaluator for candidate account-binding claims.
// No caller-supplied field, even "verified", can authorize a cross-source match.
// NOT connected to an HTTP route, persistence, RLS query or financial calculation.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_EVIDENCE = 100;
const EVENTS = new Set(["proposed", "rejected", "revoked"]);
const EVIDENCE = new Set(["manual_label", "operator_document", "connector_claim"]);

function timestamp(value) {
  if (typeof value !== "string" || !UTC.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
}

function scopedLabel(value, max = 128) {
  return typeof value === "string" && value.length > 0
    && value.length <= max && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function response(status, reviewedCount = 0) {
  return Object.freeze({
    status,
    scope: "tenant_store_namespace",
    evidenceAuthority: "unverified_claims_only",
    reviewedCount,
    crossSourceLinkAllowed: false,
    combinedSalesAllowed: false,
    transactionIdsExposed: false
  });
}

function validRecord(record) {
  if (!record || Array.isArray(record) || typeof record !== "object") return false;
  if (!UUID.test(record.bindingId) || !UUID.test(record.tenantId)
    || !UUID.test(record.storeId)
    || !scopedLabel(record.sourceNamespace)
    || !scopedLabel(record.providerFamily)
    || !scopedLabel(record.sourceAccountRef, 256)
    || !(record.sourceBranchRef === null || scopedLabel(record.sourceBranchRef, 256))
    || !scopedLabel(record.evidenceRef, 256)
    || !EVENTS.has(record.lifecycle)
    || !EVIDENCE.has(record.evidenceKind)
    || !Number.isSafeInteger(record.revision) || record.revision < 1
    || timestamp(record.recordedAt) === null
    || timestamp(record.effectiveFrom) === null
    || !(record.effectiveUntil === null
      || timestamp(record.effectiveUntil) !== null)) return false;
  if (record.effectiveUntil !== null
    && timestamp(record.effectiveUntil) <= timestamp(record.effectiveFrom)) return false;
  return true;
}

/**
 * Deterministic offline inspection of server-supplied, unverified claims.
 *
 * asOf is the knowledge cutoff. Records captured after it cannot validate
 * historical coverage. effectiveFrom/Until describe a declared binding
 * window and are also unverified until an independently authorized connector
 * or audit review exists. Do not feed arbitrary browser claims into this module
 * and then promote the result to trust.
 *
 * The response NEVER contains account IDs, branch IDs, refs or claim contents,
 * and NEVER returns "verified". A later authorized read-model would need
 * explicit JWT/RLS, provider-account proof and finance authority gates.
 */
export function inspectNamespaceAccountClaims({
  tenantId, storeId, sourceNamespace, asOf, records
} = {}) {
  if (!UUID.test(tenantId ?? "") || !UUID.test(storeId ?? "")
    || !scopedLabel(sourceNamespace) || timestamp(asOf) === null) {
    return response("invalid_scope");
  }
  if (!Array.isArray(records) || records.length > MAX_EVIDENCE) {
    return response("evidence_limit");
  }
  if (!records.length) return response("unknown");

  const seenVersions = new Set();
  for (const record of records) {
    if (!validRecord(record)) return response("invalid_evidence");
    if (record.tenantId !== tenantId || record.storeId !== storeId
      || record.sourceNamespace !== sourceNamespace) {
      return response("scope_conflict");
    }
    const revision = JSON.stringify([record.bindingId, record.revision]);
    if (seenVersions.has(revision)) return response("revision_conflict");
    seenVersions.add(revision);
  }

  const at = timestamp(asOf);
  const observed = records.filter(record => timestamp(record.recordedAt) <= at);
  if (!observed.length) return response("not_recorded");
  const identities = new Set(observed.map(record => JSON.stringify([
    record.providerFamily, record.sourceAccountRef, record.sourceBranchRef
  ])));
  if (identities.size !== 1) return response("namespace_conflict", observed.length);

  const inEffect = observed.filter(record => timestamp(record.effectiveFrom) <= at);
  // Revocation/rejection is sticky: never reactivate by adding a later claim
  // unless a separately reviewed future contract explicitly allows it.
  if (inEffect.some(record => record.lifecycle === "revoked")) {
    return response("revoked", observed.length);
  }
  if (inEffect.some(record => record.lifecycle === "rejected")) {
    return response("rejected", observed.length);
  }
  if (inEffect.some(record => record.lifecycle === "proposed"
      && (record.effectiveUntil === null || timestamp(record.effectiveUntil) > at))) {
    return response("review_required", observed.length);
  }
  if (inEffect.some(record => record.lifecycle === "proposed")) {
    return response("expired", observed.length);
  }
  return response("not_effective", observed.length);
}
