# CafeOS Phase 1.1 — Source Account Claim Review v1

**Status:** DRAFT research/test-only module. **No trusted cross-source link**, no financial union, no production release.
**Parent:** PR #83 at `b5d800a98576edac78aa75efab7b1c6de8b206ea`, dependent on #82 → #81 → #80 → #79 → #78 → #77 → #76 → #75 → #74.
**Canonical direction:** `MISSION.md` → `docs/ROADMAP.md` → `docs/PRODUCT_ARCHITECTURE.md` → approved Commerce specs and exact Git HEAD/CI.

## Operator job

An HQ Manager needs to distinguish a **namespace label** from a verified upstream merchant account. Two exports labeled alike might originate from unrelated POS accounts; two exports with different names might come from the same upstream account. The label cannot safely authorize import/POS matching, deduplication or financial reconciliation.

This slice supplies a **deterministic, isolated reviewer for unverified source-account claims** with time-bound, versioned evidence metadata. It detects conflicts and revoked/expired claims without treating any self-declared evidence as trusted. It does not ship an API, UI, DB schema, connector, runtime integration, or financial metric.

## Existing evidence (verified at parent)

- `src/analyze.ts` defaults to `manual-upload`, and `src/batch.ts` defaults to `manual-export-batch`: both describe analysis scope, not independently verified source accounts.
- `db/migrations/001_analyzer_core.sql` identifies imported lines using `(tenant_id, source_namespace, source_record_key)`; that is line-level idempotency, **not** vendor order identity or a POS crosswalk.
- PR #81 fixes ambiguous source-scoped *order counting*. PR #82 verifies bounded PostgREST returned-page count, but not upstream export completeness. PR #83 preserves historical import hashes while refusing ambiguous legacy separator fields.
- `fixtures/commerce-identity/vendor-identity-evidence-v1.json` records public API field candidates only, with provider lifecycle identity still unverified.

## Isolated claim shape (synthetic-only, NOT an authorized DB schema)

A single proposed/revoked/rejected event has:

| Attribute | Meaning |
| --- | --- |
| `tenantId`, `storeId`, `sourceNamespace` | Explicit scope; identical across all submitted review claims |
| `bindingId` and integer `revision` | Synthetic binding event lineage; duplicate revision is a conflict |
| `providerFamily` | Claimed upstream product family (not a verified provider ID) |
| `sourceAccountRef`, optional `sourceBranchRef` | Opaque claimed account/branch references; **not proof of ownership** |
| `evidenceRef`, `evidenceKind` | Claimed evidence reference and type: `manual_label`, `operator_document`, `connector_claim` |
| `recordedAt` | Exact UTC timestamp when the claim was recorded (knowledge cutoff) |
| `effectiveFrom`, optional `effectiveUntil` | Claimed binding validity window (UTC; half-open) |
| `lifecycle` | `proposed`, `rejected`, or `revoked` |

**Trust boundary:** Even an object with `verified:true` or `evidenceKind=connector_claim` is caller-supplied data; it cannot authorize a cross-system link. A real future implementation must independently authenticate connectors, prove upstream account ownership and Store mapping under RLS, and record immutable evidence with an approved auditor/reviewer workflow.

## Deterministic result policy

`inspectNamespaceAccountClaims` in `server/commerce/source-account-provenance.mjs` is pure and **not imported by any HTTP route**. Returns only `status`, `reviewedCount` and constant safety flags. Never returns account, branch, tenant, Store, transaction or evidence references, and never returns a status named `verified`.

| Condition | Status |
| --- | --- |
| No submitted claim | `unknown` |
| Correctly formed non-conflicting active proposed claim | `review_required` |
| Claim recorded after chosen knowledge cutoff | `not_recorded` |
| Proposed claim effective only later | `not_effective` |
| Proposed claim expired | `expired` |
| Current or previous effective revocation | `revoked` |
| Effective rejection | `rejected` |
| One namespace mapped to multiple upstream account/branch/family tuples | `namespace_conflict` |
| Any foreign Tenant, Store or namespace record | `scope_conflict` |
| Replayed binding ID/revision | `revision_conflict` |
| Malformed evidence, wrong time syntax, invalid effective interval | `invalid_evidence` |
| Malformed requested Tenant/Store/date/namespace | `invalid_scope` |
| Missing/oversized claim batch (maximum 100) | `evidence_limit` |

Conflict detection considers every recorded claim within the knowledge cutoff, including expired identity assignments: a reused namespace is not cleared merely because an earlier claimed binding expired. Revocations/rejections remain sticky; a later proposal cannot silently reactivate a revoked binding.

Every response is `evidenceAuthority=unverified_claims_only` and has `crossSourceLinkAllowed=false`, `combinedSalesAllowed=false`, `transactionIdsExposed=false`.

## Evidence and security gates before any real read-model

1. Define trusted connector identity and provenance attestations, without leaking provider credentials or raw customer information.
2. Add approved Tenant/Store-scoped persistent binding/events with audited lifecycle and DB-enforced RLS/FKs only in a separate authorized migration PR.
3. Prove provider account ID uniqueness, source namespace version/reuse policy, branch mapping, timezone and invoice ID lifecycle using permissioned, redacted real evidence. Existing synthetic CSV/API-style fixtures do not certify any of this.
4. Resolve conflicting or one-to-many claims with an approved review and revocation workflow. No client flags or fuzzy string/amount/time matching.
5. Validate ingestion completeness independently (vendor export/pagination, Store/day coverage, PostgREST `Content-Range`, tenant RLS). A complete bounded SQL read still does not establish complete vendor exports.
6. Define authority for sales, order counts, tax, discounts, refunds, voids, tips, settlement and day close separately. **Verified identity alone does not authorize summed revenue.**
7. Pass SQL/RLS local tests, signed-JWT authenticated staging, independent full backup/restore and off-host `age` recovery, migration ledger reconciliation and security signoff before any production use.

## Acceptance

- Synthetic fixture and Node tests cover all statuses, Tenant/Store isolation, recorded/effective UTC windows, revision replay, namespace reuse conflicts, revoked/rejected claim stickiness, forged `verified` flags and privacy-safe outputs.
- Full build/committed `dist` and Node CI must be green at the exact PR HEAD.
- This slice has **no route, no DB read/write, no migration and no staging/production operation**. It does not establish an externally verifiable merchant account binding.

**Release state: DRAFT / NO-GO.** No merge, deploy, reconciliation of combined sales, or claim of CafeOS offline POS capability.
