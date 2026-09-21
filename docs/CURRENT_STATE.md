# Current state

Canonical authority: this repository's `main` branch, tests, CI, and technical specifications. Product-level mission authority is defined by `MISSION.md`.

## Product mission state

CafeOS is the **operating and customer-intelligence layer for multi-location café brands** above existing POS/order/payment/loyalty systems. CafeOS Analyzer remains a module/wedge, not the whole product.

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

Do not build a generic POS clone. CafeOS owns the cross-system canonical model, evidence, HQ/customer intelligence, action history and measurement loop.

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

## Next engineering action

Follow `docs/ROADMAP.md` and issue #11:

1. implement **Store Health** by reusing the same deterministic metric/timezone/order semantics rather than creating a second metric definition;
2. then add one bounded `Attention → Action → Measurement` workflow path;
3. only after the thin loop is usable, collect permissioned target-ICP evidence for usefulness, action conversion, return/review behavior and repeat-use intent.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.
