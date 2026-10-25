# Current state

Canonical authority: the repository's `main` branch for released code, approved product specs, PR branch evidence, tests, CI, and actual staging verification. Product-level mission authority is defined by `MISSION.md`. An open PR is not a production release.

## Product mission state

CafeOS is a **full café operating ecosystem**. It supports CafeOS-native Core Commerce/POS and integration with merchants' existing POS systems. Analyzer remains the acquisition/onboarding and external-data module; Control Tower remains the decision layer. The complete ecosystem is a product direction, **not** a claim that every module is shipped.

## Verified Analyzer technical state

- CSV/XLSX ingestion, mapping, deterministic metrics, data health and evidence-backed anomalies.
- overlap-safe/idempotent imports and privacy-safe compatibility tooling.
- live Analyzer at `https://cafeos-analyzer.vercel.app` with verified health, fixture POST and upload-size protection.

## Verified Control Tower database state

The persistent Control Tower foundation is implemented and reproducibly tested:

- tenant / membership / Store / Customer / customer-identifier model;
- imports + transaction-line persistence;
- Attention / Action / action-history / Measurement Window model;
- tenant RLS and bounded write roles;
- composite tenant foreign keys and source lineage;
- explicit IANA timezone semantics;
- source-scoped order identity `(source_namespace, transaction_id)`;
- fixed `public.daily_brief_aggregate(uuid,date)` read function;
- blank-database Supabase migration + pgTAP CI.

Synthetic staging has separately verified RLS, tenant isolation, Daily Brief aggregation and lifecycle/offboarding behavior.

## Verified authenticated Control Tower read path

The staging/synthetic read shell now includes:

- `GET /api/app/session`
- `GET /api/app/stores`
- `GET /api/app/attention`
- `GET /api/app/brief`

The user-facing path uses only:

- Supabase project URL;
- modern publishable key;
- caller user JWT.

No service-role/secret credential is used for user reads.

Issue #19 is closed: authenticated synthetic preview E2E proved unauthenticated 401, Tenant A reads, Tenant B denial and invalid-JWT rejection.

## Verified Daily Brief state

Issues #21, #36 and #38 are closed.

The authoritative Daily Brief path now:

- derives business dates in Store IANA timezone;
- preserves explicit-offset/Z instants and records source timezone assumptions;
- scopes order identity by source namespace;
- computes deterministic net sales / orders / AOV;
- uses the exact same weekday over the previous four weeks;
- exposes baseline dates and readiness status;
- emits no authoritative percentage delta when history/coverage is insufficient;
- executes through caller-RLS Postgres RPC rather than transferring raw transaction history to Vercel;
- returns `deterministicTopMetrics=true` from `GET /api/app/brief`.

Authenticated synthetic preview smoke verified:

- Tenant A `/api/app/brief` -> 200;
- metrics, coverage and `asOfBusinessDate` present;
- Tenant B selection -> 403;
- invalid JWT -> 401.

## Verified production-data lifecycle state

Issues #23, #41, #45 and #47 are closed.

Verified controls include:

- tenant hard-delete cascade with different-tenant preservation;
- membership-first user offboarding;
- stale-but-unexpired JWT loses tenant authorization through RLS immediately;
- supported global sign-out + Auth hard-delete live synthetic acceptance;
- Action evidence is preserved while optional owner assignment is cleared on membership deletion;
- controlled tenant prepare/hard-delete operator workflow;
- default 14-calendar-day grace period and explicit legal-hold/export gates;
- PII-minimized offboarding/deletion receipts;
- isolated synthetic logical dump/reset/restore drill with deterministic and tenant-isolation verification.

These controls do **not** authorize real merchant data by themselves; production environment/tier, backup policy and operational approval must still be explicit before first production tenant.

## Product boundary

Build the first-party Core Commerce operating spine while preserving the cross-system canonical model, source lineage, deterministic metrics, and Control Tower. Avoid an all-at-once POS/ERP clone: inventory, payroll, loyalty, and full accounting are later slices. CafeOS must continue to support existing external POS deployments.

## Still prohibited

- no real merchant data in the current synthetic staging project;
- no browser/client service-role or `sb_secret_` credential;
- no fuzzy customer identity;
- no consequential autonomous campaign execution;
- no destructive production schema change without backup/recovery evidence;
- no production merchant onboarding without explicit production environment and operational approval.

## Current product checkpoint

The technical `CONNECT → UNIFY → UNDERSTAND` path is now materially implemented for the Control Tower thin slice:

- persistent tenant/store graph: implemented;
- authenticated tenant-safe read boundary: implemented;
- deterministic Daily Brief: implemented and live-smoke verified;
- lifecycle/recovery/offboarding controls: implemented and verified.

The product-level discovery gate in issue #11 remains open because real target-ICP workflow evidence is still required.

