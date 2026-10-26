# CafeOS staging — migration-ledger reconciliation runbook (PLAN ONLY)

Date: 2026-10-25, Asia/Ho_Chi_Minh  
Repository: `ShenJun93/cafeos-analyzer`, PR #74 **DRAFT**  
Staging project: `wjatnyvdygvblirggdcm` (`cafeos-staging`)

**STATUS: READ-ONLY PRECHECK PASS; REPAIR NOT AUTHORIZED / NOT RUN.**
Production DB/application must not be touched. This document is **not** an execution authorization.

## Evidence verified directly on staging

Executed the repeatable read-only query stored in
`scripts/sql/cafeos-staging-legacy-ledger-readonly-preflight.sql`
at source checkpoint `f4dfca0`. Its live result was:

| Check | Result |
| --- | --- |
| Historical migration receipts (version + name + original statement MD5) | **7/7 matching; 7 total** |
| Git foundation column names and PostgreSQL types | **107/107** |
| Foundation index definitions (includes columns, sort, predicates) | **14/14** |
| Foundation RLS policy definition fingerprints (command/roles/USING/WITH CHECK) | **17/17** |
| Three private SECURITY DEFINER function-body fingerprints | **3/3** |
| Authenticated/anonymous grants plus RLS on foundation tables | **11/11** |
| `actions_record_status_history` trigger enabled and attached to canonical function | **1/1** |
| Future-close guard on live staging RPC | **ABSENT** (expected; patch not applied) |

The three function bodies were separately compared with the *canonical Git bodies* after whitespace normalization: all 3 match. The named foundation constraints in Git were also present on staging (**22/22** after excluding the SQL phrase `DROP CONSTRAINT IF EXISTS`). This is substantial equivalence evidence but **does not prove every column default, every unnamed CHECK/FK, every extension or managed-schema side effect is equivalent**. Do not turn these checks into an automatic migration repair.

Latest direct staging transactional pgTAP *before* the future-date patch: **37/37 PASS, 0 FAIL**, and fixture tenant/order/payment/close counts remained zero. The 38th future-date-close assertion PASS is proven only on **blank-database CI** using the incremental candidate migration.

## Exact Git ↔ staging receipt mapping

Ten Git migrations exist in the PR candidate, versus seven staging receipts, with **zero identical timestamps**.

| Staging applied version | Migration | Canonical Git version | SQL equivalence |
| --- | --- | --- | --- |
| — (not recorded) | analyzer_core | `20260921005530` | Foundation catalog attested, not byte-equivalent historical receipt |
| — (not recorded) | control_tower_core | `20260921005532` | Foundation catalog attested, not byte-equivalent historical receipt |
| `20260921100732` | daily_brief_correctness | `20260921164500` | Exact canonical SQL text |
| `20260921103432` | daily_brief_aggregate | `20260921100900` | SQL content matches; Git has one extra terminal newline |
| `20260921105352` | action_owner_offboarding | `20260921170000` | Exact canonical SQL text |
| `20260921133428` | store_health_read_model | `20260921201000` | Exact canonical SQL text |
| `20260921141814` | action_measurement_loop | `20260921203000` | Earlier staging receipt has same full MD5 as later duplicate |
| `20260921151006` | action_measurement_loop | `20260921203000` | Latest staging receipt exact canonical SQL text |
| `20261025103648` | core_commerce_v1 | `20261025094352` | Exact canonical SQL text (29,843 chars) |
| — (**NOT APPLIED**) | core_commerce_future_close_guard | `20261025130000` | Blank-DB Supabase CI PASS only |
| — (**NOT APPLIED**) | core_commerce_order_price_snapshot_guard | `20261025140000` | 42/42 isolated blank-DB pgTAP PASS at `f55433e`; never run on staging yet |

