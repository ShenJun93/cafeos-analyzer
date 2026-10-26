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
- All six Commerce tables have RLS enabled on **cafeos-staging** (`wjatnyvdygvblirggdcm`). **Full migration-history drift:** initially 8 Git migration versions and 7 staging versions with zero timestamp intersections; now 10 Git candidates after adding **two unapplied** guards: future-close and Menu-price snapshot; Commerce SQL is byte-identical (29,843 characters) despite different timestamps, but two foundation migrations are not recorded in staging history. See `docs/research/2026-10-25-core-commerce-staging-migration-differential.md`. Never blindly reapply or bulk-repair.
- Direct staging pgTAP result: **37/37 PASS** at the latest synthetic SQL audit. Added nine assertions that authenticated users cannot directly INSERT into trusted Order/Order Items/Payment/Daily Close tables or UPDATE Order/Payment, and `anon` cannot invoke create-order/payment/close privileged RPCs (test-source commit `32f0b8d`). Earlier cases cover tenant-isolated reads, role-denied writes, idempotency, exact payment and daily close. Test transaction **ROLLED BACK**; staging synthetic tenant/order/payment/close counts returned zero.
- Security Advisor reports three `authenticated_security_definer_function_executable` warnings for intentional order/payment/close RPCs; live SQL confirms `anon` cannot execute, `authenticated` can execute, and functions check `auth.uid()` and role through `private.has_tenant_role`. These are **warnings to review**, not an independently completed security sign-off. Leaked-password protection is separately disabled.
- Exact-head GitHub CI and Supabase DB CI must both pass after each branch update. **Chromium visual QA with synthetic API fixtures at 390px/1200px has now PASSed** (see latest visual QA checkpoint below). Authenticated real-transport staging E2E, independent security review and migration reconciliation remain **NOT_RUN / BLOCKED**. Neither PR merge nor production DB/application promotion is authorized.

## Core Commerce follow-up: checkout recovery and optional reporting

- Candidate `/api/app/commerce-order-status` is read-only, authenticated and tenant-scoped; the POS reconciles an ambiguous payment response by checking server state, without sending a second payment automatically. Reload clears ephemeral cart/client-order intent, but committed **open** orders can be recovered from the database using a separate tenant/store-scoped read endpoint.
- Control Tower reporting failures now degrade that separate pane rather than blocking Menu/POS/Dashboard readiness; core Menu and Dashboard failures remain fatal.
- Cashier sees POS/Menu read affordances but manager-only Menu edit and Daily Close controls are disabled/hidden; tenant membership role is loaded from the authenticated server. Server/DB authorization remains authoritative.
- `/api/app/commerce-open-orders`: authenticated cashier-or-higher, read-only GET of up to 20 still-open first-party orders for one selected Store and Tenant. After reload/login, POS can select and revalidate an open order via `commerce-order-status`, then record payment. No JWT, payment details or price authority is saved in browser storage; there is no recovery of an unsubmitted cart.
- Order recovery is a synthetic candidate with mocked UI/API unit tests; it is not yet a production cashier acceptance or actual browser E2E.
- Local workflow router now preserves query parameters (including `orderId` and `storeId`); regression tests cover unauthenticated HTTP routes and paid/open response recovery.
- Staging foundation object survey: all 11 expected tables have RLS enabled. A separate read-only Git-vs-live catalog reconciliation found **11/11 baseline tables, 17/17 policies, 14/14 indexes, 3/3 functions and 1/1 trigger** by object name. Existence is not SQL definition equivalence nor repaired migration history.
- Newer exact-head CI, authenticated *real staging* HTTP E2E, privilege review and migration history reconciliation remain release gates. Rendered Chromium screenshots at 390px/1200px were obtained later with synthetic API fixtures (not a real staging user).

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
- Those two new migrations increase candidate Git migration files to **10**, while staging remains at **7** different history versions. No staging/production migration was applied or repaired. Live staging stays **NO_GO** for real merchant writes pending ledger reconciliation, controlled deployment, and reread acceptance.
- Reproduction and rollout gate: `docs/research/2026-10-25-core-commerce-future-close-release-gate.md`.

