# CafeOS Phase 1.1 — Imported Source Namespace Evidence v1

**Status:** DRAFT development candidate stacked on PR #77, which is stacked on DRAFT #76 → #75 → #74. No production/staging mutation and no migration.

## Job

Manager must see which **external transaction source namespaces** are represented in a chosen Store and its local business date. The current Store Source Bridge and HQ Coverage compare source presence but do not reveal whether the import aggregate consists of one or multiple POS/external namespaces. This slice provides the groundwork for future identity mapping, without pretending that any import transaction has been matched to CafeOS-native orders.

## Existing source of record

- `public.transaction_line_items` (Analyzer): `tenant_id`, `store_id`, `source_namespace`, `transaction_id`, `occurred_at`. Its uniqueness `(tenant_id, source_namespace, source_record_key)` identifies import **line items**; `transaction_id` repeats across line items within a transaction.
- `public.pos_orders` (CafeOS first-party): `id`, `order_number`, `client_order_key`, `business_date`, `status`; these are not inherently the same identities as `transaction_id` in external namespaces.
- `source_namespace` + `transaction_id` is used **only within the same Tenant and Store** for counting source-scoped imported transactions; neither a cross-namespace nor cross-POS duplicate rule is derived. No matching HMAC, customer phone/email, or transaction ID is returned.

## Read-only contract

`GET /api/app/commerce-import-lineage?storeId=UUID&businessDate=YYYY-MM-DD`

- Authenticated Manager/Owner/Admin role required before any Store or transaction reads.
- JWT+RLS-scoped Store lookup must match Tenant and Store UUID, be active, and supply a valid timezone.
- Exact local calendar day boundaries are converted to UTC with `Intl.DateTimeFormat`; tested for Asia/Ho_Chi_Minh and 23-hour / 25-hour DST transition days. Query uses a bounded, UTC-filtered `transaction_line_items` read at max 501 rows.
- 501 rows => fail with `IMPORT_LINEAGE_LIMIT` rather than showing incomplete counts. 500 or fewer are validated for Tenant/Store, row UUID, local business day, source namespace, transaction id and duplicate row ID, before aggregation.
- Response lists `sourceNamespace`, `lineItemCount` and `sourceScopedTransactionCount`. No raw transaction identifiers, line-item amounts, customer fields, or POS-derived sum appear.
- `sourceBoundary.comparedToPos=false`, `deduplication=not_performed`, `combinedSales=null`, `transactionIdsExposed=false`. Empty result means no **observed** imported rows, not evidence of zero business activity.
- 500-row cap is a deliberate safety constraint on this early diagnostic, **not a scalable production aggregate**. High-volume stores need a tested RLS-safe SQL aggregate in a separately authorized migration.

## UI and acceptance

Within the authenticated Control Tower Store Source Bridge, only Manager+ sees **Kiểm tra namespace**. Requires same Store/business date, clears stale results on Tenant, Store, date or session changes. Displays counts as text, never raw external transaction ids; no secret in client.

Synthetic API/Node tests cover authorization, invalid query, Tenant/Store spoofing, 501-row truncation, repeated row, cross-namespace reused IDs, and DST date boundaries. Chromium visual QA tests 390px and 1200px Manager output and hidden Cashier control. No new Vercel function source, no SQL migration, no write endpoint.

## Hard hold

Staging remains on historical migration receipts; release gates include independent full backup/restore, correctly reconciled migration ledger, signed JWT staging tests and security review. PRs remain **DRAFT / RELEASE NO-GO**. This is read-only development, NOT online production readiness and NOT offline-capable POS.
