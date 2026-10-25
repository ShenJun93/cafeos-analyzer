# CafeOS Core Commerce — staging migration differential / preview acceptance

Date: 2026-10-25 (Asia/Ho_Chi_Minh)
Scope: read-only Supabase/GitHub/Vercel audit. **Not a release authorization.**

## Candidate and exact-head evidence

- PR #74: `feat/cafeos-core-commerce-v1`, draft/unmerged.
- Verified prior functional fix commit `956fe85acbee3554fb55796612b93ebbd9bf3a9f`: "unfinished checkout" guards protect in-memory pending idempotency intent and unpaid-order state from Store/Tenant refresh. Its GitHub CI run `40187595201` and Supabase DB run `40187595157` both completed **SUCCESS**.
- Regression test in `tests/core-commerce-ui.test.mjs` uses a VM-driven app controller with fake DOM to exercise blocked tenant/store changes. This is **not** a rendered-browser test.
- Vercel Preview from earlier commit `b007724a2bcc0cfd2f7274c4d1ef6447aa1b0f08` was READY at deployment `dpl_CuU2H9hZ57CEThsnNoiQQkETW1vj`. That preview predates the guard fix; do not use it as evidence of the latest UI. Deployment uses SSO protection.
- There are generic Vercel PREVIEW `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` environment variable entries. No values were fetched or copied to the report. Browser-authenticated synthetic E2E and 390px/1200px rendered QA remain **NOT_RUN**.
- Live staging SQL pgTAP previously **26/26 PASS** inside a ROLLBACK transaction. No synthetic fixture tenants remained afterwards. This exercises PostgreSQL privileges and order/payment/close, not remote authenticated HTTP/browser E2E.

## Critical migration history mismatch

Comparison used repository Git tree (8 migration filenames) and the live `supabase_migrations.schema_migrations` table (7 rows) on staging project `wjatnyvdygvblirggdcm`.

**Zero timestamp intersections.** A naive `supabase db push` risks treating already-applied schema as new work. Do **not** automatically rename only Core Commerce or run bulk migration repair.

| Git migration version | Staging version(s) | Content comparison |
| --- | --- | --- |
| `20260921005530` analyzer_core | No matching staging history | Schema exists, applied history not proven |
| `20260921005532` control_tower_core | No matching staging history | Schema exists, applied history not proven |
| `20260921164500` daily_brief_correctness | `20260921100732` | Canonical text **exact match** |
| `20260921100900` daily_brief_aggregate | `20260921103432` | One trailing character difference; common prefix identical, semantics not independently diffed |
| `20260921170000` action_owner_offboarding | `20260921105352` | Canonical text **exact match** |
| `20260921201000` store_health_read_model | `20260921133428` | Canonical text **exact match** |
| `20260921203000` action_measurement_loop | `20260921141814`, `20260921151006` | Last staging entry exact match; two staging entries have identical length and MD5 |
| `20261025094352` core_commerce_v1 | `20261025103648` | Canonical text **exact match** (29,843 chars) |

The older staging state was likely built with applied SQL and later migration receipts not sharing the Git file timestamps; this is an inference, not a proven migration procedure.

## Recovery decision: NO AUTOMATIC MIGRATION REPAIR

1. Obtain a `supabase migration list --linked` against **staging only** using an owner-authorized CLI session, after independent comparison of both missing foundation migrations to the actual schema and permissions.
2. Determine which historical migration records represent distinct applied effects and why Action Measurement was recorded twice.
3. Produce an explicit reversible migration-history reconciliation plan with before/after timestamp inventory. Official Supabase documentation says `migration repair` changes tracking history only, not SQL/schema.
4. Independently verify the repaired migration list, with zero new schema SQL executed, and a blank-database migration replay; preserve the pre-change history receipt.
5. Do not touch production, do not run `db push` on staging before the reconciliation is approved and verified.

Official guidance: https://supabase.com/docs/guides/deployment/database-migrations

## Security and product acceptance remains pending