## Migration ledger reconciliation preflight — 2026-10-25

- Repeatable **READ-ONLY** staging audit: `scripts/sql/cafeos-staging-legacy-ledger-readonly-preflight.sql` verified **7/7 original migration receipts**, **107/107 baseline columns/types**, **14/14 index definitions**, **17/17 RLS policy definitions**, **3/3 private function bodies**, **11/11 baseline grant/RLS profiles**, and the enabled history trigger. All checks PASS on staging before repair. The function bodies were separately compared against Git after whitespace normalization (3/3 exact).
- The script also confirms `COMMERCE_CLOSE_FUTURE_DATE` is **absent** from the live staging RPC; it must be absent until the unapplied migration is deliberately deployed.
- Owner-controlled plan with full version mapping, receipt fingerprints, backup/compensation steps and staged gates: `docs/research/2026-10-25-cafeos-staging-ledger-reconciliation-runbook.md` (`a6f96b0`). **No history repair, `db push`, staging guard deployment or production change has occurred.**
- Existing foundation constraints observed in the live catalog: 22/22 explicitly named baseline constraints found (excluding the `DROP CONSTRAINT IF EXISTS` phrase). This does **not** prove equivalence of all unnamed CHECK/FK and managed-schema objects; independent review required.
- Git now has 10 migration candidate files; staging has 7 old receipt versions with zero timestamp intersections. The proposed history repair would map 7 old receipts to 8 canonical historically materialized migrations, leaving the ninth future-close and tenth price-snapshot guards **PENDING**, but **must not be executed without explicit owner-approved backup and review**.

## Chromium-rendered visual QA and mobile navigation fix (2026-10-25)

- `.github/workflows/cafeos-visual-qa.yml` runs **pinned Playwright Chromium 1.64.1** against the real local `/app` HTML/CSS with **only the Auth/API transport mocked**. No real Supabase credentials, staging writes, merchant records, or Vercel-protected preview session.
- `scripts/visual-qa-core-commerce.mjs` performs sign-in, manager POS item selection/cart, create-order/payment, Menu, Dashboard, Daily Close reject-confirm/accept-confirm, Control Tower, and cashier-only control restrictions at **390×844 and 1200×800**. Every screenshot asserts zero horizontal *page* overflow.
- Browser captured **20 synthetic screenshots**, uploaded as GitHub Actions artifact `12600214260` on run `40197858463`, exact source commit `2ab98f6`. This artifact is short-lived (7 days); regenerate via workflow when needed. Browser screenshots were independently inspected at 390/1200.
- The first Chromium run detected an **audit assertion bug**, not an app crash: manager-only form was correctly inside an inactive hidden Menu workspace. The test now checks the form's own `.hidden` state instead of viewport visibility. That revision PASSed at `cf4b2a8`.
- Independent screenshot review found the original mobile tab strip cut off Daily Close / Control Tower / Analyzer on 390px. **Fixed** with two-row visible six-module navigation at <=720px and added bounding-box assertions that every module tab is on-screen. Run `40197858463` **PASS** and subsequent run `40197862580` **PASS** on `2ab98f6`. Main CI `40197862307` and Supabase DB CI `40197862301` also **PASS** at that exact source.
- This closes **synthetic-rendered visual QA**, *not* authenticated live staging/browser E2E. Preview uses Vercel Authentication. PR #74 stays **DRAFT / NO_GO**; future-close guard still unapplied on staging.

## BLOCKER: Menu price can drift between Order header and item snapshots (2026-10-25)