## Core Commerce candidate checkpoint (2026-10-25)

- PR #74 `feat/cafeos-core-commerce-v1` is **draft/unmerged**. First-party Menu → POS Order → Payment Record → Daily Close → Dashboard → Control Tower handoff is implemented as a candidate, not promoted to production.
- All six Commerce tables have RLS enabled on **cafeos-staging** (`wjatnyvdygvblirggdcm`). **Full migration-history drift:** initially 8 Git migration versions and 7 staging versions with zero timestamp intersections; now 9 Git candidates after adding an **unapplied** future-close guard migration; Commerce SQL is byte-identical (29,843 characters) despite different timestamps, but two foundation migrations are not recorded in staging history. See `docs/research/2026-10-25-core-commerce-staging-migration-differential.md`. Never blindly reapply or bulk-repair.
- Direct staging pgTAP result: **37/37 PASS** at the latest synthetic SQL audit. Added nine assertions that authenticated users cannot directly INSERT into trusted Order/Order Items/Payment/Daily Close tables or UPDATE Order/Payment, and `anon` cannot invoke create-order/payment/close privileged RPCs (test-source commit `32f0b8d`). Earlier cases cover tenant-isolated reads, role-denied writes, idempotency, exact payment and daily close. Test transaction **ROLLED BACK**; staging synthetic tenant/order/payment/close counts returned zero.
- Security Advisor reports three `authenticated_security_definer_function_executable` warnings for intentional order/payment/close RPCs; live SQL confirms `anon` cannot execute, `authenticated` can execute, and functions check `auth.uid()` and role through `private.has_tenant_role`. These are **warnings to review**, not an independently completed security sign-off. Leaked-password protection is separately disabled.
- Exact-head GitHub CI and Supabase DB CI must both pass after each branch update. Local/browser visual QA at 390px and 1200px, authenticated real-transport synthetic E2E and independent security review are **not yet accepted**. Neither PR merge nor production DB/application promotion is authorized.

## Core Commerce follow-up: checkout recovery and optional reporting

- Candidate `/api/app/commerce-order-status` is read-only, authenticated and tenant-scoped; the POS reconciles an ambiguous payment response by checking server state, without sending a second payment automatically. Reload clears ephemeral cart/client-order intent, but committed **open** orders can be recovered from the database using a separate tenant/store-scoped read endpoint.
- Control Tower reporting failures now degrade that separate pane rather than blocking Menu/POS/Dashboard readiness; core Menu and Dashboard failures remain fatal.
- Cashier sees POS/Menu read affordances but manager-only Menu edit and Daily Close controls are disabled/hidden; tenant membership role is loaded from the authenticated server. Server/DB authorization remains authoritative.
- `/api/app/commerce-open-orders`: authenticated cashier-or-higher, read-only GET of up to 20 still-open first-party orders for one selected Store and Tenant. After reload/login, POS can select and revalidate an open order via `commerce-order-status`, then record payment. No JWT, payment details or price authority is saved in browser storage; there is no recovery of an unsubmitted cart.
- Order recovery is a synthetic candidate with mocked UI/API unit tests; it is not yet a production cashier acceptance or actual browser E2E.
- Local workflow router now preserves query parameters (including `orderId` and `storeId`); regression tests cover unauthenticated HTTP routes and paid/open response recovery.
- Staging foundation object survey: all 11 expected tables have RLS enabled. A separate read-only Git-vs-live catalog reconciliation found **11/11 baseline tables, 17/17 policies, 14/14 indexes, 3/3 functions and 1/1 trigger** by object name. Existence is not SQL definition equivalence nor repaired migration history.
- Newer exact-head CI, authenticated HTTP E2E, real rendered UI screenshots at 390/1200px, privilege review and migration history reconciliation remain release gates.

## Real HTTP integration milestone (synthetic transport)

- `tests/core-commerce-http-flow.test.mjs` runs a real local Vercel-shaped HTTP server and exercises public routes end to end while substituting **only** the Supabase fetch transport with in-memory synthetic auth/DB. Synthetic users: cashier, manager, viewer; no real database credentials, real staging merchant data, or production payment processor.
- Coverage: unauthorized and cross-tenant request failures, manager menu authoring, cashier price-authority rejection, create-order idempotency, listing of open orders, exact-payment/duplicate rejection, dashboard source label, daily-close open-order guard and manager close, and Control Tower's separate imported-data source.
- GitHub CI PASS at test commit `c08e663` (runs `40191235831`, `40191231740`). This is **HTTP integration with a fake Supabase upstream**, not live authenticated staging HTTP E2E or rendered screenshot QA. Never conflate the two evidence levels.
- Supabase DB CI must be revalidated at each subsequent exact HEAD. Migration history drift and security review still block merge/release.

## Open-order backlog pagination and privilege regression

