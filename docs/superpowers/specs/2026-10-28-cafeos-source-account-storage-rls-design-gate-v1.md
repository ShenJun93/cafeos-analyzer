# CafeOS Phase 1.1 — Source Account Binding Storage & RLS Design Gate v1

**Decision:** DESIGN CANDIDATE ONLY. No approved DDL, no migration, no GRANT, no endpoint, no authorization bypass, no staging/production data operation.  
**Parent:** DRAFT PR #84 at `214068658b466d6ff3ad9d1becbfb4b63f2d033c`; canonical product authority `MISSION.md` / `docs/PRODUCT_ARCHITECTURE.md` / `docs/ROADMAP.md` / approved Commerce specs.  
**Scope:** provenance that binds an import source namespace to an authenticated upstream merchant account, preserving audit events and all conflict/revocation evidence. It is **not** a transaction crosswalk or revenue reconciliation.

## Observed repository state (verified)

- `transaction_line_items` is tenant-scoped with uniqueness `(tenant_id, source_namespace, source_record_key)`. The namespace labels source records but currently is not a provider-authenticated account binding.
- The first-party `pos_orders` Store FK is composite: `(tenant_id, store_id) → stores(tenant_id, id)`. Store membership, RLS and Manager-role checks are required before reading commerce diagnostics.
- Source-account claim review in `server/commerce/source-account-provenance.mjs` is **pure, offline and intentionally untrusted**; a forged `verified=true` never elevates authority. The Phase 1.1 exact-count namespace endpoint validates the RLS-filtered page only; it does not prove that all upstream vendor rows were exported.
- No source-account binding table, attestation signer, connector owner verification or trusted transaction crosswalk is established by these candidate PRs.

## Proposed persisted boundary (not DDL authorization)

Keep raw provenance and event history in a **non-exposed private schema**. Do not put raw provider account IDs, customer identifiers, API keys, HMAC secrets, payment references, or evidence blobs in the browser's HTTP response.

### Proposed private records

| Logical object | Fields and invariants | Security intent |
| --- | --- | --- |
| `source_account_bindings` | `id` UUID, `tenant_id` UUID, `store_id` UUID, `source_namespace` bounded immutable string, `provider_family` bounded controlled enum/ref, `account_key_digest` keyed HMAC plus `digest_key_version`, `branch_key_digest` nullable, created timestamps, stable binding version | Composite FK `(tenant_id,store_id)` to authorized Store; unique immutable namespace binding **per Tenant and Store**. No raw merchant ID. Changing an upstream account means a conflict or new namespace version, **never** silent overwrite. |
| `source_account_binding_events` | `tenant_id`, `store_id`, binding UUID, positive revision, event state (`proposed`/`rejected`/`revoked`; future reviewed proof type separately), trusted server-observed `recorded_at`, declared half-open `effective_from`/`effective_until`, evidence pointer/digest, actor/connector identity reference and explicit reason code | Append-only event log; composite FK back to same Tenant/Store/binding; unique binding/revision and ordered event time. Never accept arbitrary client-supplied verified flags or audit timestamps as authoritative. |
| `source_identity_attestations` (future, **not approved**) | Verified connector instance ID, source-account ownership proof reference, method/version, signer/key ID, verification and expiry instant, revocation linkage | Requires independent security review of attestation signature, replay resistance, key rotation and ownership. **No trusted attestation exists in this batch.** |

**Provider mapping risk:** `source_namespace` and external `transaction_id` may be reused across merchant accounts, API families, branches, and import files. They are not global identifiers. A purported account digest must be server-derived from independently verified upstream account evidence, not from untrusted filename, manual label, raw provider text, client-generated HMAC or a URL query parameter.

**Digest privacy:** A plain unsalted hash of predictable provider account codes can permit enumeration. Any keyed digest needs a server-only secret, version, rotation/reconciliation strategy, known collision behavior and a separate controlled credential store. No secret or actual digest is created by this design.

## Proposed write authority (future review)