- **Code-level defect in the original RPC:** `commerce_create_order` calculates `pos_orders.total` using a first pass over `menu_items`, inserts `pos_orders`, then re-queries Menu in a second pass to insert `pos_order_items`. A concurrent authorized menu price change between those reads could make recorded item totals differ from the settled Order header. A second Menu read is a financial-integrity risk.
- **Candidate patch, NOT deployed:** `db/contracts/core_commerce_order_price_snapshot_guard.sql` and `supabase/migrations/20261025140000_core_commerce_order_price_snapshot_guard.sql` replace only the order RPC, materializing the validated Menu item ID/name/price/quantity in one server-side JSONB snapshot. The second pass writes solely from the snapshot. Original role checks, server-owned totals, idempotency, and RPC grants stay intact.
- **Deterministic regression on blank database:** a pgTAP-only `BEFORE INSERT` synthetic Order trigger changes a Menu item price after the first pass. Assertions require `pos_orders.total = SUM(pos_order_items.line_total)`, preserved original unit prices, payment at the exact original amount, and correct daily-close totals. This trigger exists only inside the isolated pgTAP transaction, which always rolls back.
- The first 41-test CI attempt exposed a **test fixture** issue: the synthetic price-race order remained open and blocked the subsequent Daily Close assertions. Fixed by settling the synthetic order before close; pgTAP plan now **42**. **42/42 isolated pgTAP PASS** before and after synthetic restore at `f55433e` (Supabase DB runs `40199282063`, `40199285730`). This does not supersede the older 37/37 **live staging** result.
- The staging ledger has 7 old receipts, while Git now has **10** migration files, of which the last two are genuinely unapplied. Neither guard is live on staging. Owner-reviewed reconciliation and controlled staging migration remain release-blocking.

## Staging post-repair read-only transition gate (2026-10-25)

- `scripts/sql/cafeos-staging-post-repair-readonly-gate.sql` checks the exact migration version set, RLS on six Commerce tables, three write RPC grant profiles and the presence/absence of both pending integrity guards. It runs **SELECT only**; never calls `repair`, `db push` or mutating SQL.
- Executed against real staging at Git checkpoint `624db8c`: **`PRE_REPAIR_NO_GO`** (7 old receipts, 0 canonical, 0 guard receipts; both guards absent; 6/6 Commerce RLS; 3/3 privileged RPC grant checks). Added strict SECURITY DEFINER fixed-search-path/role-helper checks and proved neither `anon` nor `authenticated` can CREATE objects in `public` or `private`. This is the expected safe state before ledger reconciliation, **not independent security sign-off**.
- After a separately backed-up, independently approved historical repair, it should return `HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL` **only** when eight canonical historical receipts replace the seven old ones and both guard migrations are still pending. Otherwise `STOP_REVIEW_REQUIRED`. Neither result alone approves database writes.
- Direct comparison of complete original SQL receipts versus Git canonical contracts: **6/7 exact text matches**; Daily Brief aggregate differs by **one trailing newline** only. Repeated `action_measurement_loop` receipts contain identical SQL. No staging or production schema/history change.

## Supabase CLI migration-repair semantics — isolated live rehearsal (2026-10-25)

- `scripts/run-local-ledger-reconciliation-drill.sh` runs only against **`postgresql://postgres:postgres@127.0.0.1:54322/postgres`** in a disposable GitHub Actions Supabase stack, after the existing 42-case pgTAP and synthetic restore. All `supabase migration repair` commands pass explicit `--db-url`; no linked project, network secret, staging or production target is used.
- The drill recreated seven *synthetic* old receipt versions, mapped these to the eight canonical historical versions, and restored all ten local migration receipt versions. Direct function-definition and data-count fingerprints remained identical across the CLI repair operations. This proves version bookkeeping in CLI v2.117.0 did **not** execute/rollback Order, Payment or Close schema in this local run.
- Important CLI discovery: `migration repair --status applied` requires a local migration file for that version. The test creates seven temporary **NO-OP legacy placeholders on the disposable runner only** and deletes them using a shell `EXIT` trap. These files are **never committed, never used for staging migration repair, and never executed**.
- The local stack already contained both guard SQL bodies. When its history was rewritten to eight canonical versions with both guard receipts pending, `scripts/sql/cafeos-staging-post-repair-readonly-gate.sql` correctly returned `STOP_REVIEW_REQUIRED` — the preflight did not mistake history-only bookkeeping for a real SQL rollback.
- Exact code source **`b867a14`**: GitHub CI `40203880881`/`40203884721`, Chromium synthetic `40203884659`, and Supabase DB `40203880830`/`40203884689` all **SUCCESS**. Supabase DB passes include the 42-case pgTAP before/after synthetic restore and the new history drill. Earlier failed CI runs reflect preflight implementation errors, not staging mutations.
- **Limit of evidence:** the legacy versions/files in the rehearsal are synthetic and have no original staging SQL receipts. The full staging receipts still require secure independent backup; the mapping still requires owner approval, before any real migration repair or application of the two pending guards.
- Staging remains **7 old receipt versions, both guard SQL functions absent, DRAFT / NO-GO**; production untouched.

