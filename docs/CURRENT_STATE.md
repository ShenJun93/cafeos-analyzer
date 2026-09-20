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
- Vercel deployment `dpl_FCQpJRX5CXBYFiMHA6yp1Hw4ttHV` is READY / production and is sourced from canonical commit `5ba5ae133b6e6b99bedd6dfa0eeced1d6643ede5`.
- post-deploy GET smoke verified `/`, `/analyzer`, and `/api/health` with HTTP 200; health reports `mode=public-validation`, `persistence=none`, and `maxUploadBytes=4194304`.
- no Vercel runtime error clusters were present during the post-deploy verification window.

## Product boundary

CafeOS Analyzer is an intelligence overlay for existing café POS systems. It is not a POS replacement.

## Evidence boundary

Public GitHub may collect schema/header/count metadata and compatibility profiles only. Raw merchant exports, PII, private field-validation records, willingness-to-pay notes and contact information must remain outside the public repository.

## Unverified product state

- Real-merchant repeat usage, continuous-sync intent, and willingness to pay remain field-validation questions.
- The live production validation surface does not establish product-market fit.
- The known fixture POST contract is covered by committed-dist tests; an independent post-deploy live POST smoke remains a release-verification item.

Do not represent product-market fit as established.
