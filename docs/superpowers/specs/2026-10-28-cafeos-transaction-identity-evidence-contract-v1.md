# CafeOS Phase 1.1 — Transaction Identity & Evidence-Link Contract v1

**Status:** DESIGN ONLY / NOT IMPLEMENTATION APPROVAL / RELEASE NO-GO.
**Parent:** DRAFT PR #78 at `c05e8ba11be47baed6951be0e6522b996f70781c`; stacked #77 → #76 → #75 → #74 → `main`.
**Authoritative product context:** `MISSION.md` → `docs/PRODUCT_ARCHITECTURE.md` → `docs/ROADMAP.md` → approved Commerce and Source Bridge specs. Do not replace these with chat history.

## Decision and operator job

For a tenant operating CafeOS POS alongside third-party exports, a Manager/HQ must be able to distinguish *observations*, *possible overlaps*, and *proved correspondence* of imported and first-party transactions, without silently double-counting or silently discarding sales.

**Decisions frozen for this design slice:**

1. Imported rows and first-party POS orders remain separate systems of record.
2. A shared transaction string, timestamp, amount, business date, product list, order number, or source namespace alone NEVER proves a cross-source match.
3. Before trusted cross-source mapping evidence exists, the correct disposition is **unlinked/unknown**, not deduplicated.
4. No combined cross-source `netSales`, `orders`, `AOV`, or reconciled Daily Close is authorized by this spec.
5. No new endpoint, table, migration, write path, role grant, browser secret, or production/staging data operation is authorized by this spec. Follow-on implementation requires a separately reviewed spec/PR.

## Verified current source contracts at parent SHA

### First-party CafeOS POS

`public.pos_orders` contains `id` (UUID), `tenant_id`, `store_id`, `client_order_key`, `order_number`, `business_date`, `status`, `total`, plus lifecycle timestamps. It is CafeOS-owned order evidence. The unique `(tenant_id, store_id, client_order_key)` key enforces **idempotent create-order intent**, not equivalence to an external order. `order_number` is a first-party display/business field; its equality to an external string is not proof. `pos_order_items`, `pos_payments` and `daily_closes` provide distinct order/item/settlement/close evidence, not external mappings.

### Analyzer/imported sources

`public.transaction_line_items` has `tenant_id`, nullable promoted `store_id`, `source_namespace`, `transaction_id`, `source_record_key`, `first_import_id`, `occurred_at`, and line-level monetary facts. Uniqueness `(tenant_id, source_namespace, source_record_key)` protects **line-item idempotency** across overlapping imports; it does not establish order equality with CafeOS POS. Multiple line items may repeat `transaction_id`.

`docs/METRICS.md` defines imported orders as distinct `(source_namespace, transaction_id)` pairs. In a Store-scoped view this key is further scoped by Tenant/Store. The absence of a source-specific guarantee means this is an **analytics counting key**, not automatically a globally durable external order ID.

PR #78's `GET /api/app/commerce-import-lineage` reports bounded per-namespace observed line/transaction counts for a Store-local day, not raw IDs or cross-source matches. Its 500-row/501-lookahead result is **bounded observation**, not a proven complete production aggregate. Upstream PostgREST response caps need real authenticated validation.

## Canonical reference types (conceptual; not yet a persisted schema)

- **CafeOS POS order ref:** `(tenant_id, store_id, "cafeos_pos", pos_orders.id)`.
- **Imported transaction observation ref:** `(tenant_id, store_id, source_namespace, transaction_id)`, additionally carrying the raw row lineage `(first_import_id, source_record_key)` for audit. Imported refs are scoped analytics observations; cannot be promoted to globally unique transaction IDs without vendor-specific uniqueness guarantees.
- **Store-local business date:** derived from the Store IANA timezone for reporting. It is not an identity field and must not create or erase a link when an external POS clocks a sale near midnight or during DST.
- **Source namespace:** must be tied to one stable and recorded upstream identity/domain. Reusing a namespace for unrelated merchant accounts or changing its definition without a versioned provenance record is a mapping conflict; do not merge.
- **Amounts:** use exact persisted decimal values. Equality (including zero/negative lines) is only a diagnostic signal; never a link key.

Keep tenant, Store, source kind and source domain explicit in all internal references. Never hash or concatenate ambiguous fields as a "canonical shared transaction ID" without a versioned, collision-safe encoding and explicit source authority.

## Candidate link-evidence record (future reviewed storage only)

A verified cross-system link would require all of these, validated server-side:

| Field | Requirement |
| --- | --- |
| Scope | Exact Tenant + Store, both persisted references accessible under caller JWT/RLS |
| Left reference | Existing CafeOS POS `pos_orders.id` and observed status at validation |
| Right reference | Existing import source namespace + transaction ID with source/account provenance and row lineage |
| Authority | Trustworthy external-to-CafeOS ID relationship (e.g. explicit upstream key mapping), with proof that the upstream system really issued it |
| Provenance | Evidence type, immutable source/connector or independently recorded operator document reference, event/version, capture time, validation time |
| Integrity | Source provenance and idempotency uniqueness verified; source account ownership and mapping scope checked |
| Lifecycle | Proposed → verified/rejected/revoked; who/what verified, conflict and revocation audit trail |
| Privacy | No raw external transaction or customer identifiers in a general-purpose HTTP response or browser storage |