## Local migration transition full GREEN-path proof — 2026-10-25

- New `scripts/run-local-greenpath-ledger-drill.sh`, executed only against disposable localhost Supabase in CI. It resets **only** the local stack to Git migration `20261025094352` (8 historical migrations, both guard SQL bodies absent).
- Read-only transition gate returns `HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL` for this legitimate intermediate state. Local test then simulates seven legacy receipt versions with **temporary no-op filenames**, verifies `PRE_REPAIR_NO_GO`, and runs history-only repair back to eight canonical receipts; function/data fingerprint stays unchanged and transition gate returns **GREEN** again.
- The script then invokes `supabase migration up --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres` and applies the **two actual guard migrations in canonical timestamp order**. All ten receipt versions are present; SQL guard function bodies are materialized; gate returns `STOP_REVIEW_REQUIRED` intentionally because that *pre-deployment* classifier must never act as a post-deployment clearance.
- A complete additional `supabase test db` after the local guard upgrade **PASS (123 assertions across 6 files; 42 Core Commerce)**. This validates local 8→10 upgrade from a real eight-migration SQL schema, not just ledger rewriting on an already-patched schema.
- Exact code commit `69b73e9`: GitHub CI `40205736746`/`40205740231`, synthetic Chromium `40205740221`, Supabase DB `40205736706`/`40205740389` **all SUCCESS**. Green-path log contains `CAFEOS_LOCAL_GREENPATH_PASS: pre=8 legacy=7 reconciled=8 guarded=10`.
- Scope of proof: **isolated CI DB with synthetic legacy receipt versions**, not a restore of the actual staging database or proof that the real seven-statement receipt backups exist. Staging still has **7 old receipts**, future-close and Menu-price guards **NOT APPLIED**; owner-controlled secure backup, independent review, real JWT E2E and staged deployment gates remain.
- After an authorized staging deployment, a separately versioned **post-deployment** read-only acceptance is required, because the existing transition gate deliberately outputs `STOP_REVIEW_REQUIRED` whenever the guards are installed.

## Numeric money validation and post-guard acceptance gate — 2026-10-25

- **Fixed binary-floating-point rejection in Commerce API**: `menu.mjs` and `payment.mjs` no longer compare `Math.round(value * 100)` to `value * 100`. A shared decimal-scale validator accepts valid amounts `0.07`, `0.29`, `2.55`, `19999.99` (and whole-number VND), while rejecting booleans, arrays, negative/small invalid amounts, greater than two decimal places and amounts beyond existing endpoint ceilings. No DB migration is required. Unit/API regressions plus synthetic browser and isolated-DB tests at `c3fb2eba`: **CI / Chromium / DB all SUCCESS**.
- **Added separate READ-ONLY post-deployment acceptance**: `scripts/sql/cafeos-staging-post-guards-readonly-gate.sql`. It checks **10 exact canonical migration versions**, zero legacy versions, both guard function bodies present, **6/6 RLS**, **3/3 restricted SECURITY DEFINER grants** and zero observed Order subtotal, Payment state or Daily Close accounting anomalies. Passing result means `POST_GUARDS_READY_FOR_AUTH_E2E`, **not permission to release production**.
- Ran the post-deployment audit directly on **unpatched staging**: it correctly returned `POST_GUARDS_NOT_READY_REVIEW` (7 old receipt versions, both new guards absent, no persisted Commerce anomalies; RLS/privilege profiles 6/6 and 3/3). **No SQL mutations**.
- Updated `scripts/run-local-greenpath-ledger-drill.sh` to demand the new gate fail **before** local migration and pass **after** two actual SQL guard upgrades, then still pass after complete pgTAP. Await the **exact-head Supabase DB workflow** on `5518f199` before claiming this new acceptance test PASS.
- Real authenticated staging E2E, secure backup of seven original receipts, independent security advisor signoff and controlled staging-only migration remain the blocking tasks. **PR #74 stays DRAFT / NO-GO; production unchanged.**

