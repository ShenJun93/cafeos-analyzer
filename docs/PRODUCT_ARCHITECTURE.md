# CafeOS Product Architecture

## Positioning

CafeOS is a **multi-location café operating + customer intelligence layer** that integrates with existing POS and digital systems.

The product boundary is intentionally asymmetric:

- commodity transaction execution stays with established POS/order/payment systems where possible;
- CafeOS owns the cross-system model, evidence, decision workflow, customer/store intelligence and measurement loop.

## Layer model

### Layer 0 — Existing systems

Examples:

- POS / cashier
- online ordering / delivery
- payment
- loyalty/member systems
- inventory/accounting
- staff scheduling

CafeOS does not assume it is the system of record for all of these domains.

### Layer 1 — Data Foundation

Responsibilities:

- CSV/XLSX and API connectors;
- tenant/store/source namespaces;
- canonical transaction, product, store and customer models;
- deterministic customer identity rules;
- idempotent imports;
- consent/privacy metadata;
- source lineage and evidence pointers;
- data-health and reconciliation.

Existing CafeOS Analyzer work belongs primarily here.

### Layer 2 — HQ / Owner Control Tower

Primary surfaces:

- Daily CEO / Owner Brief
- Store Health board
- revenue/order/AOV/customer-frequency movement
- store/daypart/product anomalies
- data-health warnings
- evidence drill-down
- decision/action queue

The control tower should answer “what changed and where should I look first?” without requiring the operator to build dashboards.

### Layer 3 — Customer Intelligence

Capabilities:

- Customer 360
- new / active / regular / VIP / at-risk / churned lifecycle states
- visit frequency and recency
- spend / AOV / product preferences
- customer-identification coverage
- deterministic segment definitions
- retention/cohort views
- cross-channel customer profile where lawful and technically supported

No fuzzy identity merging.

### Layer 4 — Growth & Experimentation

Capabilities:

- segment selection
- offer/campaign hypothesis
- treatment/control assignment
- exposure/conversion tracking
- incremental revenue/gross-profit measurement
- campaign outcome comparison
- export/integration to delivery channels

Initial versions may export segments/actions rather than send SMS/Zalo/email directly.

### Layer 5 — Store Operations

Capabilities considered after Control Tower evidence exists:

- exception-to-task workflow
- branch follow-up queue
- SOP/checklist execution
- store-level accountability
- recurring issue tracking
- quality/standards evidence

This layer should connect operational action back to measurable outcomes, not become a generic task manager.

### Layer 6 — Customer Experience

Later, evidence-gated capabilities may include:

- membership/member portal
- personalized benefits
- loyalty integration
- order-ahead / pickup
- gift/points
- owned ordering surface

These are not Phase 1 requirements because established café/POS ecosystems already execute many of these workflows.

## System boundaries

### CafeOS should own

- canonical cross-source data model;
- metric definitions;
- identity rules;
- evidence/lineage;
- anomaly and customer/store health semantics;
- decision/action history;
- experiment/incrementality measurement.

### Prefer integration over rebuilding

- POS checkout;
- kitchen/bar routing;
- payment acquiring;
- e-invoicing;
- inventory ledger;
- payroll/accounting;
- delivery fleet;
- commodity loyalty balance engines.

## AI boundary

AI may:

- translate natural-language business questions into a validated metric/intent plan;
- summarize deterministic results;
- propose investigation/action options;
- explain evidence in Vietnamese.

AI may not:

- invent or alter numeric metrics;
- run arbitrary unvalidated SQL over tenant data;
- fuzzy-merge customer identities;
- autonomously send consequential campaigns or change operational systems without a bounded approval policy.

## Primary next-product shape

The next actual CafeOS product is **CafeOS Control Tower**, not “Analyzer v0.2.”

Minimum product skeleton:

1. persistent tenant/store model;
2. repeatable ingestion from file and then selected POS connectors;
3. Daily Brief;
4. Store Health;
5. Customer 360 / lifecycle;
6. at-risk/attention segments;
7. action queue with evidence;
8. measurement of follow-up outcomes.

Analyzer remains the bootstrap path into this system.