Current historical receipt MD5 fingerprints, which the SQL preflight checks without printing statements:
- `20260921100732`: `156d05aca9bab134c034c3bfeb5f0af8`
- `20260921103432`: `9f01e3fe5722a3c9f51e14f7bad94b50`
- `20260921105352`: `05e7a3ed76b81d8b46e30001b7735d9a`
- `20260921133428`: `ff27295f925be64f4f79806a8dbf25cc`
- `20260921141814` and `20260921151006`: `64f2a98ddacbfd5dab5b8c789e4f38bc`
- `20261025103648`: `f6398a486895d58a03f3d23d222f663c`

## Owner-controlled proposed reconciliation — DO NOT EXECUTE YET

**Gate A — capture and independent compare.** Obtain a secure export/backup of staging's entire `supabase_migrations.schema_migrations` receipts including original SQL statements, not merely the seven timestamp labels. Keep the export outside source control and protect credentials. Run the read-only SQL preflight, confirm 7/107/14/17/3/11/1 and patch-absent booleans. Compare structural schema, constraints, function privileges, triggers and affected managed schemas independently. Verify local CLI is linked to **staging project only**, not production. Re-verify exact Git HEAD and blank-DB CI.

### Isolated CLI preflight rehearsal — completed

The **test-only** GitHub workflow `Supabase DB` now executes `scripts/run-local-ledger-reconciliation-drill.sh` (CLI v2.117.0), *after* synthetic restore and pgTAP. It pins all CLI `migration repair` calls to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; no `supabase link`, remote ref or staging password.

CLI **`--status applied` requires a matching local migration file**, even though no schema SQL is executed. For the test only, seven temporary no-op legacy migration filenames are created inside the ephemeral checkout and deleted on EXIT. **Do not add legacy placeholders to the actual project for staging repair.** For a real staging repair, the eight intended `applied` canonical versions already have genuine Git migration files.

The drill demonstrates (a) 10 canonical→7 synthetic legacy→8 canonical historical→10 canonical version transitions, (b) no change to the three Core Commerce RPC definitions or data-count fingerprint, and (c) deliberate `STOP_REVIEW_REQUIRED` when the scratch database has both guard SQL bodies installed but their migration receipts are marked pending. PASS at commit `b867a14` in DB workflows `40203880830` and `40203884689` (plus standard pgTAP pre/post restore). These results **do not validate real staging SQL backups or authorize repair**.

**Gate B — approve an exact history-only change.** Supabase documents `supabase migration repair --status reverted <old-version>` to delete a *receipt* and `--status applied <Git-version>` to add an *applied receipt*, without executing schema SQL. After explicit review/authorization, the proposed mapping is:

- Mark **all seven orphan staging receipt versions** as reverted **only after their SQL contents are backed up**: `20260921100732`, `20260921103432`, `20260921105352`, `20260921133428`, `20260921141814`, `20260921151006`, `20261025103648`.
- Mark these **eight historically materialized canonical Git versions** as applied: `20260921005530`, `20260921005532`, `20260921100900`, `20260921164500`, `20260921170000`, `20260921201000`, `20260921203000`, `20261025094352`.
- **DO NOT mark `20261025130000` or `20261025140000` applied**: the future-close and Menu-price snapshot protections are genuinely absent on staging and must execute as SQL migrations *after* the ledger is consistent.

This is a **candidate mapping, not an approved command batch**. Supabase migration repair is not a guaranteed atomic multi-version operation: take backups and verify each stage; establish an owner-tested compensation plan. If a post-check differs, STOP; do not run `db push`.