## 2026-10-26 negative financial-audit validation

- Added a **LOCAL ONLY** synthetic negative fixture `scripts/sql/cafeos-local-postguards-negative-fixture.sql`. Inside `BEGIN ... ROLLBACK`, it writes a superuser-created Order header of 1,000 with no Order Items to intentionally violate `subtotal = SUM(line_total)`.
- The read-only `cafeos-staging-post-guards-readonly-gate.sql` **must return `POST_GUARDS_NOT_READY_REVIEW`** while the bad Order exists; after rollback it must return `POST_GUARDS_READY_FOR_AUTH_E2E`. This proves that the financial audit does not pass solely because staging has zero synthetic facts.
- Integrated in `scripts/run-local-greenpath-ledger-drill.sh`; configured Supabase DB CI path triggers for both new SQL files. Exact functional checkpoint `65c118b5`: CI `40248182303` and `40248178634` SUCCESS; Chromium `40248182289` SUCCESS; Supabase DB `40248182196` and `40248178630` SUCCESS, including both before/after post-guard assertions.
- **Staging NOT mutated**. Existing seven receipt versions and both unapplied database guards remain. Open blocker: full original SQL receipt archival in access-controlled storage plus independent review before any history repair. Subsequently, **all 7 original SQL receipts were archived with user-bound Windows DPAPI on MAIN-PC and successfully recovered in a separate process**, with 7/7 SHA-256 matches against the live staging ledger (see 2026-10-26 receipt archive checkpoint). This does not replace full database backup or independent review.
- PR #74 remains DRAFT / NO-GO; real authenticated staging E2E and security advisor review still pending.

## Staging original SQL receipt archive — 2026-10-26 (BACKUP VERIFICATION PASS)

- **7/7 ORIGINAL STAGING MIGRATION RECEIPTS ARCHIVED** outside Git on MAIN-PC in a restricted, user-owned folder (DPAPI `CurrentUser`, 7 encrypted receipt files + one metadata/checksum manifest). Captured directly from `supabase_migrations.schema_migrations` including `version`, `name`, and complete ordered `statements`; SQL was transferred via an interactive local process's standard input, not embedded in command strings, stdout, PR or plaintext disk files.
- A **separate PowerShell process** reopened the seven encrypted files, decrypted only in memory, reconstructed every receipt and validated `version`, `name`, statement count, UTF-8 SQL byte count, encrypted-file SHA-256 and SQL SHA-256 against the saved manifest. **7/7 RESTORE_CHECK_PASS**.
- A fresh read-only staging SQL query recomputed the SHA-256 of the original 7 SQL statement texts. All **7/7 match the independently restored local receipts**. Duplicate Action Measurement receipts have the same SQL hash, as expected. Source fingerprints and limitations: `docs/research/2026-10-26-cafeos-staging-receipt-archive-attestation.md`.
- This satisfies **receipt text capture and same-account recovery rehearsal**, **NOT** a full Postgres/database snapshot, nor off-machine recovery. Windows DPAPI CurrentUser remains bound to the Windows profile; do not delete the user profile/OS or assume this archive can be opened on another machine. A secure full staging DB backup, off-machine copy with an independently recoverable key and independent approval remain outstanding before any live ledger repair.
- WAG FULL mode closed after completion of the local archive/restore proof. No staging history mutation or schema migration was attempted. Two Commerce integrity migrations remain unapplied, PR #74 stays **DRAFT / NO-GO**, and production unchanged.

## Stage backup plan changes after verifying billing (2026-10-26)

