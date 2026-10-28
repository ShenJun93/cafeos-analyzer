# CafeOS Roadmap

## Roadmap principle

CafeOS is a full café operating ecosystem, but it should be built as **vertical operating loops**, not a feature-completeness checklist.

Each phase must produce a usable end-to-end workflow and preserve deterministic business truth.

## Phase 0 — Analyzer / external data foundation

Status: **live technical wedge**

Already built:

- CSV/XLSX ingestion;
- deterministic mapping/normalization;
- canonical imported transaction model;
- deterministic metrics;
- Store/Customer promotion primitives;
- tenant/RLS foundation;
- Store Health / Daily Brief read model;
- Attention → Action → Measurement workflow;
- privacy-safe validation tooling;
- public Analyzer.

Role going forward:

- acquisition/onboarding;
- external POS compatibility;
- migration/reconciliation;
- connector fallback;
- validation/fixture harness.

Analyzer is not the full CafeOS product.

## Phase 1 — Core Commerce / CafeOS POS

Status: **current implementation priority**

Goal: create the first first-party operating spine:

\`Menu → POS Order → Payment Record → Daily Close → Dashboard → Control Tower handoff\`

### 1A. Menu

- categories;
- items;
- price;
- active state;
- tenant-safe management.

### 1B. POS order

- Store selection;
- menu cart;
- idempotent order creation;
- server-owned price snapshots;
- bounded channel/status lifecycle.

### 1C. Payment record

- cash/card/bank transfer/wallet/other;
- exact-balance capture in v1;
- settlement evidence only;
- no acquiring or card-token processing yet.

### 1D. Daily close

- deterministic order/payment summary;
- block close when open orders remain;
- one immutable close per Store/business date.

### 1E. Authenticated CafeOS app shell

- POS;
- Menu;
- Dashboard;
- Daily Close;
- Control Tower;
- Analyzer.

### Phase 1 exit evidence

- schema/RLS verified in staging;
- cashier/manager/viewer role boundaries verified;
- duplicate order submission is idempotent;
- synthetic Menu → Order → Payment → Close passes;
- no regression to Analyzer/Control Tower;
- operator can complete the flow without hidden admin steps.

## Phase 1.1 — Unified operating read-model

Goal: let Control Tower consume both:

- CafeOS-native paid orders; and
- external/imported transaction facts.

Requirements:

- preserve source namespace/lineage;
- no fake imports;
- common Store/business-date semantics;
- shared deterministic net sales/orders/AOV definitions;
- comparable freshness/coverage.

## Phase 2 — Inventory + Finance foundation

Goal: connect what was sold to what was consumed and settled.

Build in small slices:

- ingredients/items;
- recipes;
- stock receipts/transfers;
- theoretical depletion;
- variance;
- payment reconciliation;
- COGS/gross margin;
- bounded expense view.

Do not attempt full accounting/ERP in one pass.

## Phase 3 — Customers + Loyalty

Goal: connect first-party commerce to retention.

- Customer 360;
- deterministic identifiers;
- member profiles;
- visit frequency/recency/spend;
- points/benefits;
- offers;
- at-risk/retention segments.

## Phase 4 — Staff + Store Operations

Goal: connect operating exceptions to accountable execution.

- staff directory;
- roles;
- shifts/attendance;
- exception-to-task;
- SOP/checklists;
- recurring issue evidence;
- cross-store follow-up.

## Phase 5 — Growth & Experimentation

Goal: close ACT → MEASURE for commercial interventions.

- segments;
- offer/campaign hypothesis;
- treatment/control;
- exposure/conversion;
- incremental outcome measurement;
- export/integration to delivery channels.

## Phase 6 — Customer Experience

After the core transaction/identity/operations loops are stable:

- order-ahead/pickup;
- member portal;
- personalized benefits;
- gift/points;
- owned ordering surfaces.

## Cross-cutting constraints

- no LLM-owned numeric truth;
- tenant isolation and RLS are release blockers;
- system-of-record provenance stays explicit;
- primary distribution stays pull/inbound;
- do not add a module without its job, system-of-record boundary and measurable outcome.

## Immediate batch

Implement Core Commerce v1 according to:

- \`docs/superpowers/specs/2026-10-25-cafeos-core-commerce-v1-design.md\`;
- \`docs/superpowers/plans/2026-10-25-cafeos-core-commerce-v1.md\`.

Production merchant data remains blocked until staging migration/advisor/synthetic acceptance gates pass.
