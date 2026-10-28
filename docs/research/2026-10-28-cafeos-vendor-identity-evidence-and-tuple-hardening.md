# CafeOS Phase 1.1 — Vendor identity evidence register and source-key hardening

**Date:** 2026-10-28  
**Scope:** read-only research + deterministic Analyzer guard, not merchant integration acceptance.  
**Parent:** DRAFT PR #80, stacked #79 → #78 → #77 → #76 → #75 → #74.  
**Release:** NO-GO. No cross-source matching, financial union, POS offline claim, migration, staging or production operation.

## Why this batch exists

The existing Analyzer synthetic vendor-style CSV fixtures test **header mapping** and metrics, not vendor-issued immutable order identifiers or cross-connector mapping. The source-specific identity contract in PR #79 and negative fixtures in PR #80 explicitly prohibit upgrading a matching display code into a verified transaction link.

Two independent concerns must be distinguished:

1. **Local Analyzer identity encoding:** given a trusted pair `(source_namespace, transaction_id)`, the internal in-memory key must encode that pair unambiguously. Previously `sourceScopedOrderIdentity` used an unescaped U+001F delimiter. When fields themselves contained U+001F, two distinct tuples could collapse into one Map/Set key. The duplicate-line health signature also joined fields with `|` without escaping. Both are now serialized as JSON arrays, preserving tuple boundaries without introducing a new dependency. This is a local correctness fix, **not** proof that the upstream `transaction_id` is reliable.
2. **Upstream identity authority:** official field documentation can establish which fields exist and what the vendor calls them. It does not, by itself, prove immutable ID lifecycle, uniqueness scope across merchant accounts, refund/void semantics, CSV export equivalence or links to first-party CafeOS POS orders.

## Official documentation (public, no access credentials)

| Source family | Documented fields / behavior | Exactly what is proven | What remains unverified |
| --- | --- | --- | --- |
| KiotViet **Retail Public API** | Invoice `id`, `code`, `branchId`, `purchaseDate`; invoice lookup by ID or code | These are documented for the **Retail** invoice API | F&B equivalence, CSV column mapping to immutable ID, account-scope uniqueness, lifecycle stability, relations to CafeOS POS |
| CUKCUK OpenPlatform Orders paging | `CompanyCode` request header; response `Id` GUID, `No` display number, `BranchId`, `Status`, `Date` | Example contains **distinct Id values** for repeated `No: "1.2"`; a `No`-only link is demonstrably unsafe | Stable `Id` across changes/cancellations, account/source-scope guarantees, identity crosswalk to CafeOS |
| POS365 OrderSave API metadata | `Id`, `Code`, `BranchId`, `RetailerId`, date and status-like fields | These fields appear in public `OrderSave` metadata | GET/export schema, stable immutable ID, retailer uniqueness, mutation/version semantics, CafeOS crosswalk |
| Sapo FnB exported invoices | Overview and detailed Excel exports; provider notes an upper limit of **20,000 rows** per export | Export can be partial if underlying data exceeds limit; detail format includes item lines | Guaranteed stable backend invoice identifier in export, exact completeness proof, crosswalk to CafeOS |

References (official):
- KiotViet Retail API: https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ket-noi-api/public-api/
- CUKCUK OpenPlatform: https://graphapi.cukcuk.vn/document/api/orders_paging.html
- POS365 OrderSave metadata: https://api.pos365.vn/api/json/metadata?op=OrderSave
- Sapo FnB export help: https://help.sapo.vn/xuat-danh-sach-hoa-don-tren-trang-quan-tri-sapo-fnb

**Evidence classification:** `FIELD_DOCUMENTED` is not `IDENTITY_LIFECYCLE_VERIFIED`, `COMPLETE_COVERAGE_VERIFIED` or `CROSS_POS_LINK_VERIFIED`.

The machine-readable registry at `fixtures/commerce-identity/vendor-identity-evidence-v1.json` records the source family, candidate field, account/branch scope and explicitly unverified gates. It contains public documentation facts and no merchant/account data. Test names describe negative guarantees, not positive vendor identity certification.

## Existing vendor-style fixture caveat

- `fixtures/vendor/kiotviet-style.csv`: synthetic `InvoiceCode` column. Does not establish KiotViet Retail API `id` or F&B invoice identity.
- `fixtures/vendor/cukcuk-style.csv`: synthetic `No` column. Official CUKCUK example shows `No` can repeat; do **not** use it for immutable global matching.
- `fixtures/vendor/pos365-style.csv`: synthetic `OrderCode` column. Does not establish `OrderSave.Id` nor live CSV export equivalence.
- Sapo FnB is not yet represented by a source-certified export fixture.

The files are compatibility inputs, not production vendor specifications. Do not mark fields verified simply because `analyzeCsv` returns deterministic metrics.

## Fix and verification scope

- Change `sourceScopedOrderIdentity(item)` from an unescaped concatenation to `JSON.stringify([namespace, transactionId])`.
- Change Analyzer duplicate-line health signature to JSON array with source-scoped identity, product, quantity and amount; this avoids pipe ambiguity.
- Add regression tests for two different `(namespace, transactionId)` tuples that previously produced the same string, and for ID/product `|` collisions.
- Preserve ordinary source-scoped order counts and read-only POS/import separation.
- Update committed `dist` and source fingerprint; require clean `npm run build`, `git diff --exit-code -- dist`, full `test:dist` and unchanged package boundary.
- No new import mapping, write operations, network integration, trusted financial total or authorization policy.

## Unresolved before any vendor-specific identity mapping

1. Obtain **permissioned, redacted** real exports and/or API responses for the chosen provider, Store and source account; never send secrets or raw customer data to the repository.
2. Prove the provider's canonical ID stability under edits, voids, refunds, re-exports, pagination and multi-branch views, using controlled non-merchant/synthetic accounts where possible.
3. Record the true source account ID and the namespace lifecycle contract; avoid reusing `manual-upload` for multiple independent upstream accounts.
4. Prove bounded export and API completeness by independent count/pagination. Sapo's documented export cap and PR #78's 501-row lookahead remain independent coverage risks.
5. Define independently reviewed crosswalk evidence and a financial authority reconciliation contract. A verified ID alone still does not authorize combined sales.

**Do not promote any of the four vendors to `stableIdentityAcrossLifecycleVerified=true` based on public field documentation alone.**

## Hard holds

All stacked PRs remain DRAFT / RELEASE NO-GO. Staging signed-JWT E2E, migration ledger, independent full backup/restore, off-host age recovery and security review remain unverified. Local/Synthetic CI is not a staging acceptance substitute. No POS offline claim.