- Connected Supabase organization `kihybjhscrcdqsavomse` reports **`free` / `tier_free`**. This project must **not assume** paid-plan daily backups, PITR or Dashboard-downloadable physical backup snapshots. Supabase docs advise **manual CLI logical dump plus an off-site backup for Free projects**. Verify project-specific options in Dashboard before making any contrary claim.
- Live read-only inventory: **Postgres 17.6**, total database size **14,011,539 bytes (~13 MiB)**; 53 base tables across `public`, `auth`, `storage`, `supabase_migrations`; **1 Auth account**, **0 Storage objects**, and **7/7 original staging migration receipts unchanged**.
- Added **UNEXECUTED backup candidate** `scripts/backup-cafeos-staging-age.sh`: requires pinned direct/session staging host, valid CA-backed TLS (`verify-full`), an external `PGPASSFILE` (mode 0600), PostgreSQL 17+ tools and portable `age` recipient/private identity held separately from backup data. The script pipes `pg_dump -Fc` + `pg_dumpall --globals-only --no-role-passwords` directly into `age` ciphertext, with no plaintext SQL backup file on disk.
- It **refuses a drifted 7-version staging ledger** and provides same-key decryption/readback verification of the encrypted file, but **does not perform a fresh-database restoration**. Raw `pg_dump` of managed Supabase schemas is not equivalent to a supported cross-project restore without further reconfiguration/testing; global-role dump deliberately omits passwords. Storage objects, secrets outside Postgres and dashboard settings need independent coverage.
- The backup script is **not run automatically in CI or on staging**. CI only tests shell syntax and fail-closed conditions; actual backup requires owner-controlled Postgres credentials + portable encryption/recovery keys and independent restore test. The earlier DPAPI receipt archive remains PASS (7/7), but does **not** clear this full DB backup gate.
- Security advisor remains open: three authenticated SECURITY DEFINER write RPC warnings plus leaked-password protection disabled. Read-only SQL verified each RPC has `anon EXECUTE=false`, `authenticated EXECUTE=true`, `SECURITY DEFINER=true`, explicit fixed `search_path`, direct `auth.uid()` and tenant-role-helper checks. This is **technical evidence, not independent security approval**.
- **No migration repair, no staging schema mutation, no new DB dump claimed, no production release.** PR #74 stays DRAFT / NO-GO.

## Portable age-encrypted PostgreSQL backup/restore rehearsal — 2026-10-26

- **New CI-proven local acceptance:** `scripts/run-local-age-backup-drill.sh` creates **two independent disposable databases** on the Supabase/PostgreSQL 17.6 loopback server, with synthetic Vietnamese sale rows and a migration receipt. It streams a PostgreSQL 17 `pg_dump -Fc` and `pg_dumpall --globals-only --no-role-passwords` directly into `age` ciphertext; generates a temporary portable age key, decrypts to `pg_restore` **stdin** on the distinct destination database, and verifies text/data totals, receipt version and SHA-256 manifest. On exit, both temporary databases and the temporary identity/ciphertext are discarded.
- GitHub CI **SUCCESS** at functional HEAD `dc50f247`: Supabase DB runs `40259256516` and `40259259386` both contain `CAFEOS_LOCAL_AGE_BACKUP_RESTORE_PASS`; standard CI and synthetic Chromium also SUCCESS. Earlier failures led to corrected PostgreSQL 17 client installation from the official signed PGDG repo, localhost `pg_dumpall` connection authentication and direct `pg_restore` stdin consumption; those regressions are now covered by tests.
- **Improved staging backup candidate, still UNEXECUTED:** `scripts/backup-cafeos-staging-age.sh` streams both encrypted artifacts into one restrictive temporary directory, generates/verifies a ciphertext SHA-256 manifest, then publishes the **entire** directory by one same-filesystem rename only after completion. Avoids half-published archives. It requires matching staging host, `verify-full` TLS, externally protected DB password file and independently recoverable age keys.
- **Limits:** the acceptance dataset is entirely synthetic PostgreSQL, **NOT** a backup of real staging `auth`, `storage`, merchant tables, roles or Supabase-managed schemas. No actual staging full DB archive or cross-machine production-like restore has occurred. The previously verified **7/7 DPAPI original migration receipt archive** remains the only live backup evidence. Full staging backup, independent recovery, security signoff, and JWT staging E2E remain BLOCKED. PR stays DRAFT / NO-GO; production unchanged.
- Detailed proof/runbook: `docs/research/2026-10-26-cafeos-age-encrypted-local-restore-evidence.md`.

