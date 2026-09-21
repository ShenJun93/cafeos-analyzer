# Current state

Canonical authority: this repository's `main` branch, tests, CI, and technical specifications. Product-level mission authority is defined by `MISSION.md`.

## Product mission state

CafeOS is the **operating and customer-intelligence layer for multi-location café brands** above existing POS/order/payment/loyalty systems. CafeOS Analyzer remains a module/wedge, not the whole product.

## Verified Analyzer technical state

- CSV/XLSX ingestion, mapping, deterministic metrics, data health and evidence-backed anomalies.
- overlap-safe/idempotent imports and privacy-safe compatibility tooling.
- live Analyzer at `https://cafeos-analyzer.vercel.app` with live GET/health/known-fixture POST/>4 MiB verification passed.

## Verified Control Tower database state

The first persistent Control Tower schema now has three verification layers:

1. repository contract: `db/contracts/control_tower_core.sql` + static contract tests;
2. isolated cloud staging: `cafeos-staging` passed real RLS/integrity/advisor verification using synthetic data only;
3. reproducible migration CI: Supabase CLI `2.117.0` generated ordered migrations and GitHub Actions successfully applied them from a blank local Supabase database before running `supabase test db`.

CLI-generated migrations:

- `supabase/migrations/20260921005530_analyzer_core.sql`
- `supabase/migrations/20260921005532_control_tower_core.sql`

`tests/supabase-migration-sync.test.mjs` keeps migration contents byte-equivalent to their canonical source/contract.

Verified properties include tenant isolation, bounded role writes, composite tenant foreign keys, DB-enforced action audit history, server-only customer matching identifiers, server-owned trusted attention/measurement values, and preserved import idempotency.

Staging Security Advisor has 0 findings after hardening and no unindexed-FK findings remain. Fresh-staging unused-index INFO notices are not treated as evidence for index removal.

## Product boundary

Do not build a generic POS clone. CafeOS owns the cross-system canonical model, evidence, HQ/customer intelligence, action history and measurement loop.

## Still prohibited

- no production Control Tower database mutation;
- no real merchant data in Control Tower persistence;
- no browser/client service-role key;
- no fuzzy customer identity;
- no consequential autonomous campaign execution.

Before production merchant data, retention/deletion behavior and rollback/recovery must be defined and verified.

## Closed database gate

Wave 24 closed schema/migration reproducibility and tenant-integrity verification.

A staging behavioral test found a legacy cross-tenant import-lineage gap that static review had missed. It is now fixed with a composite `(tenant_id, first_import_id) → imports(tenant_id, id)` foreign key and covering index. Staging targeted tests, Security Advisor, repository CI and blank-database Supabase pgTAP CI all pass.

## Current implementation checkpoint

Wave 25 introduces an **authenticated read-only Control Tower API shell against staging/synthetic data only**:

- `GET /api/app/session`
- `GET /api/app/stores`
- `GET /api/app/attention`
- `GET /api/app/brief`

The shell uses only Supabase URL + publishable key plus the caller's user JWT. It verifies selected-tenant membership and leaves RLS as the final database authorization boundary. No secret/service-role credential is used for user reads.

The brief read shell does not yet claim persisted deterministic top metrics; that capability remains explicitly false until implemented.

See `docs/CONTROL_TOWER_AUTH_SHELL.md`.

## Next action

1. pass normal CI + Supabase DB CI for the read shell;
2. configure staging-safe Vercel env vars only;
3. verify unauthenticated live shell returns 401;
4. use synthetic Auth users to verify authenticated tenant isolation end-to-end;
5. then implement deterministic Daily Brief/Store Health metrics;
6. only after read-path evidence, add bounded Attention → Action → Measurement writes.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.