# PRD v0.1 — CafeOS Analyzer

## Target user
Owner/operator of a 3–15 location café chain.

## Primary job
Upload an existing sales export and learn what changed, where it changed, why the observed metric changed, and which source rows support the conclusion.

## Product boundary
V0.1 includes file ingestion, mapping, validation, deterministic metrics, data health, store/product/customer analysis, anomaly detection and an executive brief. It excludes realtime POS sync, campaign delivery, loyalty execution, payment, inventory, accounting, KDS, payroll and native mobile apps.

## Primary journey
Upload → inspect workbook/file → map columns → validate → normalize → calculate metrics → detect material changes → executive brief → evidence drill-down.

## Acceptance gates
Metric aggregates must reproduce source totals within ±0.1%; counts and identity joins must be exact; reimport must be idempotent; bad files must not corrupt existing data; unsupported conclusions must be suppressed.
