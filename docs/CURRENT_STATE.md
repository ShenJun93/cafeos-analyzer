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

Move from Analyzer-centric work to **CafeOS Control Tower product discovery and thin-slice design**:

1. score the highest-leverage HQ/customer jobs against current café/POS capabilities;
2. define a separate Control Tower PRD;
3. map existing Analyzer/data code into reusable foundation vs module-only code;
4. design the thinnest persistent loop: `ingest → Daily Brief/Store Health → decision/action → measured follow-up`;
5. preserve real target-ICP field validation, but interpret it as evidence for the relevant product layer rather than as authority to shrink CafeOS back into an Excel tool.

Primary distribution remains pull/inbound; no dependency on cold outbound sales.
