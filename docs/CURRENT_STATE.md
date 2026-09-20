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
- public Vercel-shaped request surface and local Windows validation kit present.

## Product boundary

CafeOS Analyzer is an intelligence overlay for existing café POS systems. It is not a POS replacement.

## Unverified product state

Real-merchant repeat usage, continuous-sync intent, and willingness to pay remain field-validation questions. Do not represent product-market fit as established.
