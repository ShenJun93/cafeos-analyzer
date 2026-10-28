# CafeOS Phase 1.1 — Import record identity safety and source-account provenance gate

**Status:** DRAFT / SECURITY-GATED / NO production migration. **Date:** 2026-10-28.  
**Parent:** PR #82 → #81 → #80 → #79 → #78 → #77 → #76 → #75 → #74.  
**Job:** preserve idempotent import behavior while preventing ambiguous source row keys and keeping vendor-account identity explicitly unknown until independently verified.

## Verified baseline

- `src/imports.ts` uses `sourceRecordKey` = SHA-256 of ordered canonical line fields joined by U+001F plus occurrence index. `fingerprintImport` uses Tenant/namespace plus sorted line hashes; `InMemoryImportLedger` tracks hashes per Tenant/namespace. The SQL uniqueness `(tenant_id, source_namespace, source_record_key)` makes import keys persisted identifiers.
- `src/analyze.ts` defaults to `manual-upload` source namespace. `src/batch.ts` defaults to `manual-export-batch`; both labels are **caller-provided/derived**, not external merchant-account verification.
- PR #81 hardened `sourceScopedOrderIdentity` counting with JSON tuple encoding; that fix did not affect `src/imports.ts` persisted line hash derivation.
- PR #82 labels source-account provenance as `not_verified` and requires complete RLS-filtered PostgREST page evidence. This does not prove merchant source/account identity or complete vendor exports.

## Collision and migration constraint

The legacy serialization of fields used for persisted line keys is ambiguous if any source identity field contains literal U+001F. For example, an imported line with `store="A\u001fB", product="C"` and another with `store="A", product="B\u001fC"` serialize to the same byte sequence when all other fields match.

**Do not replace legacy line-key serialization with JSON without a complete migration protocol.** Changing all existing fingerprints or `sourceRecordKey` values would cause previously imported rows to be re-ingested and can corrupt deduplication/accounting lineage.

### Bounded hardening in this PR

1. Preserve exact old SHA-256 keys and occurrence ordering for ordinary source fields.
2. Refuse literal U+001F in *any* field consumed by legacy `baseIdentity` before deriving a key. This is an explicit error, not silent normalization or replacement.
3. Refuse empty, whitespace-surrounded or control-character-bearing Tenant and namespace scope strings for import planning/fingerprint use; preserve normal existing strings unchanged.
4. Make the **in-memory** tenant/namespace Map key an unambiguous JSON tuple. This internal cache key is not a persisted identifier and does not change source hashes.
5. Prevent partially written in-memory batches: key validation happens before `planImport` commits accepted keys into `InMemoryImportLedger`. No database write in this PR.
6. Test known legacy hash witnesses (`sourceRecordKey` and import fingerprint) and repeated identical lines; confirm unchanged.
7. Do not infer cross-source matching, upstream account scope, completeness or unified financial totals from accepted hashes.

## Provenance contract for a future separately authorized read-model

A valid source-account binding would require, server-side and per Tenant:

| Required evidence | Current state | Before any identity mapping |
| --- | --- | --- |
| Provider/API product family and version | Synthetic vendor fixture / public docs only | Confirm with upstream authoritative schema |
| Merchant source-account identifier and uniqueness domain | `not_verified` | Verify account ownership and scoped identity, store only privacy-safe reference or keyed digest |
| Source namespace lifetime and reuse policy | Unverified caller label | Immutable versioned binding or explicit conflict / retirement |
| Branch/Store mapping, timezone and business-day interpretation | Store mapping exists for some imported rows | Verify mapping under Tenant and seller account |
| External transaction id lifecycle across edits, voids, refunds, re-exports | Unverified | Test with controlled, permissioned source evidence |
| File/API coverage and pagination | Local exact PostgREST page only | Independently validate upstream export count, pagination and backfills |
| First-party POS to import crosswalk | **Not present** | Require independently reviewed trusted mapping, conflict/revocation record |
| Financial source of truth | Separate POS/import views | Require independent tax/refund/tip/settlement/close reconciliation |

A namespace is a scoping label, not an authenticated claim about a source system. Reusing a namespace for another merchant account or changing its meaning must be treated as **ambiguous** until a versioned provenance binding exists. A user-provided `verified=true` is never proof. This PR does **not** introduce a binding table or trust external account IDs.

## Regression/acceptance and remaining blockers

- Ordinary imports keep the same known-answer SHA-256 keys; reimport is idempotent.
- Distinct raw rows that could alias using U+001F are rejected before hash creation.
- A failed batch leaves the in-memory ledger unchanged.
- Source scope controls reject control characters, including U+001F and CR/LF, with no secret/raw record logged.
- Explicit, distinct Tenant/namespace scopes remain separate; no false claim that distinct namespace strings imply distinct upstream accounts.
- Full build + clean committed `dist` + tests and synthetic/Windows acceptance must be verified at the exact new HEAD.
- Existing authenticated staging PostgREST completeness, signed-JWT E2E, migration ledger, backup/restore, independent off-host `age` recovery, security review, source-identity crosswalk and finance authority remain **RELEASE NO-GO**.

**No SQL migration, vendor integration, production/staging read or write, merge, deploy, source backfill or offline POS claim is authorized.**
