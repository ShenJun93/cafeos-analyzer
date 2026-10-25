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
- The Core Commerce migration is present on **cafeos-staging** (`wjatnyvdygvblirggdcm`); all six Commerce tables have RLS enabled. The staging migration record uses version `20261025103648`, while Git has `20261025094352`. Their applied SQL statement and canonical contract SQL are **byte-identical** (29,843 characters). Reconcile migration history safely before a future CLI promotion; do not blindly reapply.
- Direct staging pgTAP result: **26/26 PASS** after extending `supabase/tests/database/core_commerce_v1.test.sql` in commit `e6b8cc2`. The test transaction was rolled back; synthetic test tenants were absent afterwards. Assertions cover cross-tenant menu visibility, viewer/payment denial, manager menu authoring, cashier menu/close denial, idempotent orders, exact payment, and daily close.
- Security Advisor reports three `authenticated_security_definer_function_executable` warnings for intentional order/payment/close RPCs; live SQL confirms `anon` cannot execute, `authenticated` can execute, and functions check `auth.uid()` and role through `private.has_tenant_role`. These are **warnings to review**, not an independently completed security sign-off. Leaked-password protection is separately disabled.
- Exact-head GitHub CI and Supabase DB CI must both pass after each branch update. Local/browser visual QA at 390px and 1200px, authenticated real-transport synthetic E2E and independent security review are **not yet accepted**. Neither PR merge nor production DB/application promotion is authorized.

## Next engineering action

1. Confirm exact-head CI + blank-database pgTAP on PR #74; record failures at the actual HEAD, not at earlier commits.
2. Verify authenticated synthetic-user API/UI flow on a staging/preview endpoint and review `/app` at 390px and 1200px, including no horizontal overflow, cashier affordances and source labels.
3. Reconcile Supabase staging migration version with the repository's canonical migration through a supported migration-history workflow before any production promotion.
4. Independently audit privileged RPC role checks, tenant isolation, idempotency, payment correctness and daily-close locking; address advisor findings or record their verified exception rationale.
5. Keep PR #74 draft and production writes disabled until the staged release checklist is complete.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.
