# Module PRD v0.1 — CafeOS Analyzer

> **Authority note:** This document defines the Analyzer module only. It does not define the whole CafeOS product. Product mission and module hierarchy are defined in `MISSION.md`, `docs/PRODUCT_ARCHITECTURE.md` and `docs/ROADMAP.md`.

## Target user

Owner/operator of a 3–15 location café chain.

## Module job

Provide a low-friction file-based path into the CafeOS data/intelligence layer: upload an existing sales export, reconcile business truth, identify material changes, and expose supporting evidence.

## Role inside CafeOS

Analyzer serves:

- acquisition and low-friction trial;
- data compatibility discovery;
- onboarding before continuous connectors exist;
- reconciliation/data-quality validation;
- deterministic analytics fallback;
- test/fixture infrastructure for the broader CafeOS data foundation.

Analyzer is **not** the final CafeOS product.

## Module boundary

V0.1 includes file ingestion, mapping, validation, deterministic metrics, data health, store/product/customer analysis, anomaly detection and an executive brief.

It excludes realtime POS sync, campaign delivery, loyalty execution, payment, inventory, accounting, KDS, payroll and native mobile apps. Those exclusions are module boundaries, not a permanent ban on separate evidence-gated CafeOS modules.

## Primary journey

Upload → inspect workbook/file → map columns → validate → normalize → calculate metrics → detect material changes → executive brief → evidence drill-down.

## Acceptance gates

Metric aggregates must reproduce source totals within ±0.1%; counts and identity joins must be exact; reimport must be idempotent; bad files must not corrupt existing data; unsupported conclusions must be suppressed.
