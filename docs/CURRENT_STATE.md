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
- privacy-safe public compatibility intake is defined for schema-only POS export evidence.

## Product boundary

CafeOS Analyzer is an intelligence overlay for existing café POS systems. It is not a POS replacement.

## Evidence boundary

Public GitHub may collect schema/header/count metadata and compatibility profiles only. Raw merchant exports, PII, private field-validation records, willingness-to-pay notes and contact information must remain outside the public repository.

## Unverified product state

Real-merchant repeat usage, continuous-sync intent, and willingness to pay remain field-validation questions. Do not represent product-market fit as established.
