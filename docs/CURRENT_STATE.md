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

Next code checkpoint is deliberately narrow:

1. add `db/migrations/002_control_tower_core.sql` as a **schema contract only**;
2. add contract tests for Store/Customer/Attention/Action/Measurement tables, RLS and status constraints;
3. update `docs/DB_MODEL.md`;
4. do **not** mutate a live Supabase project yet;
5. after schema contract acceptance, build the authenticated `/api/app/*` and `/app` shell.

See `docs/CONTROL_TOWER_IMPLEMENTATION_SLICE.md`.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.