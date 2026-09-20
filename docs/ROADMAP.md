# CafeOS Roadmap

## Roadmap principle

Build the smallest sequence that proves the full CafeOS loop:

`CONNECT → UNIFY → UNDERSTAND → ACT → MEASURE`

Do not sequence work by “feature completeness.” Sequence it by uncertainty reduction and business leverage.

## Phase 0 — Analyzer / Data Foundation

Status: **technical wedge exists**

Already built:

- CSV/XLSX ingestion;
- deterministic mapping/normalization;
- canonical transaction model;
- deterministic metrics;
- store/daypart anomaly evidence;
- customer-identification coverage;
- idempotency;
- privacy-safe validation tooling;
- live public Analyzer.

Role going forward:

- acquisition/onboarding;
- compatibility discovery;
- reconciliation;
- fallback import path;
- fixture/test harness.

Do not keep expanding Analyzer as a standalone product unless field evidence exposes a concrete blocker.

## Phase 1 — CafeOS Control Tower

Goal: give a multi-location café owner one trustworthy operating view above the existing POS.

### 1A. Persistent business graph

- tenant / brand / store
- product/category
- transaction/order
- customer/customer identifier
- consent/privacy metadata
- metric snapshots
- evidence/source lineage

Use the existing canonical semantics; promote the current static persistence contract into an actually exercised production path only with tenant isolation and migration tests.

### 1B. Repeatable ingestion

Order of preference:

1. permissioned file imports;
2. official POS APIs/connectors where available;
3. scheduled/continuous sync only after connector reliability is proven.

Initial connector candidates should be selected by official API feasibility and target-ICP evidence, not brand prestige.

### 1C. Owner surfaces

- Daily Brief
- Store Health
- Store comparison
- Data Health
- evidence drill-down

### 1D. Customer Intelligence

- Customer 360
- lifecycle states
- recency/frequency/spend
- repeat/retention
- at-risk regulars
- deterministic segments

### 1E. Action queue

An insight must be able to become:

- investigate;
- assign/follow up;
- create a segment;
- create an experiment hypothesis;
- dismiss with reason.

This is the first point where CafeOS becomes an operating system rather than a report.

### Phase 1 exit evidence

Before broadening:

- at least several real target-ICP operators can ingest/reconcile data;
- Daily Brief/Store Health produces decisions they consider useful;
- at least one recurring action loop is observed;
- users express repeat-use intent for the Control Tower, not only the Analyzer.

## Phase 2 — Revenue Loop

Goal: close `ACT → MEASURE`.

Build:

- segment builder;
- campaign/offer hypothesis;
- treatment/control groups;
- exposure/conversion data model;
- incremental outcome measurement;
- action/campaign history;
- export/integration to existing messaging/loyalty channels.

North-star candidate: **incremental gross profit generated or retained**, not raw attributed revenue.

Avoid direct campaign sending until consent, delivery integrations and operator approval semantics are proven.

## Phase 3 — Store Operations

Goal: connect recurring business exceptions to store execution.

Possible modules:

- exception-to-task;
- branch checklists;
- SOP evidence;
- issue recurrence;
- cross-store follow-up;
- role-based action ownership.

Do not build generic project management.

## Phase 4 — Customer Experience

Only after the data/customer/growth loop is validated, consider owned guest-facing experiences:

- membership;
- personalized offers;
- order-ahead / pickup;
- gift/points;
- owned ordering;
- app/web member experience.

Prefer integration with existing fulfillment/payment infrastructure.

## Explicitly deferred

Until evidence changes the decision:

- full POS replacement;
- payment processing;
- KDS clone;
- full inventory/accounting/payroll;
- generic ERP;
- broad AI chat as a product;
- native mobile app solely for parity;
- fully autonomous campaign execution.

## Immediate next batch

1. realign canonical mission/docs;
2. research/score Control Tower jobs against current café/POS landscape;
3. define Control Tower PRD separately from Analyzer PRD;
4. map existing code/data model to reusable foundation vs Analyzer-only pieces;
5. build only the thinnest vertical slice that turns an existing Analyzer insight into a persistent HQ decision/action loop.