**Gate C — post-history read-only verification.** Compare `supabase migration list --linked`: exactly eight matching canonical applied versions, zero orphan versions, and **both future-close and Menu-price snapshot migrations pending**. Run `scripts/sql/cafeos-staging-post-repair-readonly-gate.sql` against **staging only**; it must report `HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL` (8 canonical, 0 legacy, 0 guard receipts, 6 Commerce RLS tables, 3 restricted RPC grants, both functions still unpatched). `PRE_REPAIR_NO_GO` proves history was not reconciled, while `STOP_REVIEW_REQUIRED` means stop and independently examine drift. A positive gate report is **not** authorization to apply guards. The query also requires the three privileged RPCs to retain explicit role checks, safe fixed `search_path`, and denied `anon` EXECUTE, plus both unauthenticated/authenticated roles to lack CREATE privileges in `public` and `private`. These conditions are checked in live staging now, and will be rechecked after reconciliation. The legacy preflight SQL intentionally FAILS after a successful repair because it pins the original seven receipts; use a versioned new manifest for post-repair verification. Re-check policy, grants, functions, RLS, data integrity and migration diff without making SQL mutations.

**Gate D — apply both Core Commerce integrity guards on staging only.** Execute the two new incremental migrations in timestamp order (`20261025130000` then `20261025140000`) via the supported migration tool after Gate A–C. Verify an authenticated synthetic manager cannot close tomorrow/future Store-local dates, while valid current/historical close and retry remain correct. Prove Menu item name/price snapshots stay internally consistent with Order totals under the synthetic concurrent-price-change regression. Recheck migration history, 38-case pgTAP and advisor warnings, and run the real authenticated HTTP/browser journey at 390px and 1200px.

**Gate E — independent security signoff.** Three intentional `authenticated_security_definer_function_executable` warnings and the disabled leaked-password protection warning remain open. They are not fixed by history reconciliation.

**Gate F — release decision.** Only after all staging gates and exact-head CI are green may PR #74 move out of Draft; no production action is preauthorized.

References:
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/reference/cli/supabase-migration-list
- https://supabase.com/docs/reference/cli/supabase-migration-repair


## 2026-10-25 snapshot guard — exact CI evidence

The tenth migration, `20261025140000_core_commerce_order_price_snapshot_guard.sql`, replaces a second Menu-price lookup during `commerce_create_order` with one cached server-owned price/name/quantity snapshot. A deterministic synthetic `BEFORE INSERT` trigger changes Menu price after the header total is calculated; 42/42 pgTAP assertions PASS before and after synthetic restore on the isolated database. At `f55433e`, GitHub CI runs `40199282073`/`40199285729`, Chromium QA `40199285663`, and Supabase DB `40199282063`/`40199285730` all succeeded. Staging still has 7 historical receipts, and **both integrity guard migrations remain unapplied**.

## Full local transition GREEN-path rehearsal — completed 2026-10-25

The first localhost-only drill demonstrated history-only changes without changing already-installed SQL. A separate follow-up now exercises the **missing legitimate intermediate state**: reset the disposable DB to *exactly eight canonical migrations* with both new guards actually absent, verify `HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL`, replace eight receipts with seven temporary legacy receipt versions (gate = `PRE_REPAIR_NO_GO`), reconcile back to eight historical canonical versions (gate = `HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL`), then execute the **real two pending migration SQL files on localhost** (ten applied versions, both guards present; old transition gate intentionally `STOP_REVIEW_REQUIRED`). The three Commerce RPC definition and data-count fingerprint remains constant through *history-only* operations; changes only after the real SQL guard upgrade.

`scripts/run-local-greenpath-ledger-drill.sh` runs after the existing synthetic restore and prior history-only drill. It uses **`supabase db reset --local --version 20261025094352`**, explicit loopback `--db-url` for all repair/up commands, and deletes temporary legacy placeholders via `EXIT` trap. A complete **123-test pgTAP suite PASS**, including all 42 Core Commerce cases, after the guarded upgrade. GitHub workflow `40205740389` and sibling `40205736706` **SUCCESS** at code commit `69b73e9`. Both standard CI and Chromium QA also SUCCESS.

**Important:** this proves the sequencing and a concrete GREEN state on an **artificial scratch ledger**. It is not a verified restore of staging SQL receipts; neither staged receipt backup nor independent approval has been produced. No real staging receipt, schema or production deployment was changed. The classifier is designed for *before* installing guards and must be replaced with an independent post-upgrade verification checklist after a controlled staging rollout.

