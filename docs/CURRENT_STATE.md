# Current state

Canonical authority: this repository's `main` branch, tests, CI, and technical specifications. Product-level mission authority is defined by `MISSION.md`.

## Product mission state

CafeOS is now explicitly defined as the **operating and customer-intelligence layer for multi-location café brands**, sitting above existing POS/order/payment/loyalty systems where integration is preferable to replacement.

CafeOS Analyzer is a module/wedge inside that product. It must not be treated as the whole CafeOS mission.

See:

- `MISSION.md`
- `docs/PRODUCT_ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/research/WAVE_19_PRODUCT_MISSION_REALIGNMENT.md`

## Verified Analyzer technical state

- CSV/XLSX ingestion and workbook selection implemented.
- Vietnamese and vendor-style header mapping with manual fallback implemented.
- deterministic metrics and known-answer fixtures implemented.
- store/daypart anomaly evidence implemented.
- split/overlapping import idempotency implemented.
- privacy-preserving compatibility/profile tooling implemented.
- Postgres/Supabase RLS persistence contract present.
- public Vercel request surface and local Windows validation kit present.
- privacy-safe public compatibility intake is defined for schema-only POS export evidence.
- public Analyzer is live at `https://cafeos-analyzer.vercel.app`.
- deterministic live verification has passed GET/health/known-fixture POST/>4 MiB rejection.

## Product boundary

Do not build a generic POS clone. Existing POS/order/payment/inventory/accounting systems should remain systems of execution where they are already strong.

CafeOS should own the cross-system canonical model, evidence, HQ/customer intelligence, action history and measurement loop.

## Technical gate

Analyzer deployment plumbing is CLOSED. Do not spend the next cycle expanding Analyzer/SEO unless new evidence exposes a concrete blocker.

## Unverified product state

- CafeOS Control Tower demand and workflow fit are not yet validated.
- Real-merchant repeat usage, continuous-sync intent and willingness to pay remain unverified.
- Analyzer evidence tests the data/intelligence wedge; it does not establish product-market fit for the full CafeOS roadmap.

## Next action

Control Tower mission/PRD/reuse mapping/thin-slice design are now defined.

Control Tower schema contract at `db/contracts/control_tower_core.sql` has now passed **real isolated Supabase staging verification**.

Verified on `cafeos-staging`:

- schema applies on top of Analyzer baseline;
- Tenant A cannot read Tenant B;
- viewer writes are denied;
- owner cross-tenant writes are denied;
- composite tenant FKs reject cross-tenant references;
- action insert creates audit history;
- customer matching identifiers remain server-only;
- measurement values remain server-owned;
- legacy import idempotency remains intact;
- Security Advisor has 0 findings after fixes;
- Performance Advisor has no unindexed-FK findings after fixes.

Only fresh-staging `unused_index` INFO notices remain and are not treated as defects.

See `docs/research/WAVE_22_SUPABASE_STAGING_VERIFICATION.md`.

The contract is intentionally still **not a migration-history artifact** because the current execution environment has no working Supabase CLI. Do not invent a migration filename.

Next checkpoint:

1. create the migration through the Supabase CLI workflow in an environment with a working CLI;
2. reconcile the CLI-generated migration with the staging-verified contract;
3. rerun DB/RLS tests from migration state;
4. commit migration + DB test evidence;
5. do **not** mutate production or ingest real merchant data yet;
6. after migration acceptance, build authenticated `/api/app/*` and `/app` shell.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.