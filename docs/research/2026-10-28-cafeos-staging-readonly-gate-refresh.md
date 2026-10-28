# CafeOS staging — live read-only release-gate refresh

**Date:** 2026-10-28 (Asia/Ho_Chi_Minh). **Target:** `cafeos-staging`, Supabase project `wjatnyvdygvblirggdcm`. **Candidate code HEAD when checked:** `9e29362b694b766db3232394944e398b475f40c3`. **PR #74:** DRAFT / RELEASE NO-GO.

## Scope and provenance

This checkpoint contains **only read-only Supabase MCP results** and independently checked GitHub code/CI state. No staging/production DDL, DML, SQL repair, Auth mutation, DB dump, migration push, merge or deployment was executed. It proves current database *catalog/receipt alignment against a pinned historical pre-repair manifest*, **not** backup recoverability, production security, or approval to mutate migration history.

| Evidence ID | Source and direct live result | Verdict |
| --- | --- | --- |
| STG-R01 | `mcp__Supabase__list_migrations`: 7 staging receipts: `20260921100732`, `20260921103432`, `20260921105352`, `20260921133428`, `20260921141814`, `20260921151006`, `20261025103648` | Legacy 7-receipt history still present. Git canonical 8 historical versions are not repaired |
| STG-R02 | Executed exact Git `scripts/sql/cafeos-staging-legacy-ledger-readonly-preflight.sql`, blob SHA `ce1949b0c0479fd0a9ece06068070de722972587`: 7/7 original migration receipt names/SQL MD5; 107/107 foundation column/types; 14/14 indexes; 17/17 RLS policies; 3/3 private SECURITY DEFINER function bodies; 11/11 grants/RLS; 1/1 expected trigger; `future_guard_not_deployed=true` | Historical pre-repair catalogue attestation PASS, **not** full clone or schema promotion proof |
| STG-R03 | Ran exact Git `scripts/sql/cafeos-staging-receipt-fingerprint.sql`: `fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3` | Same ordered original SQL ledger SHA-256 pinned in 2026-10-26 backup runbook; a point-in-time fingerprint, not a durable invariant |
| STG-R04 | Direct SELECT of staged function bodies, grants and table catalog: Commerce RLS 6/6; privileged signed-in RPCs 3/3 with `anon` EXECUTE denied; future-date close guard **absent**; one-pass order item price snapshot guard **absent**; persisted `pos_orders`/`pos_payments`/`daily_closes` counts **0/0/0** | **Both planned integrity guards unapplied**; synthetic zero rows cannot prove real signed-JWT E2E |
| STG-R05 | Ran exact Git `scripts/sql/cafeos-staging-post-guards-readonly-gate.sql`: total receipts 7, canonical 0, legacy 7, six RLS tables, three guarded RPCs, both guards false, three financial-invalid row counts zero | Correct refusal: **`POST_GUARDS_NOT_READY_REVIEW`**, not `POST_GUARDS_READY_FOR_AUTH_E2E` |
| STG-R06 | Supabase security advisor live result, observed at `2026-10-28T03:27:36.821Z`: WARN `authenticated_security_definer_function_executable` on exactly three Commerce write RPCs; WARN `auth_leaked_password_protection` | Three intentional privileged function paths still need human review of in-body auth/role/tenant checks, fixed search paths, `anon` denial and EXECUTE grants; leaked-password protection disabled and needs owner decision |
| STG-R07 | Supabase performance advisor: 18 INFO `unused_index` notices, including recent Commerce indexes; public table listing shows all six commerce tables with RLS enabled and zero estimated rows | Insufficient evidence to remove any index; **no index changes** |
| STG-R08 | Exact code HEAD GitHub workflows before this documentation-only commit: Linux CI `40625555637`, synthetic Chromium Visual QA `40625555644` and isolated synthetic Supabase DB `40625555645`, all completed **SUCCESS**. Owner's MAIN-PC native Windows run at same code HEAD: UI 37/37, `test:dist` 281 PASS/8 POSIX-only SKIP/0 FAIL, deploy 38/38 files, clean worktree | **Code acceptance only**, not staging release permission |

## Interpretation and release holds

**Do not proceed to staged migration repair, either guard migration, paid merchant usage, production or PR merge.** The 7/7 historical preflight is a *pre-repair* check; its successful result is expected while staging still contains seven legacy timestamps. It is NOT the post-repair eight-canonical classifier. The `POST_GUARDS_NOT_READY_REVIEW` result is a deliberate refusal.

The approved order of *future, independently authorized* gates remains:

1. Owner verifies actual off-host `age` recovery with an independently held second-device private key and two out-of-band trust anchors (see `docs/research/2026-10-28-cafeos-offhost-age-acceptance-runbook.md`). Never transfer private keys or credentials to ChatGPT, Git, CI or screenshots.
2. Owner supplies staging-specific, verified TLS+credential and approved encrypted backup procedure **outside Git**; obtain a **Supabase-compatible** export and prove isolated off-host roles/schema/data/Auth/RLS/migration receipts restore. A local synthetic drill or raw encrypted `pg_dump` alone does not satisfy this gate (see `docs/research/2026-10-26-cafeos-full-staging-backup-execution-gates.md`).
3. Only after independent full restore and exact legacy receipts are secured and signed off: approve a specifically reviewed history-only 7→8 migration-receipt repair, verify no schema/data mutation and pass the canonical/history transition gate.
4. Separately approve/apply both **real** Commerce guards in the correct sequence (`20261025130000_core_commerce_future_close_guard.sql` and `20261025140000_core_commerce_order_price_snapshot_guard.sql`) on staging; verify the actual post-guard classifier and Supabase advisors.
5. Run genuine signed-JWT staging E2E with isolated synthetic tenants, owner/manager/cashier/viewer roles and cross-tenant attempts, plus transactional order/payment/close and authenticated UI checks. Owner/security release signoff remains separate.

Do not treat historical receipt equivalence, green blank-database CI or security-advisor WARN statuses as permission to waive these gates. In addition, mistakenly created unpaid orders cannot currently be voided through an approved first-party API; the POS/Daily Close UI makes this operational limitation visible, but **void/cancel still requires a separately approved audited lifecycle design**.

## Pointers

- `docs/research/2026-10-25-cafeos-staging-ledger-reconciliation-runbook.md`
- `scripts/sql/cafeos-staging-legacy-ledger-readonly-preflight.sql`
- `scripts/sql/cafeos-staging-receipt-fingerprint.sql`
- `scripts/sql/cafeos-staging-post-guards-readonly-gate.sql`
- Supabase advisor guidance: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Supabase leaked password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
