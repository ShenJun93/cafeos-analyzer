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

## Current external gate

Wave 25 read-shell code is merged, main CI is green, production auto-deploy is READY, and unauthenticated live `/api/app/session` returns `401 AUTH_REQUIRED`.

Issue #19 remains open because full authenticated preview evidence still requires:

- Vercel preview-only `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`;
- a synthetic Supabase Auth user;
- synthetic allowed/forbidden tenant memberships;
- live proof of authenticated 200 / cross-tenant 403 / invalid-JWT 401.

Wave 26 adds a guarded preview-only launcher and repeatable smoke verifier. It does not itself count as E2E evidence.

See `docs/CONTROL_TOWER_PREVIEW_SMOKE.md`.

## Daily Brief design gate

Wave 27 design review is allowed to proceed while issue #19 remains externally blocked, but implementation remains blocked.

The review found two correctness prerequisites before persisted Daily Brief / Store Health metrics can be authoritative:

1. timestamp semantics must distinguish real instants from naive source-local wall clocks and derive business date/daypart in Store timezone;
2. order identity must be source-scoped, not `transaction_id` alone.

The initial Daily Brief baseline is designed as the selected business date versus the same weekday over the previous four weeks, with exact baseline dates and insufficient-history status exposed.

See:
- `docs/DAILY_BRIEF_READ_MODEL_DESIGN.md`
- GitHub issue #21

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

1. run the Wave 26 guarded preview launcher from canonical local `main` when Vercel CLI access is available;
2. create/use supported synthetic Supabase Auth identities;
3. close issue #19 only after live authenticated 200/403/401 evidence;
4. fix issue #21 timestamp/order-identity correctness;
5. implement a fixed RLS-safe Daily Brief aggregate read function;
6. add issue #23 tenant-deletion/session-revocation DB tests before production persistence;
7. perform a restore drill before authorizing the first merchant production tenant;
8. only after read-path evidence, add bounded Attention → Action → Measurement writes.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.