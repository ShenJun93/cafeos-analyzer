# CafeOS — future-day Daily Close incident and candidate remediation

Observed: 2026-10-25 (Store timezone `Asia/Ho_Chi_Minh`)  
Repository: `ShenJun93/cafeos-analyzer` PR #74 Draft  
Staging project: `wjatnyvdygvblirggdcm` (`cafeos-staging`)  
Impact classification: **release-blocking operational integrity defect**.

## Verified evidence — not a guess

The staging `public.commerce_close_day` SECURITY DEFINER RPC computes the requested business date but, before this patch, does not reject dates later than the Store's current local date. Reproduction used only synthetic tenant, owner and Store rows inside `BEGIN; ... ROLLBACK;`. The Owner requested **2026-11-01** while the Store-local date was **2026-10-25**; the function returned `businessDate = 2026-11-01` without an exception.

Read-only post-check showed **0 synthetic test tenants and 0 test closes**. The reproduction did not leave a future close on staging.

The live create-order RPC blocks new orders for any `business_date` recorded in `daily_closes`. A premature close therefore blocks ordinary sales when that future date arrives. The backend cannot be made safe merely by hiding buttons or showing a dialog.

## Mitigations committed to Draft PR

1. **Operator UI safety:** Daily Close now requires a confirmation containing Store-local business date, paid order count, sales total and the consequence for new orders. It blocks double-submit and Tenant/Store switching while the write is in flight. This is defense in depth, not authoritative authorization.
2. **DB migration candidate (NOT APPLIED ON STAGING):** `db/contracts/core_commerce_future_close_guard.sql` and text-identical `supabase/migrations/20261025130000_core_commerce_future_close_guard.sql`. The new migration replaces only `commerce_close_day`, preserves SECURITY DEFINER/role checks/revoke+grant and rejects `v_business_date` later than Store-local today via `COMMERCE_CLOSE_FUTURE_DATE` / SQLSTATE `22023`.
3. **Regression:** `supabase/tests/database/core_commerce_v1.test.sql` now plans **38** assertions; the new future-date assertion must PASS on a **blank database migrated with the new file** before promotion. The previously observed direct staging result **37/37 PASS** was against the unpatched RPC and says nothing about this fix.

## Non-negotiable rollout sequence

- Confirm the fresh HEAD and both GitHub CI workflows. Supabase DB CI uses a local *blank* Supabase stack, not the live staging project.
- Preserve a read-only export of staging migration-history versions and SQL receipts. Git now has **9 migration candidates** versus **7 staging records** with no shared versions (original report at 8 vs 7). Never `db push` blindly; never bulk repair without exact SQL/scheme/grant equivalence and owner-approved reversible ledger plan.
- **Only after ledger reconciliation**, apply the new migration using the supported staging-only migration workflow and rerun the future-date rejection and historical-date/normal-day close acceptance with synthetic JWT actors. Confirm tenant RLS, least-privilege grants and no unexpected table changes.
- Run complete authenticated synthetic Menu → POS → Payment → Dashboard → Close flow on actual staging HTTP transport; verify `/app` with rendered browser at 390px and 1200px. Independently review 3 SEC DEFINER Advisor warnings and leaked-password protection setting.
- Keep **Draft / NO_GO** until all gates pass; production must remain untouched.

## Current environment split

| Evidence | State |
| --- | --- |
| Staging confirmed future close accepted before patch | **FAIL (repro, rolled back)** |
| Database guard SQL in Git | **Prepared; unapplied** |
| Blank-DB Supabase CI with new guard | Check exact-head workflow; don't assume PASS |
| Direct staging pgTAP before patch | 37/37 PASS; not testing future-date guard |
| Staging migration ledger | **BLOCKED** |
| Production merge / schema / release | **HOLD** |

## Read-only ledger reconciliation evidence

At checkpoint `f4dfca0`, a live staging execution of the committed query `scripts/sql/cafeos-staging-legacy-ledger-readonly-preflight.sql` returned: `matching_ledger=7`, `ledger_total=7`, `matching_columns=107`, `matching_indexes=14`, `matching_policies=17`, `matching_functions=3`, `matching_grants_rls=11`, `expected_trigger_enabled=1`, `future_guard_not_deployed=true`. A read-only constraint inventory found all 22 explicitly named baseline constraints. No schema/ledger mutation occurred.

The detailed mapping and stop/rollback gates are recorded at `docs/research/2026-10-25-cafeos-staging-ledger-reconciliation-runbook.md`. The SQL is deliberately pinned to the seven historical receipts, so it will fail after an authorized ledger rewrite; do not mistake that expected change for a new schema regression.

## Owner staging repair preparation — CLI rehearsal result

The staging-specific history preflight remains unchanged (7 old receipts, 0 canonical, both SQL guards absent). Independently, the new disposable localhost CLI drill **PASSED** at `b867a14` for receipt transitions and confirms no schema/data modifications by CLI `migration repair`. To simulate the seven old receipt versions, CI needed local placeholder migration files, demonstrating that `--status applied` requires the version's migration file even when SQL is not executed. The placeholders were deleted within the runner and are **not** an acceptable substitute for secure receipt backup in staging. Keep future-close guard **UNAPPLIED** until the owner-controlled ledger reconciliation sequence, followed by real JWT staging tests.