## Receipt-content drift guard and MAIN-PC readiness (2026-10-26)

- Added READ-ONLY ledger fingerprint SQL at `scripts/sql/cafeos-staging-receipt-fingerprint.sql`: SHA-256 covers the **version, name and all ordered original SQL statements**, not just the seven version identifiers. Queried the actual unmodified staging database (SELECT-only); source fingerprint: `fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3`. No staging schema/ledger writes.
- The staging-only backup candidate now checks that **the exact SQL ledger fingerprint is unchanged before and after the complete dump**; it refuses publishing an archive if the SQL changed while streaming. Its completed archive includes the ledger fingerprint, ciphertext hashes and validated manifest. It refuses an archive/key stored in a Git working tree and requires a restrictive age private-identity file mode.
- The **local PostgreSQL synthetic negative-control** changes a sample migration statement without changing its version and confirms the fingerprint changes, then verifies the original hash after restoration. Source commit `4f93f17`; GitHub CI/Chromium and Supabase DB workflows at exact HEAD `c6cbe77` all **SUCCESS** (Supabase DB runs `40260920499` and `40260924317`).
- MAIN-PC WSL **Ubuntu 26.04** originally lacked age/PostgreSQL client and noninteractive sudo. Resolved **without elevated installation** by downloading three trusted Ubuntu APT packages into a user-owned, **non-Git** CafeOS-Evidence toolchain (age **1.2.1**, PostgreSQL client **18.6**, libpq **18.6**). Confirmed pg_dump/pg_dumpall/pg_restore/psql versions, dynamic libraries and a temporary age encrypt/decrypt roundtrip; the one-time test key was deleted. No system package database, remote DB, permanent private backup key, or DB password was changed.
- Actual complete staging archive and off-host restore **still NOT_RUN**. Await owner-controlled privileged dependency installation, PostgreSQL credential file, validated CA/certificate, age private-key custody and an independently restored full staging snapshot. Previously completed DPAPI 7/7 original receipt backup remains PASS; PR #74 stays Draft / NO-GO and production remains unchanged. See `docs/research/2026-10-26-cafeos-full-staging-backup-execution-gates.md`.

## Next engineering action

1. Confirm exact-head CI + blank-database pgTAP on PR #74; record failures at the actual HEAD, not at earlier commits.
2. Verify authenticated synthetic-user API/UI flow on a staging/preview endpoint and review `/app` at 390px and 1200px, including no horizontal overflow, cashier affordances and source labels.
3. Reconcile Supabase staging migration version with the repository's canonical migration through a supported migration-history workflow before any production promotion.
4. Independently audit privileged RPC role checks, tenant isolation, idempotency, payment correctness and daily-close locking; address advisor findings or record their verified exception rationale.
5. Keep PR #74 draft and production writes disabled until the staged release checklist is complete.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.


## 2026-10-26 independent staging-backup SQL attestation guard

- Fresh exact-head `82956a73bdd5a99aedf8c5c4833d42bc9493f307` verification: CI `40266149698`, synthetic Chromium `40266149725`, Supabase DB CI `40266149766` **SUCCESS**. PR #74 remains Draft.
- Fresh staging SELECT-only ledger fingerprint `fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3` matches prior 7/7 DPAPI-restored original receipts; the staging history still has 7 old versions and both Commerce guards are unapplied.
- Corrected backup safety gap: pre/post hash equality alone would not detect an original SQL receipt changed **before** a dump while retaining the same version. Backup now requires the previously pinned 64-hex `CAFEOS_EXPECTED_RECEIPT_SHA256`; it refuses a different initial SQL fingerprint before dumping. New negative regression tests missing/invalid values without DB access. Expected value is the previously recorded full-ledger checkpoint (whose seven individual receipt SQLs were separately verified against the recovered DPAPI archive), not the same live query. The combined ledger fingerprint itself has not yet been recomputed from the DPAPI receipt files.
- Full staging logical database backup, portable/off-host key custody, independent restore of actual staging managed schemas, live JWT E2E and independent security signoff remain **NOT_RUN / BLOCKED**. No migration repair, `db push`, SQL guard application, merge or production release. **DRAFT / NO-GO**.
