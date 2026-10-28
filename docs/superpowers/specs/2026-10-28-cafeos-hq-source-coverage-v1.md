# CafeOS Phase 1.1 — HQ source coverage v1

Status: local-development candidate, stacked on DRAFT PR #76, which is stacked on DRAFT PRs #75 and #74. **No staging writes, no schema migration, no release.**

## Operating job

An owner of a 3–15 Store café group needs to know, for **one explicitly selected business date**, which Stores have first-party CafeOS POS paid-order evidence and which have external/imported transaction evidence. An imported stream may duplicate first-party POS orders. **Presence from two sources is not a proof of overlap or of no overlap.**

## Read-only, deterministic contract

`GET /api/app/commerce-hq-sources?businessDate=YYYY-MM-DD`

- Server requires caller's authenticated Tenant and manager role (owner/admin/manager). Never accepts tenant id, Store list, prices, totals, or source classification from browser.
- Enumerates active Stores under caller JWT/RLS, ordered and bounded to 25 with one-row lookahead. If Store count is 26 or untrusted, fails the entire report.
- Reuses the exact existing `commerce_daily_dashboard` and `store_health_aggregate` RPCs for every Store, with caller JWT, at the SAME explicit business date. Maximum three parallel Stores, six concurrent RPCs.
- Reuses the same financial and import read-model validation as single Store view. Verifies each Store's Tenant, ID, date, active flag and name before publishing any result. A failed RPC or validation in one Store means **no partial report**.
- Reports the mutually exclusive states:
  - `both_present_overlap_unresolved`: POS paid orders + imported transactions present; possible overlap, not an inferred duplicate.
  - `pos_only_observed`: POS paid orders present, import not observed for requested date.
  - `imports_only_observed`: imported transactions present, POS paid orders not observed.
  - `neither_observed`: neither source has transaction evidence on requested date; NOT proof that no sales occurred.
- Reports **Store counts only** for these categories. Per-Store POS sales and imported net sales are displayed separately and **never summed**. The only `combinedSales` field is always `null` with `deduplication: not_performed`.
- Missing imported data is `null`, not a numeric zero. POS zero is a server-confirmed numeric zero.

## UI, security and acceptance

HQ Overview has a separate “Kiểm tra độ phủ nguồn” operation tied to the HQ business date. Old results are invalidated after Tenant/Store/session/date changes and on first-party HQ refresh. Each Store shows one evidence category, first-party paid sales and imported net sales without a fabricated combined total. Manager-only control and render; cashier must not see HQ. Synthetic Chromium tests exercise the button and display at 390px/1200px. API and UI tests cover forged tenant/Store/date, invalid amounts, missing import evidence, directory truncation, all-or-nothing reporting.

No new SQL migration, no Vercel function source, no new server-held secrets, no POS order mutation. Independent real staging signed-JWT and full backup/restore remain release gates. This is **coverage diagnostics**, not namespace-level source identity reconciliation or a merged transaction ledger. A future source namespace / external transaction ID mapping and overlap policy must be separately designed and verified.

No claim of offline-capable POS: this product remains in development, not usable without its backend.
