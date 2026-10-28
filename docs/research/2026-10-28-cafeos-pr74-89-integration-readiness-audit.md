# CafeOS — Product Integration Readiness Audit, PR #74–#89

**Audit date:** 2026-10-28 (Asia/Ho_Chi_Minh)  
**Repository:** `ShenJun93/cafeos-analyzer`  
**Observed review head:** PR #89 at `04b0b5cddf110465d0cf91720f4815e5e917772a`  
**Scope:** direct GitHub PR/code/CI review, plus a new **read-only Supabase staging refresh on 2026-10-28** using the project's Supabase connector. No SQL DDL/DML, migration repair, backup/export, Auth mutation, production data or staging merchant rows were changed.  
**Decision:** **NO-GO for merchant release or PR merge.** Stop growing isolated provenance experiments until the operator's Phase 1 flow is genuinely released/accepted.

## Product authority / success criteria

Authority: `MISSION.md` → `docs/PRODUCT_ARCHITECTURE.md` → `docs/ROADMAP.md` → approved Core Commerce specs. CafeOS is a full café operating ecosystem, not only Analyzer or a dashboard. Initial buyer/operator: 3–15 café locations.

- **SELL:** Menu → first-party POS Order → settlement Payment Record.
- **OPERATE:** recover/void unpaid orders; deterministic Daily Close.
- **UNDERSTAND:** Dashboard/HQ shows current first-party Store/day facts.
- **INTEGRATE:** Control Tower displays imported facts separately with honest source/coverage boundaries.
- **ACT/MEASURE:** existing Control Tower action/measurement loop; no AI-generated financial truth.

No cross-POS monetary total or automatic deduplication is authorized. The above workflows are candidate code, not evidence of a cashier successfully operating a real signed-in staging flow.

## Exact stacked PR inventory (verified GitHub OPEN + DRAFT, no merges)

