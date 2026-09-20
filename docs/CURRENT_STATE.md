# Current state

Canonical authority: this repository's `main` branch, tests, CI, and technical specifications.

## Verified technical state

- CSV/XLSX ingestion and workbook selection implemented.
- Vietnamese and vendor-style header mapping with manual fallback implemented.
- deterministic metrics and known-answer fixtures implemented.
- store/daypart anomaly evidence implemented.
- split/overlapping import idempotency implemented.
- privacy-preserving compatibility/profile tooling implemented.
- Postgres/Supabase RLS persistence contract present.
- public Vercel request surface and local Windows validation kit present.
- privacy-safe public compatibility intake is defined for schema-only POS export evidence.
- public validation deployment is live at `https://cafeos-analyzer.vercel.app`.
- current production deployment `dpl_DBRM2pVwmrsg7XUifnqFUcn8mk5e` is `READY`, sourced from canonical `main` commit `7b32355174a419627f7ab6a98140c780bf8f4e86`.
- deterministic live verification passed on 2026-09-20:
  - GET `/` → 200
  - GET `/analyzer` → 200
  - GET `/api/health` → 200 with `mode=public-validation`, `persistence=none`, `maxUploadBytes=4194304`
  - POST known fixture → 97 orders, 4,850,000 VND net sales, 97 valid items
  - request larger than 4 MiB → 413
- post-verification Vercel runtime scan found no runtime error clusters.

## Product boundary

CafeOS Analyzer is an intelligence overlay for existing café POS systems. It is not a POS replacement.

## Evidence boundary

Public GitHub may collect schema/header/count metadata and compatibility profiles only. Raw merchant exports, PII, private field-validation records, willingness-to-pay notes and contact information must remain outside the public repository.

## Technical gate

The public validation deployment gate is CLOSED. Do not spend the next cycle on deployment plumbing or speculative product expansion unless new evidence exposes a concrete defect.

## Unverified product state

Real-merchant repeat usage, continuous-sync intent, and willingness to pay remain field-validation questions. The live production validation surface does not establish product-market fit.

## Next action

Collect 10–20 permissioned, target-ICP field-validation sessions through pull/inbound distribution. Preserve the locked scorecard order:

1. import success;
2. source reconciliation / metric trust;
3. useful or new insight;
4. repeat-use intent;
5. continuous-sync intent;
6. willingness to pay only after value is demonstrated.

Do not use cold email, cold DM, cold calls, manual prospecting, founder-led enterprise sales, negotiated pilots, or recurring networking as the primary acquisition mechanism.
