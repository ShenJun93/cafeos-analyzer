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

The Daily Brief read path now uses the fixed caller-RLS Postgres aggregate for deterministic net sales, orders and AOV. It exposes business-date freshness, coverage, exact same-weekday baseline dates/status, persisted Attention, and unresolved Actions without transferring raw tenant transaction history to Vercel.

See `docs/CONTROL_TOWER_AUTH_SHELL.md`.

## Current external gate

Issue #19 authenticated preview E2E is closed. Synthetic staging proved:

- unauthenticated session → `401 AUTH_REQUIRED`;
- authenticated synthetic Tenant A reads → `200`;
- Tenant A selecting Tenant B → `403 TENANT_FORBIDDEN`;
- invalid JWT → `401 AUTH_INVALID`;
- no service-role/secret credential in the user-facing read path.

Issue #36 is also closed: the fixed `public.daily_brief_aggregate(uuid,date)` function passed repository CI, blank-database pgTAP, staging migration verification, live caller-RLS Tenant A access, and Tenant B denial.

The current external gate is issue #38: deploy the deterministic `/api/app/brief` wiring to a fresh Vercel preview and re-run the authenticated synthetic smoke with the stronger requirement that the brief returns `deterministicTopMetrics=true`, metrics, and coverage.

See `docs/CONTROL_TOWER_PREVIEW_SMOKE.md`.

## Daily Brief correctness and aggregate state

Issue #21 is closed. The Analyzer/persistent read contract now:

1. distinguishes explicit-offset instants from naive source-local wall clocks;
2. records/validates IANA timezone assumptions;
3. derives business date/daypart in Store timezone;
4. scopes order identity by `(source_namespace, transaction_id)`;
5. uses the exact same weekday over the previous four weeks;
6. emits no authoritative delta when history/coverage is insufficient.

Issue #36 is closed. The first fixed Daily Brief aggregate is `SECURITY INVOKER`, authenticated-only, RLS-preserving, deterministic, and staging-verified.

Issue #38 wires that aggregate into `GET /api/app/brief`.

See:
- `docs/DAILY_BRIEF_READ_MODEL_DESIGN.md`
- GitHub issues #21, #36, #38

## Production data lifecycle gate

Wave 28 defines the deletion/retention/recovery behavior required before real merchant data.

Key locked boundaries:

- public Analyzer upload bytes remain request-transient;
- tenant access is revoked before tenant hard deletion;
- Auth-user deletion is not sufficient by itself because already-issued JWTs may remain valid until expiry;
- user offboarding must remove tenant memberships and terminate sessions before Auth-user deletion;
- staging remains synthetic-only and does not justify paid PITR;
- production must have at least one verified daily/off-site restore point;
- initial design RPO is up to 24 hours with verified daily backups; RTO must be measured by restore drill;
- PITR is optional and requires explicit cost approval;
- no destructive production schema change without backup/recovery evidence.

See:
- `docs/DATA_LIFECYCLE_RECOVERY_DESIGN.md`
- GitHub issue #23

## Next action

1. finish issue #38 repository/preview acceptance for deterministic `GET /api/app/brief`;
2. reuse the same aggregate contract for Store Health rather than creating a second metric definition;
3. add issue #23 tenant-deletion/session-revocation DB tests before production persistence;
4. perform a restore drill before authorizing the first merchant production tenant;
5. only after read-path evidence, add bounded Attention → Action → Measurement writes.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.