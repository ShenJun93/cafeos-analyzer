# CafeOS Phase 1.1 / Read-only source bridge v1

**Status:** development candidate stacked on draft PR #75, which is stacked on draft PR #74. No staging or production writes, no schema migration, no release approval.

## Merchant job

For one authenticated Tenant, Store and explicit business date, an owner or operator must understand **what CafeOS POS knows** and **what the imported/integrated data read model knows**, without double-counting transactions or implying that imported records are already reconciled to CafeOS-native receipts.

## Source-of-record contract

`GET /api/app/commerce-source-bridge?storeId=<UUID>&businessDate=YYYY-MM-DD`

The authenticated session belongs to the same Tenant as both upstream reads:

1. `commerce_daily_dashboard`: first-party paid POS orders, sales total, open orders, AOV and Daily Close status. Provenance `cafeos_pos`.
2. `store_health_aggregate`: imported `transaction_line_items`, aggregated net sales/orders/AOV, baseline status and Store-specific last observed transaction time. Provenance `imported_line_items`.

The contract refuses invalid Tenant/Store/date, repeated query keys, nonsensical source metrics and inconsistent revenue/payment assertions. It never creates imported rows, runs arbitrary SQL, calls a write RPC or inserts a synthetic transaction. No service-role key in app.

**Source boundary** is always `separate_not_deduplicated`. No `totalSales`, `unifiedSales`, comparison delta, inferred shared identity or claim of cross-source deduplication is published. Source coverage is explicit: when imported current data are absent, imported net sales/orders/AOV are unknown (`null`), not fabricated zeros. A real CafeOS-native zero-order date remains a valid zero from its own RPC.

## UI evidence

Within the existing authenticated Control Tower workspace, a Store-scoped, explicit-date button fetches the source bridge. POS and imports appear as separately labeled cards. Date/Store/Tenant/session changes invalidate any in-flight or stale display. If either RPC or source validation fails, both cards are withheld rather than displaying an apparently complete cross-source result. Responsive synthetic visual tests run at 390px and 1200px.

## What this does NOT do

This is the **first source-visibility handoff**, not the full Phase 1.1 unified canonical read-model. There is no source_namespace breakdown for external imports in this response, no transaction-level deduplication, no shared definition for refunds/discounts, no global multi-Store rollup combining POS and imports, no new inventory/loyalty/staff facts. All must be explicitly specified, implemented and verified separately before treating cross-source numbers as one business truth.

Release gates from PRs #74/#75 (signed JWT staging, real backup/restore, ledger repair, advisor review and independent owner approval) remain open. "Offline development" does not imply offline-capable point of sale.
