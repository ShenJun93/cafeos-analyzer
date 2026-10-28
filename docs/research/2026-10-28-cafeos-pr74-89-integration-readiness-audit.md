# CafeOS — Product Integration Readiness Audit, PR #74–#89

**Audit date:** 2026-10-28 (Asia/Ho_Chi_Minh)  
**Repository:** `ShenJun93/cafeos-analyzer`  
**Observed review head:** PR #89 at `04b0b5cddf110465d0cf91720f4815e5e917772a`  
**Scope:** read-only GitHub PR/code/CI review; existing dated repository staging receipts. **No fresh staging query was performed in this audit.**  
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
| E-04 | The reviewed staging had 7 legacy migration receipts; the current PR #89 tree has **11 candidate Git migrations** (#75 adds unpaid-void SQL beyond the 10 in the earlier #74 report). Future-day-close and price-snapshot guards were absent at the dated live checkpoint | Dated live staging read-only review: `docs/research/2026-10-28-cafeos-staging-readonly-gate-refresh.md` | High for that checkpoint only; **not re-queried today for this audit** |
| E-05 | Staging security adviser still warned on 3 privileged commerce RPCs and leaked-password protection | Same dated staging read-only review | Historical read-only observation, independent signoff NOT DONE |
| E-06 | Off-host age recovery requires separate-device key custody, plus full compatible backup and restore | `docs/research/2026-10-28-cafeos-offhost-age-acceptance-runbook.md` | Owner action NOT PROVEN; synthetic drill cannot substitute |
| E-07 | No verified external POS source-account lifecycle, transaction mapping or finance authority | `docs/superpowers/specs/2026-10-28-cafeos-transaction-identity-evidence-contract-v1.md`; PR #81 vendor evidence | Source gap, not a claim of global vendor impossibility |
| E-08 | HQ list at PR #89 requests 26 Store rows without exact PostgREST count | `server/commerce/hq-source-coverage.mjs` at `04b0b5c…` | Verified application correctness risk: a lower upstream row cap could hide Store rows |
| E-09 | A bounded exact-count option already exists in backend auth helper | `api/_app-auth.mjs` / PR #82 | Reusable without schema migration or service key |

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