- Live staging Commerce tables have RLS enabled; privileges for the three intentional authenticated SECURITY DEFINER RPCs must receive independent security review, even though anon execution is denied and each function checks auth/role. Supabase Advisor still emits 3 warnings; leaked-password protection disabled.
- Rendered browser QA at mobile 390px and desktop 1200px; cashier controls; loaded cart; errors and focus behavior; authenticated synthetic API/UI end-to-end; tenant isolation on HTTP transport; and recovery of unpaid orders across full reload remain unverified.
- Client-side memory-only pending order protects in-session refresh/context switching but not tab crashes or explicit signout. Do not advertise crash-safe checkout.
- **PR #74 DRAFT · PRODUCTION MERGE/DB/RELEASE HOLD.**

## 2026-10-25 continuation: payment-result reconciliation / tenant RLS

- `api/app/workflow.mjs` dispatches `commerce-order-status` to `server/commerce/order-status.mjs` (GET-only, Supabase user + tenant membership check, tenant-scoped PostgREST SELECT and underlying RLS). This is not a privileged RPC, nor a new Vercel API function.
- Browser controller queries that endpoint after an ambiguous payment response. A verified `paid` response clears the checkout; a non-paid/unverified result preserves the order for manual inspection or retry. A paid idempotent order replay also ends checkout rather than sticking on a completed order.
- `scripts/serve-vercel-preview.mjs` now joins workflow query parameters with `&`, fixing previously malformed local GET routes. CI includes local HTTP GET unauthenticated regression and mocked paid/open network-outcome tests.
- Live staging (project `wjatnyvdygvblirggdcm`) SQL pgTAP **28/28 PASS** in one rollback transaction, with two new assertions that Tenant B owner cannot see Tenant A POS orders or payment records. Added to canonical test source commit `3760419`. Post-run fixture check: **0 test tenants, 0 POS orders, 0 payments, 0 closes**.
- Foundation catalog survey (read-only): `tenants`, `tenant_members`, `imports`, `transaction_line_items`, `stores`, `customers`, `customer_identifiers`, `attention_items`, `actions`, `action_status_history`, `measurement_windows` all exist with RLS enabled. Their full SQL/permissions and missing staging migration history records are **not** yet proved equivalent.
- Security Advisor rerun still reports 3 authenticated SECURITY DEFINER warnings and leaked-password protection disabled. Independent waiver/security review remains **OPEN**. The drift and release hold remain unchanged.

## Continuation: tenant-aware POS operations after reload

- Latest Core Commerce app candidate now uses the authenticated tenant membership role for UI affordances: cashier order/payment available; manager-only Menu writes and Daily Close controls are hidden or disabled. Backend and SQL RPC permissions remain authoritative.
- `GET /api/app/commerce-open-orders?storeId=<UUID>`: newly added read-only server handler, scoped by `tenant_id`, `store_id`, `status=eq.open`, descending creation date, limit 20, and Commerce write-role requirement. Uses authenticated PostgREST read under existing RLS, not the service role. No new Vercel API function or migration.
- UI recovery button lists server-persisted open POS orders; selecting one re-reads the server order status and total before enabling payment. An unsent cart is intentionally ephemeral; if present, resume requests explicit confirmation before clearing it. Existing payment RPC serializes and prevents a second charge of a paid order.
- Unit/HTTP tests cover permitted cashier and rejected viewer, tenant/store query filters, malformed responses, role-scoped controls, and reopened order guard. **Real authenticated UI/API E2E and rendered browser QA remain NOT_RUN.**
- The staging pgTAP count remains **28/28 PASS** from the rollback-only audit and is not a substitute for remote HTTP/browser E2E.
- Ledger drift (8 Git versions vs 7 staging with zero matches) is unchanged; do not run `db push` or bulk `migration repair` until independently reconciled.

## Read-only foundation object existence audit

Both missing-from-ledger Git foundation migrations were parsed for named DDL objects:
`20260921005530_analyzer_core.sql` and `20260921005532_control_tower_core.sql`.

Live catalog survey on staging (2026-10-25) matched the expected **object names**:

| Object type | Present / declared |
| --- | --- |
| Baseline tables | **11 / 11** |
| RLS policies | **17 / 17** |
| Indexes | **14 / 14** |
| SQL functions | **3 / 3** |
| Triggers | **1 / 1** |

