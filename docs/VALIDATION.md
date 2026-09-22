# Validation plan v0.1

## Technical gates
- ≥90% common-column auto-mapping on representative exports
- source aggregate reproduction within ±0.1%
- exact counts, identity and idempotency
- every insight drills to source evidence
- 100k-row dataset remains usable
- cross-tenant reads are impossible

## Product gates after 10–20 real permissioned target-ICP sessions

A scoreable target session requires an owner/operator participant, 3–15 café locations, and explicit validation-evidence permission.
- successful import ≥80%
- metric trust ≥90%
- useful/new insight ≥60%
- repeat usage intent ≥40%
- continuous-sync intent ≥25%
- clear willingness to pay ≥20% of value-demonstrated sessions where WTP was asked

If useful insight or repeat intent fails materially, stop or pivot rather than expanding the suite.

## Wave 6 evidence
- CSV/XLSX golden metric parity: PASS
- multi-sheet candidate selection: PASS
- ambiguous workbook requires explicit choice: PASS
- overlapping export idempotency semantics: PASS
- tenant/source separation in import ledger: PASS
- RLS/idempotency migration contract static checks: PASS
- local upload API smoke test: PASS
- 100k-row synthetic CSV: ~0.53s observed on the Wave 6 runtime (directional only)

## Wave 7 evidence
- KiotViet-style synthetic header vocabulary: AUTO-MAP PASS
- CUKCUK-style synthetic header vocabulary: AUTO-MAP PASS
- POS365-style synthetic header vocabulary: AUTO-MAP PASS
- unknown-header automatic analysis: BLOCKED AS DESIGNED
- explicit manual mapping fallback: PASS
- duplicate source-column mapping validation: PASS
- HTTP inspection + mapped-analysis smoke path: PASS

## Wave 9 evidence
- no-PII inbound record model: PASS
- target-ICP derivation from owner/operator role + 3–15 stores: PASS
- acquisition funnel deduplication by anonymous session: PASS
- acquisition and field-validation scorecards remain separated: PASS
- Free Cafe Sales Analyzer landing route: HTTP SMOKE PASS
- synthetic sample-report route: HTTP SMOKE PASS
- no-contact feedback route: HTTP SMOKE PASS
- schema-only `/api/profile` route on vendor-style fixture: HTTP SMOKE PASS
- test suite: 31/31 PASS

Acquisition funnel rates are descriptive only. Do not invent conversion thresholds before real baseline traffic exists.