- Open-order recovery has **20-item bounded pages**, deterministic ordering by `created_at.desc,id.desc` and `offset` validation (0–10000). The operator can click `Xem thêm đơn cũ` to reach earlier persisted open orders. Tenant/Store mismatch responses are discarded when switching context.
- API unit tests include 21-row boundary detection, next-offset and invalid-offset cases; synthetic real-loopback HTTP integration asserts a second page. The full browser QA with real signed-in staging user remains **NOT_RUN**.
- A direct staging catalog audit confirmed all six Commerce tables have RLS enabled, `anon` has no table read/write grants, and only manager-scoped Menu INSERT can pass authenticated RLS. Trusted Order/Payment/Close writes are not directly granted to authenticated. This is bounded privilege evidence, not an independent security sign-off.
- New pgTAP security snapshot: **37/37 PASS** inside one rolled-back transaction; exact HEAD source includes these assertions. SECURITY DEFINER and leaked-password Advisor warnings remain open for independent review.

## BLOCKER: premature future business-day close (2026-10-25)

- **Live staging reproduction (transaction ROLLBACK):** an authorized synthetic Owner called `commerce_close_day` for **2026-11-01** while Store-local current date was **2026-10-25**. Staging accepted and returned business date **2026-11-01**. The synthetic tenant/close disappeared after `ROLLBACK`. A premature close can reject subsequent `commerce_create_order` for that business date.
- **Candidate source fix:** `db/contracts/core_commerce_future_close_guard.sql` matches new unapplied CLI migration `supabase/migrations/20261025130000_core_commerce_future_close_guard.sql`. It rejects dates later than `(clock_timestamp() at time zone store.timezone)::date` with `COMMERCE_CLOSE_FUTURE_DATE` before daily-close lock or insert. Backdated close remains supported.
- Candidate regression: new 38th pgTAP case in `supabase/tests/database/core_commerce_v1.test.sql`. The previous **37/37** result is from *live staging before this guard*; the 38-case fix is validated only by a blank-database CI run **once it passes**. Never infer staging was patched from a successful CI run.
- UI now requires a summary confirmation before Daily Close, prevents duplicate sends and blocks Tenant/Store changes while closing. This mitigates accidental UI actions but **does not block direct RPC invocation**.
- This new migration increases candidate Git migration files to **9**, while staging remains at **7** different history versions. No staging/production migration was applied or repaired. Live staging stays **NO_GO** for real merchant writes pending ledger reconciliation, controlled deployment, and reread acceptance.
- Reproduction and rollout gate: `docs/research/2026-10-25-core-commerce-future-close-release-gate.md`.

## Migration ledger reconciliation preflight — 2026-10-25

- Repeatable **READ-ONLY** staging audit: `scripts/sql/cafeos-staging-legacy-ledger-readonly-preflight.sql` verified **7/7 original migration receipts**, **107/107 baseline columns/types**, **14/14 index definitions**, **17/17 RLS policy definitions**, **3/3 private function bodies**, **11/11 baseline grant/RLS profiles**, and the enabled history trigger. All checks PASS on staging before repair. The function bodies were separately compared against Git after whitespace normalization (3/3 exact).
- The script also confirms `COMMERCE_CLOSE_FUTURE_DATE` is **absent** from the live staging RPC; it must be absent until the unapplied migration is deliberately deployed.
- Owner-controlled plan with full version mapping, receipt fingerprints, backup/compensation steps and staged gates: `docs/research/2026-10-25-cafeos-staging-ledger-reconciliation-runbook.md` (`a6f96b0`). **No history repair, `db push`, staging guard deployment or production change has occurred.**
- Existing foundation constraints observed in the live catalog: 22/22 explicitly named baseline constraints found (excluding the `DROP CONSTRAINT IF EXISTS` phrase). This does **not** prove equivalence of all unnamed CHECK/FK and managed-schema objects; independent review required.
- Git has 9 migration candidate files; staging has 7 old receipt versions with zero timestamp intersections. The proposed history repair would map 7 old receipts to 8 canonical historically materialized migrations, leaving the ninth future-close patch **PENDING**, but **must not be executed without explicit owner-approved backup and review**.

## Next engineering action

1. Confirm exact-head CI + blank-database pgTAP on PR #74; record failures at the actual HEAD, not at earlier commits.
2. Verify authenticated synthetic-user API/UI flow on a staging/preview endpoint and review `/app` at 390px and 1200px, including no horizontal overflow, cashier affordances and source labels.
3. Reconcile Supabase staging migration version with the repository's canonical migration through a supported migration-history workflow before any production promotion.
4. Independently audit privileged RPC role checks, tenant isolation, idempotency, payment correctness and daily-close locking; address advisor findings or record their verified exception rationale.
5. Keep PR #74 draft and production writes disabled until the staged release checklist is complete.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.
