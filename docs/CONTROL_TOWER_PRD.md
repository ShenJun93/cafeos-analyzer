# CafeOS Control Tower — Product PRD v0.1

## Purpose

Turn the existing CafeOS data foundation into a persistent operating loop for a multi-location café owner/HQ team.

Control Tower is the first product module intended to represent the broader CafeOS mission. It is not a prettier Analyzer report.

## Target user

Primary: owner/operator or HQ manager of a café brand with roughly **3–15 locations**.

Secondary later: area manager, marketing/CRM operator, store manager.

## Core jobs

### J1 — Morning operating state

> “Before I start the day, tell me what changed across my stores and what deserves attention.”

The system should surface material changes, evidence and data-health caveats without requiring dashboard construction.

### J2 — Store comparison

> “Which store is under/over-performing relative to a fair baseline, and why?”

Comparison must normalize scope and expose period/daypart/store evidence.

### J3 — Customer health

> “Which valuable customers are becoming less active, and what behavior changed?”

Only when deterministic identity coverage is sufficient.

### J4 — Decision/action ownership

> “Turn this issue into an owned follow-up so it does not disappear after I read the report.”

Insights must be convertible into bounded actions.

### J5 — Outcome measurement

> “After we acted, did the relevant metric improve?”

The system must preserve the decision/action context and compare the measured outcome using deterministic metrics.

## MVP product surfaces

### 1. Daily Brief

Shows:

- data freshness/coverage;
- revenue/orders/AOV movement;
- store attention list;
- daypart/product/customer signals where supported;
- unresolved actions;
- evidence links.

### 2. Store Health

For each store:

- current vs baseline metrics;
- recent trend;
- daypart/product decomposition;
- customer coverage;
- active anomalies;
- unresolved actions.

### 3. Customer 360

When identity data supports it:

- recency;
- frequency;
- spend;
- AOV;
- first/last seen;
- preferred products/categories;
- lifecycle state;
- visit-frequency change;
- segment membership;
- evidence transactions.

### 4. Attention / Action Queue

An attention item can be:

- investigate;
- assign/follow up;
- convert to a customer segment;
- create an experiment hypothesis;
- dismiss with a required reason.

Each action stores:

- tenant/store/customer/product scope;
- originating evidence;
- owner;
- status;
- created/resolved time;
- expected metric/outcome;
- resolution note;
- follow-up measurement window.

### 5. Decision Detail

Shows:

- what triggered the decision;
- baseline/current values;
- evidence;
- chosen action;
- owner/history;
- measured result when available.

## Thin vertical slice

The first Control Tower implementation should prove this exact loop:

1. ingest permissioned café data using existing Analyzer/file ingestion;
2. persist tenant/store/transaction/customer state;
3. generate a Daily Brief from deterministic metrics;
4. open one anomaly/attention item;
5. create one persistent action from it;
6. resolve the action with a bounded outcome hypothesis;
7. measure the relevant metric in a later period;
8. show the before/after evidence without claiming causality unless an experiment design supports it.

This slice is more important than adding more detector types.

## Data dependencies

Reuse existing canonical transaction semantics.

Add/promote persistent concepts:

- Tenant / Brand / Store
- Customer / CustomerIdentifier
- Import / Source / Lineage
- MetricSnapshot
- AttentionItem
- Decision
- Action
- ActionStatusHistory
- MeasurementWindow
- Segment
- later: Experiment / Assignment / Exposure / Conversion

## Non-goals for Control Tower v0.1

- POS checkout
- payment processing
- kitchen/bar routing
- inventory ledger
- payroll/accounting
- general task/project management
- direct SMS/Zalo/email sending
- autonomous campaign execution
- native mobile app
- generic BI dashboard builder

## AI boundary

Allowed:

- Vietnamese explanation of deterministic metrics;
- summarization of evidence;
- natural-language navigation/query planning into a validated metric DSL;
- suggested investigation/action options.

Not allowed:

- creating/modifying numeric metrics;
- arbitrary SQL execution;
- fuzzy identity matching;
- unsupported causal diagnosis;
- consequential external action without bounded approval.

## Trust requirements

Every attention item and business statement must expose:

- scope;
- current value;
- baseline/comparison;
- data coverage;
- confidence where applicable;
- evidence pointer;
- data-health limitations.

## Success evidence

The MVP is not successful because the UI exists.

Product evidence should include:

- owner/HQ can reconcile data and trust core metrics;
- Daily Brief identifies at least one issue/opportunity the user considers useful;
- user converts at least one insight into an action;
- user returns to review/close the action;
- user checks the measured result later;
- repeat use is desired for the **Control Tower loop**, not just file analysis.

## Build gate

Do not add Phase 2 growth automation until the Control Tower thin slice has evidence that `UNDERSTAND → ACT → MEASURE` is useful in real operator workflow.