## Read-only verification AFTER both guarded migrations — new acceptance gate

Following a separately approved staging history repair and execution of both pending migrations, run `scripts/sql/cafeos-staging-post-guards-readonly-gate.sql` using a **read-only** SQL session. It requires the 10 canonical receipts without legacy versions; `commerce_close_day` must contain the future-date guard and `commerce_create_order` must use the validated item-price snapshot. It verifies the six Commerce tables' RLS, three restricted write RPCs and observable accounting invariants across all persisted Orders, Payments and Daily Closes. The only acceptable green value is `POST_GUARDS_READY_FOR_AUTH_E2E`, which permits proceeding to **actual JWT authenticated staging E2E** only; it does not sign off production or excuse Supabase security advisor warnings.

The pre-deployment transition classifier intentionally returns `STOP_REVIEW_REQUIRED` **after** guards are installed and must no longer be used as an after-deployment sign-off. The new classifier expects `POST_GUARDS_NOT_READY_REVIEW` on today's unpatched staging; this was independently verified with SQL **SELECT only** on 2026-10-25. The local green-path CI test now also checks refusal before upgrade and green after upgrade; exact HEAD test evidence must be checked before relying on it.

Money precision: API handlers for Menu prices and recorded Payment amounts now validate up to two decimal digits by textual decimal form rather than binary floating arithmetic, accepting valid `0.29`/`2.55` that the previous validator erroneously rejected. Existing monetary ceilings and server-owned trusted totals remain unchanged.

## Receipt backup progress — 2026-10-26

**Gate A, limited receipt-text portion: PASS.** The complete original seven `supabase_migrations.schema_migrations` records (`version`, `name`, ordered `statements`) have been archived as **7 DPAPI CurrentUser-encrypted files outside the repository**, alongside a manifest containing version/name/statement counts/byte lengths and SHA-256 digests. PowerShell encrypts after reading each receipt from stdin, never from a command-line SQL argument and never from a plaintext staging SQL file. A second OS process restored and verified all seven receipts in memory, and read-only staging SHA-256 comparison passed **7/7**.

**Critical remaining Gate A requirements:** This is **NOT a database backup**. Obtain and test a complete staging database backup/snapshot, secure a portable off-machine copy and an independently recoverable decryption path. DPAPI `CurrentUser` alone is not independent disaster recovery. Re-run the ledger+schema preflight at the moment of action and have an independent reviewer approve an exact reversible version mapping. No repair or migration-up operation is approved or executed yet. See `docs/research/2026-10-26-cafeos-staging-receipt-archive-attestation.md`.


## 2026-10-26 Free plan backup readiness (not a backup completion claim)

The Supabase organization actually reports **Free**; no paid-plan automated daily backups/PITR can be assumed. Staging currently contains about 13 MiB PostgreSQL, 1 Auth user and no Storage objects. The verified 7/7 DPAPI migration receipt archive is narrower than a full database snapshot.

`scripts/backup-cafeos-staging-age.sh` is a **candidate only**, added to prepare a streaming, portable age-encrypted logical PostgreSQL dump plus role metadata without writing plaintext SQL to the disk. It validates the staging host, TLS CA, password file restrictions, PostgreSQL 17+ and exact seven-version ledger before reading. It must **not** be used for production or mistaken for a completed backup. Both encrypted outputs require fresh-project/isolated restore verification, including managed schema and ownership/RLS behavior and handling Auth/Storage/secret differences. CLI `db dump` defaults filter managed schemas; raw `pg_dump` can carry those objects but may fail to restore into a managed Supabase project without an explicit compatibility plan. See `docs/research/2026-10-26-cafeos-staging-portable-backup-readiness.md`.

**Gate A status remains PARTIAL**: original SQL receipts encrypted and restored **PASS**; full DB backup, independent cross-host restore, cryptographic key custody, security signoff and owner approval **OPEN**. No live history repair was attempted.