1. Public `anon` and generic `authenticated` roles receive **no direct SELECT/INSERT/UPDATE/DELETE** on private provenance tables. Private schema exposure via API must remain disabled. Do not rely on RLS alone for untrusted writes.
2. Authenticated Manager/Owner/Admin may later request **review** through a tightly bounded server handler, but cannot set verified state, grant account ownership, overwrite ledger entries, forge recordedAt, or change another Tenant's Store. Cashier/Viewer/Analyst denied.
3. A specialized trusted server-side connector/attestation worker may append audited events only after verifying account ownership and Store scope. It must not expose a service-role secret to a browser or general-purpose route. Its privilege, secret lifetime, and immutable proof retention require independent threat-model approval.
4. Insert validation must atomically check expected previous revision, unique binding, monotonic server-recorded event times and concurrent conflicting assignments. The application must not infer that consecutive revisions imply complete history without a verified event-count/ledger query.
5. Once revoked or conflicted, no future unreviewed proposal may silently reactivate a binding. **Multiple binding IDs under one Tenant/Store/namespace are a binding conflict even if claimed account metadata matches; the future DB must enforce one namespace ownership domain or an explicitly reviewed rotation chain.** Reassignment to another upstream merchant account or reused namespace must be rejected or quarantined with an audit event.
6. Deletion/retention exceptions (e.g. authorized tenant offboarding) need their own audited destructive workflow, backup implications and data minimization rules. Do not claim permanent append-only retention against privacy or tenant deletion obligations.

## Proposed read authority and RLS verification

- Server-side read model: require signed, unexpired, audience-correct JWT; verify actor membership and Manager+ role; tenant, Store and namespace must be exact-bound query arguments, not client-supplied scope proof.
- Database constraints: composite Tenant/Store foreign keys for binding and events; Tenant-scoped role policies, explicit GRANTs and default-deny. Avoid `SECURITY DEFINER` unless the function has separately audited fixed `search_path`, invoker identity checks, fixed query bounds, anti-SQL-injection arguments and no general table mutation.
- Even if a report returns `review_required` it is NOT certified provenance. Missing/filtered event history, truncated page, repeated revision, historical time contradiction, revoked binding, cross-Tenant references, or account reassignment must fail closed.
- HTTP response may disclose only privacy-reviewed status, bounded aggregate count and constant authority flags. It must not echo raw provider account IDs, branch IDs, connector secrets, proof pointers, buyer/customer data or raw imported transaction IDs.
- Source coverage and **financial reconciliation** are separate gates: do not derive a unified net-sales, POS/import duplicate suppression or day close authority from a binding alone.

### Mandatory executable acceptance BEFORE any migration is authorized

| Scenario | Required future evidence |
| --- | --- |
| Anonymous/cashier/analyst attempts raw private table read/write | Database permissions deny, including PostgREST exposure checks |
| Manager Tenant A attempts Store B / Tenant B rows or foreign binding event | RLS + composite FK deny, exact JWT audit recorded |
| Manager submits `verified:true` or forges actor/time/digest | Server/database deny, no ledger write |
| Concurrent same revision submissions / conflicting account reassignment | Atomic optimistic version check or unique conflict, no two active bindings |
| Missing event revision 1, skipped revision, non-monotonic recorded time | Review status blocks any binding promotion; no partial account assertion |
| Revocation then new unreviewed proposal | Sticky deny; only separate privileged audited recovery policy may reconsider |
| 501+ line observations / upstream row cap / incomplete export | No false completeness; incident not hidden by read-model fallback |
| Authorized tenant offboarding | Tested tenant-graph deletion and audit retention policy without cross-tenant loss |
| Signed-JWT staging with historical migrations | Migration ledger reconciled, RLS checked using real roles, backup/restore+off-host age verified independently |
| Financial crosswalk or revenue release | Separate source of financial truth, refunds/void/tax/settlement invariants and security signoff |

## Concrete slice in this PR

Only the **untrusted local classification policy** is hardened: per binding ID, observed revisions up to the requested `asOf` knowledge cutoff must begin at 1, be consecutive and have strictly increasing UTC `recordedAt`. Outcomes `history_gap` and `chronology_conflict` remain non-authoritative, privacy-safe and cannot authorize cross-source links or combined sales. Synthetic Node regression tests exercise these cases; they do not prove persisted ledger completeness.

**STOP / NO-GO:** This document is a build-ready review checklist, **not** permission to create tables, rotate secrets, connect to a live POS, migrate historical import hashes, merge stacked PRs or deploy CafeOS. Complete security design and external provenance evidence before authorizing that work.