| PR | Actual contribution | Classification for the next release |
| --- | --- | --- |
| [#74](https://github.com/ShenJun93/cafeos-analyzer/pull/74) | Core Commerce Menu / Order / Payment Record / Close / Dashboard / app shell, DB contracts & migrations | **P0 functional spine: review/integrate only after release gates** |
| [#75](https://github.com/ShenJun93/cafeos-analyzer/pull/75) | Audited unpaid-order void + history and UI | **P0 cashier operational correctness** |
| [#76](https://github.com/ShenJun93/cafeos-analyzer/pull/76) | Store/day source-separated POS/import read API + UI | **P1 useful Control Tower integration** |
| [#77](https://github.com/ShenJun93/cafeos-analyzer/pull/77) | HQ multi-Store source-presence read API + UI | **P1 useful, with bounded directory completeness risk** |
| [#78](https://github.com/ShenJun93/cafeos-analyzer/pull/78) | Manager Store/day source-namespace diagnostic | **P1 useful, ≤500 source rows; not a full export audit** |
| [#79](https://github.com/ShenJun93/cafeos-analyzer/pull/79) | Design-only cross-source identity/link contract | **Retain as safety policy, not executable merchant workflow** |
| [#80](https://github.com/ShenJun93/cafeos-analyzer/pull/80) | Synthetic collision/overlap negative fixtures | **Retain in CI** |
| [#81](https://github.com/ShenJun93/cafeos-analyzer/pull/81) | Collision-safe source tuple counting and vendor field evidence | **P1 deterministic correctness; retain** |
| [#82](https://github.com/ShenJun93/cafeos-analyzer/pull/82) | PostgREST exact count for ≤500 import rows; fail-closed UI | **P1 source completeness safety; retain** |
| [#83](https://github.com/ShenJun93/cafeos-analyzer/pull/83) | Legacy import-key separator guard without rekeying historical rows | **P1 idempotency correctness; retain** |
| [#84](https://github.com/ShenJun93/cafeos-analyzer/pull/84) | Isolated untrusted source-account claim evaluator, not routed | **PARK runtime; retain test/design code as research candidate** |
| [#85](https://github.com/ShenJun93/cafeos-analyzer/pull/85) | Claim history-gap/chronology checks; private binding/RLS design | **PARK for pre-migration design review** |
| [#86](https://github.com/ShenJun93/cafeos-analyzer/pull/86) | Security preflight and 17 future RLS/JWT acceptance cases | **Retain controls; real 17 staging gates still BLOCKED** |
| [#87](https://github.com/ShenJun93/cafeos-analyzer/pull/87) | Ephemeral PostgreSQL RLS/FK fixture, transaction ROLLBACK | **Retain isolated test capability, not deployed schema** |
| [#88](https://github.com/ShenJun93/cafeos-analyzer/pull/88) | Append-only/revocation SQL candidate and negative test | **PARK experimental SQL, do not migrate** |
| [#89](https://github.com/ShenJun93/cafeos-analyzer/pull/89) | Two real PostgreSQL sessions: worker privilege and revision race | **Retain isolated test evidence, not real actor/connector acceptance** |

**Important dependency rule:** #84–#89 are stacked descendants of #83, but their isolated provenance experiment **is not a prerequisite** for displaying POS data independently of import facts. Do not merge that research merely to land a POS/HQ correctness fix. This audit's HQ fix is deliberately branched from #83.

## Evidence ledger

| ID | Statement | Evidence and type | Confidence / limitation |
| --- | --- | --- | --- |
| E-01 | 16 PRs #74–#89 OPEN/DRAFT, unchanged head/base chain | Live GitHub PR metadata checked this audit | High at audit time; refresh before action |
| E-02 | Core Commerce code has routes, UI, DB migrations and deterministic tests | PR #74/#75 changed-file inventory; source `public/app.html`, `api/app/workflow.mjs`, `server/commerce/*` | High for code existence, **not staged execution success** |
| E-03 | PR #89 Node 406/406 PASS and disposable PostgreSQL workflow PASS | GitHub Actions CI #40661837013 and PostgreSQL #40661837020 (commit `04b0b5c…`) | High for exact synthetic/CI result, **not live Supabase** |
| E-04 | **Fresh 2026-10-28 staging read confirms exactly 7 old migration receipts, 0 canonical timestamp matches, and no future-close or price-snapshot guard.** PR #90 branch has **11 Git candidate migrations**, including #75 void | Supabase `list_migrations`, direct read-only catalog SQL and the exact committed pre/post-guard SELECT gates | High for current observation, not permission to repair or migrate |
| E-05 | **Fresh Security Advisor:** 3 signed-in `SECURITY DEFINER` commerce RPC warnings and `auth_leaked_password_protection` warning; 6/6 commerce tables have RLS | Supabase Security Advisor and read-only catalog check on 2026-10-28 | Verified current findings; independent security signoff NOT DONE |
| E-06 | Off-host age recovery requires separate-device key custody, plus full compatible backup and restore | `docs/research/2026-10-28-cafeos-offhost-age-acceptance-runbook.md` | Owner action NOT PROVEN; synthetic drill cannot substitute |
| E-07 | No verified external POS source-account lifecycle, transaction mapping or finance authority | `docs/superpowers/specs/2026-10-28-cafeos-transaction-identity-evidence-contract-v1.md`; PR #81 vendor evidence | Source gap, not a claim of global vendor impossibility |
| E-08 | HQ list at PR #89 requests 26 Store rows without exact PostgREST count | `server/commerce/hq-source-coverage.mjs` at `04b0b5c…` | Verified application correctness risk: a lower upstream row cap could hide Store rows |
| E-09 | A bounded exact-count option already exists in backend auth helper | `api/_app-auth.mjs` / PR #82 | Reusable without schema migration or service key |

## Fresh staging release-gate snapshot — 2026-10-28 (read-only)

**Target:** Supabase project `cafeos-staging` (`wjatnyvdygvblirggdcm`), verified by live project inventory as `ACTIVE_HEALTHY`. This audit did **not** inspect or copy merchant data, passwords, JWTs, service role keys or provider account identifiers.

| Gate | Exact observed read-only value | Decision |
| --- | --- | --- |
| Live migration history | `7` receipt versions: `20260921100732`, `20260921103432`, `20260921105352`, `20260921133428`, `20260921141814`, `20260921151006`, `20261025103648` | **BLOCKED**; 7 historical version names still differ from 11 canonical Git candidate migrations |
| `scripts/sql/cafeos-staging-post-repair-readonly-gate.sql` (Git blob `3fecd617e89850e7ea958cc45b0ca6fa11ca61d0`) | `ledger_total=7`, `canonical_present=0`, `legacy_present=7`, `guards_marked_applied=0`, `future_guard_live=false`, `price_guard_live=false`, `commerce_rls_tables=6`, `guarded_rpc_grants=3`, `untrusted_schema_creates_blocked=true`, `audit_phase=PRE_REPAIR_NO_GO` | **NO-GO**. Expected refusal for unreconciled history |
| `scripts/sql/cafeos-staging-post-guards-readonly-gate.sql` (Git blob `ad4fdd45a25b733f8160dfbcb9df1dd6c6044399`) | `total=7`, `canonical_present=0`, `legacy_present=7`, `rls_tables=6`, `guarded_rpc_grants=3`, `future_close_guard_live=false`, `price_snapshot_guard_live=false`, `bad_order_subtotals=0`, `bad_payment_states=0`, `bad_daily_closes=0`, `audit_phase=POST_GUARDS_NOT_READY_REVIEW` | **NO-GO**. Zero-invalid-row counts do **not** prove an exercised transaction; staged commerce tables report zero estimated rows |
| Direct catalog lookup | `public.pos_order_voids` absent; `public.commerce_void_order(uuid,uuid,text)` absent; 6 Commerce RLS flags enabled; 3 core RPCs still `SECURITY DEFINER` | **VOID NOT DEPLOYED**. Real operator mistake recovery cannot be accepted |
| Supabase Security Advisor | Exactly three `authenticated_security_definer_function_executable` findings for create order, capture payment, and close day; `auth_leaked_password_protection` warning still present | **SECURITY REVIEW OPEN**. Intentional definer design still needs independent signed-JWT/privilege audit |

**Confidence/limits:** These are direct, contemporaneous read-only results. The two SQL gates use the **10-version intermediate post-guard milestone** intentionally, whereas the current Git head has **11 candidate migrations** after #75 adds unpaid-void; do not silently rewrite the intermediate classifier or call 11 present on staging. No independent full staging backup or real signed-JWT E2E was performed, and no owner off-host `age` custody was attested.

**Next authorized work order (not authorization to execute):** independent off-host recovery trust anchors → staging-compatible encrypted full export and isolated restore with migration receipt verification → explicitly approved history-only ledger reconciliation → separately approved future-close and price-snapshot guard deployment → approved audited unpaid-void schema/RPC → signed-JWT cashier/manager E2E, vulnerability/security review, Windows operator acceptance and merchant release signoff. Any failed gate is STOP; do not use `db push` or history repair to get past it.

**Operator handoff:** Only the owner or independently authorized recovery operator can establish separate-device key custody and complete staging backup/restore verification; ChatGPT/GitHub CI cannot prove a second physical device or store private keys. Owner procedure: `docs/research/2026-10-28-cafeos-offhost-age-acceptance-runbook.md`; ledger proposal: `docs/research/2026-10-25-cafeos-staging-ledger-reconciliation-runbook.md`; full Supabase-compatible backup conditions: `docs/research/2026-10-26-cafeos-full-staging-backup-execution-gates.md`.

## Current security catalogue review (read-only, 2026-10-28)

The live staging privileges/function bodies were independently rechecked without executing a commerce RPC or reading Store/Order rows. **All three `postgres`-owned `SECURITY DEFINER` RPCs** (`commerce_create_order`, `commerce_capture_payment`, `commerce_close_day`) have Tenant-role and `auth.uid()` self-checks, fixed `search_path`, no direct PUBLIC or `anon` EXECUTE, and `authenticated` EXECUTE as required for the present server-authorized workflow. The two `private.has_tenant_*` helpers check the caller against `public.tenant_members`. All 6 Commerce tables have RLS, with Member-only SELECT and Manager+ Menu INSERT policies. This shows existing controls, **not** a signed-JWT negative test or a safe production approval.

**Executable SELECT-only evidence:** `scripts/sql/cafeos-staging-rpc-security-readonly-gate.sql` returned `PRELIMINARY_GUARDS_PRESENT_SECURITY_REVIEW_REQUIRED` with `untrusted_executable_count=0`, `explicit_role_guard_count=3`, `rls_tables=6`, `jwt_role_matrix_accepted=false` and `release_approved=false`. Full exact catalogue fingerprint, risks and reviewer checklist: `docs/security/2026-10-28-cafeos-live-staging-rpc-security-review.md`.

The earlier 3 Supabase authenticated `SECURITY DEFINER` warnings and 1 leaked-password-protection warning remain **OPEN**. Do not disable the RPCs or waive their warnings without separately reviewed signed-JWT, cross-Tenant and operational acceptance. Do not use catalog-only checks as security signoff.

## Operational correctness finding and immediate bounded fix

**HQ-COUNT-01:** PR #77's HQ Store directory requests `limit=26` and rejects if its array contains more than 25, but does **not** check whether an upstream PostgREST `max_rows` cap returned only a prefix. An HQ operator with 15 Stores could see 10 with the dashboard saying all Stores were checked if the server imposed a lower cap. **This is a scenario risk, not a verified live staging incident.**

A focused runtime patch can use `Prefer: count=exact` and the existing opt-in `supabaseJson(..., includeResponseMeta:true)` helper to verify that `Content-Range` and the JSON array show the **whole** RLS-filtered Store set (0–25); otherwise refuse the entire report before firing Store RPCs. The UI must require this proof and display the exact checked count. It must not sum POS/import revenue or expose imported transaction IDs.

This patch is **product-facing** and should be reviewed separately from candidate private-account SQL experiments #84–#89. PR-head CI/visual and real JWT staging are different evidence tiers; do not claim live completeness from synthetic tests.

## Remaining release blockers, by operator impact

**P0 — BLOCKS FIRST CAFÉ TRANSACTION**

1. **Owner off-host age custody & recovery**: independent device, independent trust anchors and cryptographic readback. No private key/secret in ChatGPT/CI/Git.
2. **Real staging-compatible full backup + isolated independent restore**: schema/roles/data/Auth/RLS/migration receipt evidence. This is not satisfied by local PostgreSQL/age synthetic CI.
3. **Migration ledger reconciliation**: explicitly approve history-only repair from 7 legacy receipts to canonical history, only after complete independent evidence. DO NOT run unconditional `db push`.
4. **Separate guard deployments**: future-date close guard, Menu price-snapshot integrity guard, then the audited unpaid-void workflow from #75 with verified migration state, in approved order. The 2026-10-28 live read-only review showed both guards absent.
5. **Privilege review**: independently review three intentional `SECURITY DEFINER` RPC warnings; verify function body, caller/role scope, pinned search paths and broad EXECUTE grants; decide leaked-password protection.
6. **Genuine signed-JWT staging E2E**: Owner/Manager/Cashier/Viewer, Tenant A/B, price authority, idempotent create, ambiguous checkout recovery, exact payment, void, Close and authenticated browser; Windows native physical operator test separately.
7. **Release signoff and staged deployment**: only with owner authorization, rollback plan and real Store worker acceptance. No real merchant data before this point.

**P1 — Control Tower / integrated source value, after P0**

- Test Store/day and HQ source-separated report against real authenticated staging without importing merchant private data; verify exact-result Store directory and source-lineage pagination, Store timezone and missing-data semantics.
- Preserve imported identity/idempotency fixes #81/#83, exact count #82 and privacy/role gates; qualify vendor exports with redacted permissioned samples before any link.
- Never call HQ `neither_observed` “zero real sales”; it means no observation from those sources.

**PARK — research only, no automatic merge**

- #84–#89 claim evaluator and sample append-only SQL; no live route, table, trust attestation, source connector, real JWT test or finance policy. Their synthetic PostgreSQL race is useful for future design review but cannot authorize new privileges.
- Automatic link/dedup, total combined revenue and external POS account ownership mapping until real independent evidence plus financial authority rules are approved.

## Exit criteria for next *business-value* batch

- A cashier can complete **Menu → Order → Payment → Close** on a genuinely authenticated approved staging tenant with no hidden admin steps; Manager can void an unpaid mistake; no integrity guard is missing.
- HQ can inspect daily POS status and source-separated imported observations for all active stores, and **refuses** a truncated Store directory.
- The approval/backup/migration/security evidence is reported against precise Git HEAD and live database receipt, not copied from prior chat.
- No additional private provenance migration, “verified” source account status, synthetic money union, fake offline POS, or unapproved production data.

**Audit conclusion:** Core Commerce and Control Tower are **candidates for integration**, not production-ready. Priority should be owner-controlled release gates and merchant-workflow acceptance; future provenance research should be paused unless it unblocks a concrete merchant workflow. Retain the tests, do not let them substitute for customer use.