**A caller-provided boolean like `verified:true`, client POST fields, copied text or mere "manager says it is same" is not authoritative proof.** Manual attestation, if ever supported, requires a separate controlled approval/audit design; not part of v1.

Do not assume a universal one-to-one relation. Split orders, refunds, reissues, multi-channel sync and canceled/recreated external records require explicit vendor semantics. Until independently specified, such evidence stays **ambiguous** and cannot be auto-linked.

## Deterministic disposition policy

| Case | Disposition | May suppress/count sales jointly? |
| --- | --- | --- |
| Only POS observation | `pos_only` | No joint metric; report POS separately |
| Only import observation | `import_only` | No joint metric; report import separately |
| Both source families present, no verified correspondence | `overlap_unresolved` | **NO** |
| Identical order numbers or transaction strings across sources | `overlap_unresolved` | **NO** |
| Same timestamp, same amount, same Store and date | `overlap_unresolved` | **NO** |
| Explicit mapping assertion with independently validated authority, no conflicts | `linked_verified` (future only) | **Still NO** until metric authority and reconciliation policy pass separate gates |
| Conflicting one-to-many, wrong Tenant/Store, reused external ID, missing lineage, disputed source | `mapping_conflict` | **NO**; fail closed |
| No rows for date | `no_observation` | **NO**; unknown sales coverage, not zero sales |

**Why `linked_verified` is still not enough for revenue:** POS total and import net sales may differ in tax, discounts, tips, refunds, voids, partial captures and date cutoffs. Verified identity is a necessary but insufficient condition to choose one financial fact as authoritative. Build a distinct, versioned finance authority policy and cross-source metric invariants before any combined KPI.

## Security and persistence conditions for future implementation

- Source observations and link assertions are tenant/Store isolated with RLS and explicit authenticated GRANTs; no elevated service role in a public handler or browser.
- Match proof must be fetched/validated from trusted server-side origin, never inferred in JS from raw row equality or a browser claim.
- Any potential link table requires composite tenant/Store FKs (or independent equivalent DB-enforced scope), constrained lifecycle, uniqueness/conflict policies and immutable review evidence.
- Never export raw identifiers, customer PII, connector secrets, payment references or source evidence documents to HQ lists. Return only privacy-reviewed aggregate/classification results where justified.
- Keep read-model output fail-closed on truncation, RLS-denied upstream, out-of-scope Store/date, malformed evidence, or uncertain source reconciliation.
- Resolve PostgREST maximum-row/counted-response behavior using real authenticated test infrastructure before treating PR #78's bounded observations as complete. Do not "fix" using an unbounded JavaScript fetch.

## Acceptance matrix before a later implementation PR

1. Reimport of the same source lines does not create a new source event; two distinct line items within one imported transaction count as one imported transaction.
2. Identical `transaction_id` in two namespaces is **not** a proved duplicate; matching `order_number` is **not** a proved duplicate.
3. Two different tenants or Stores can reuse identical upstream IDs with no linkage or data disclosure.
4. Timezone boundary, DST 23/25-hour days, missing source timezone, and late import do not accidentally create a cross-source match.
5. Identical amounts/timestamps/products cannot upgrade an unknown link to verified.
6. Missing, conflicting, one-to-many, revoked, and fabricated link evidence all fail closed; no silent fallback to fuzzy matching.
7. POS paid/voided versus imported refund/correction cases cannot produce an authoritative combined metric by default.
8. Store/day coverage gaps, PostgREST row caps and empty results are labeled as *unknown/observed* rather than full completeness or zero sales.
9. Cashier/viewer cannot access Manager mapping diagnostics; unauthorized Tenant/Store selectors fail before business read.
10. Source-only POS and import dashboards remain unchanged. No cross-source combined totals appear in API, browser or HQ export.
11. Any future DB migration must pass local blank-database migration + RLS/pgTAP, independent security review, staging signed-JWT tests, backup/restore/recovery and migration-ledger gates before production data.

## Next implementation sequence (non-authorizing)

**A. Identity semantics:** collect and document concrete export/connector samples with stable vendor source account IDs, external transaction lifecycle and timestamps; add privacy-safe deterministic identity fixtures. Only source facts, no customer data in fixtures.

**B. Verified linking evidence:** separately approve connector-specific cross-ID mapping semantics, conflict resolution and safe storage. Implement *read-only mapping classification* with fail-closed tests first; no revenue join.

**C. Financial authority:** define Store/source/date authority, net-sale calculation, void/refund/return and settlement lifecycles, proof of coverage, numeric reconciliation and audit/reversal strategy. Distinct review/gate.

**D. Release:** tenant/RLS, real authenticated staging, SQL scale/performance, explicit backup/restore, signed-JWT E2E and security-owner signoff. Until then DRAFT/NO-GO.

**Current outcome:** approve this document only as a conservative boundary contract. It makes no claim that CafeOS supports POS offline operation or unified sales yet.