An additional catalog check found RLS enabled on all 11 baseline tables. This reduces the risk that the missing history entries represent completely absent schema, but object names alone cannot prove DDL text, privilege, trigger-body, index-predicate or rollback equivalence. No migration-history records were mutated.

**Release decision unchanged: staging history drift remains BLOCKED, bulk repair/db push prohibited without a full owner-approved reconciliation.**

## Real HTTP integration contract — synthetic upstream

`tests/core-commerce-http-flow.test.mjs` runs `createVercelShapePreviewServer` over a real loopback HTTP port, exercising the Vercel-shaped routing and JSON bodies from API entry through handlers to a deterministic **in-memory fake Supabase fetch endpoint**.

Synthetic flow checks: a read-only menu, manager-only creation, cashier order creation with server-owned price, idempotent retry, open-order list, reject close while open, exact payment and reject duplicate, server order status, first-party commerce dashboard, manager close, and an intentionally separate imported Control Tower brief. It also asserts missing JWT, cross-tenant ID, cashier menu write, cashier close and viewer open-orders denial.

GitHub CI runs `40191235831` and `40191231740` completed **PASS** at commit `c08e663`. **This does not access real Supabase Auth/PostgREST or Vercel preview protection, and must never be labeled 'authenticated live HTTP E2E'.** The last direct staging SQL pgTAP result remains **28/28 PASS**, rollback-only.

## Open-order backlog pagination and SQL privilege regression

- `GET /api/app/commerce-open-orders?storeId=...&offset=...` is bounded to 20 returned rows, fetches 21 to signal a following page, uses `created_at.desc,id.desc` ordering, and accepts only decimal offsets 0–10000.
- UI supports `Xem thêm đơn cũ`. It guards against concurrent duplicate loading and discards stale responses after Tenant/Store change. This is not a durable resumption of an unsubmitted shopping cart.
- HTTP synthetic flow now checks a nonzero offset and API tests cover page boundaries and invalid offset values. Real staging HTTP JWT acceptance and rendered QA are still NOT_RUN.
- Read-only live privilege survey: all 6 Commerce tables RLS ON; `anon` no table SELECT/INSERT; `authenticated` can SELECT, can INSERT to `menu_categories`/`menu_items` subject to manager RLS, and has **no direct INSERT/UPDATE on `pos_orders`, `pos_order_items`, `pos_payments`, `daily_closes`**.
- Nine SQL privilege cases were added to `supabase/tests/database/core_commerce_v1.test.sql`; live staging pgTAP now **37/37 PASS, 0 FAIL**, in one rolled-back transaction. Synthetic tenant/order/payment/close counts remained 0 afterwards. New test source commit `32f0b8d`.
- Advisor still reports 3 intentional authenticated-executable SECURITY DEFINER RPC warnings plus leaked-password protection disabled. Do not infer complete security sign-off or repair migration history from the test count.

## New candidate-only incremental future-date close guard

A read/write-in-transaction synthetic probe on **2026-10-25** showed that `public.commerce_close_day` accepts **2026-11-01** as a closed date. The probe returned the same future business date; transaction `ROLLBACK` left **zero** test tenant/close records. This is a release-blocking business invariant violation: the create-order RPC checks that a day is not closed and could then refuse all future orders for that date.

A new **unapplied** migration has been committed:
`supabase/migrations/20261025130000_core_commerce_future_close_guard.sql`, text-equivalent to `db/contracts/core_commerce_future_close_guard.sql`. It preserves the current SECURITY DEFINER role checks/grants but prevents close when `v_business_date > (clock_timestamp() at time zone v_timezone)::date`. New pgTAP case asserts SQLSTATE 22023 and `COMMERCE_CLOSE_FUTURE_DATE` for synthetic future close (plan 38).

**Ledger inventory changed:** the original comparison was 8 Git migration filenames versus 7 staging records; it is now **9 Git candidate filenames versus the same 7 staging entries**. The new one is never to be counted as applied on staging merely because a GitHub scratch-DB test passes. No ledger change or DDL was run on staging in this batch.

See `docs/research/2026-10-25-core-commerce-future-close-release-gate.md` before releasing.
