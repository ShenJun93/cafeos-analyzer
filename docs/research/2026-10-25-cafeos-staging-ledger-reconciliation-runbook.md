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

**Gate B — approve an exact history-only change.** Supabase documents `supabase migration repair --status reverted <old-version>` to delete a *receipt* and `--status applied <Git-version>` to add an *applied receipt*, without executing schema SQL. After explicit review/authorization, the proposed mapping is:

- Mark **all seven orphan staging receipt versions** as reverted **only after their SQL contents are backed up**: `20260921100732`, `20260921103432`, `20260921105352`, `20260921133428`, `20260921141814`, `20260921151006`, `20261025103648`.
- Mark these **eight historically materialized canonical Git versions** as applied: `20260921005530`, `20260921005532`, `20260921100900`, `20260921164500`, `20260921170000`, `20260921201000`, `20260921203000`, `20261025094352`.
- **DO NOT mark `20261025130000` or `20261025140000` applied**: the future-close and Menu-price snapshot protections are genuinely absent on staging and must execute as SQL migrations *after* the ledger is consistent.

This is a **candidate mapping, not an approved command batch**. Supabase migration repair is not a guaranteed atomic multi-version operation: take backups and verify each stage; establish an owner-tested compensation plan. If a post-check differs, STOP; do not run `db push`.

**Gate C — post-history read-only verification.** Compare `supabase migration list --linked`: exactly eight matching canonical applied versions, zero orphan versions, and **both future-close and Menu-price snapshot migrations pending**. Run `scripts/sql/cafeos-staging-post-repair-readonly-gate.sql` against **staging only**; it must report `HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL` (8 canonical, 0 legacy, 0 guard receipts, 6 Commerce RLS tables, 3 restricted RPC grants, both functions still unpatched). `PRE_REPAIR_NO_GO` proves history was not reconciled, while `STOP_REVIEW_REQUIRED` means stop and independently examine drift. A positive gate report is **not** authorization to apply guards. The legacy preflight SQL intentionally FAILS after a successful repair because it pins the original seven receipts; use a versioned new manifest for post-repair verification. Re-check policy, grants, functions, RLS, data integrity and migration diff without making SQL mutations.

**Gate D — apply both Core Commerce integrity guards on staging only.** Execute the two new incremental migrations in timestamp order (`20261025130000` then `20261025140000`) via the supported migration tool after Gate A–C. Verify an authenticated synthetic manager cannot close tomorrow/future Store-local dates, while valid current/historical close and retry remain correct. Prove Menu item name/price snapshots stay internally consistent with Order totals under the synthetic concurrent-price-change regression. Recheck migration history, 38-case pgTAP and advisor warnings, and run the real authenticated HTTP/browser journey at 390px and 1200px.

**Gate E — independent security signoff.** Three intentional `authenticated_security_definer_function_executable` warnings and the disabled leaked-password protection warning remain open. They are not fixed by history reconciliation.

**Gate F — release decision.** Only after all staging gates and exact-head CI are green may PR #74 move out of Draft; no production action is preauthorized.

References:
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/reference/cli/supabase-migration-list
- https://supabase.com/docs/reference/cli/supabase-migration-repair


## 2026-10-25 snapshot guard — exact CI evidence

The tenth migration, `20261025140000_core_commerce_order_price_snapshot_guard.sql`, replaces a second Menu-price lookup during `commerce_create_order` with one cached server-owned price/name/quantity snapshot. A deterministic synthetic `BEFORE INSERT` trigger changes Menu price after the header total is calculated; 42/42 pgTAP assertions PASS before and after synthetic restore on the isolated database. At `f55433e`, GitHub CI runs `40199282073`/`40199285729`, Chromium QA `40199285663`, and Supabase DB `40199282063`/`40199285730` all succeeded. Staging still has 7 historical receipts, and **both integrity guard migrations remain unapplied**.
