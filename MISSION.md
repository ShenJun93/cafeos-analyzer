# CafeOS Mission

## Product mission

Build **CafeOS as a full café operating ecosystem** for café owners and multi-location brands.

CafeOS should be able to own a merchant's first-party operating core where useful, while still integrating with an existing POS or other systems when replacing them is unnecessary.

The product should help an operator repeatedly answer and execute five jobs:

1. **SELL** — capture an order and settlement record correctly.
2. **OPERATE** — run stores, people, inventory, customers and daily close.
3. **UNDERSTAND** — know what is happening and why, with deterministic evidence.
4. **ACT** — turn evidence into bounded operational or commercial action.
5. **MEASURE** — determine what changed after the action.

CafeOS is one product ecosystem, not a collection of unrelated dashboards.

## Deployment modes

CafeOS must support both:

### CafeOS-native operation

CafeOS owns first-party commerce execution such as Menu, CafeOS POS orders, payment records and daily close. Later modules may own inventory, loyalty, staff and additional operational workflows.

### Integrated operation

A merchant can keep an external POS or digital system. Analyzer/connectors ingest and reconcile that source into CafeOS without requiring replacement.

The canonical model and Control Tower must ultimately work across both modes.

## Initial ICP

Primary validation ICP remains café brands with roughly **3–15 locations**.

The architecture may support single-store operators and larger chains later, but sequencing should continue to optimize for owner/HQ operators who need one coherent operating system across locations.

## Core product loops

### First-party commerce loop

\`MENU → ORDER → PAYMENT RECORD → DAILY CLOSE → DASHBOARD\`

### Intelligence/action loop

\`CONNECT → UNIFY → UNDERSTAND → ACT → MEASURE\`

First-party CafeOS transactions and integrated external transactions must eventually converge in a common deterministic read-model without fabricating source lineage.

## Product modules

1. **Platform Core** — auth, tenancy, RBAC, auditability, settings, privacy, APIs, backup/restore and billing.
2. **Core Commerce / CafeOS POS** — menu, first-party orders, payment records, daily close and store sales execution.
3. **Store Operations** — checklists, issue follow-up, standards and recurring execution workflows.
4. **Inventory** — ingredients, recipes, receipts, transfers, depletion, variance and stock visibility.
5. **Customers & Loyalty** — deterministic identity, membership, points/benefits, lifecycle and retention.
6. **Staff** — staff directory, roles, shifts, attendance and operational accountability.
7. **Finance & Reconciliation** — close, payment reconciliation, COGS/margin and bounded operating expense views.
8. **Analyzer** — file import, onboarding, compatibility, reconciliation and legacy/external POS bridge.
9. **Control Tower** — Daily Brief, Store Health, Attention, Action and Measurement.
10. **Integrations** — external POS, ordering, loyalty, payment, accounting and delivery systems.

## Trust model

CafeOS follows these rules across every module:

1. **Numbers are deterministic.** LLM output must not create or alter business metrics, prices, totals, balances or inventory truth.
2. **Insights show evidence.** Scope, comparison baseline, coverage and supporting evidence must be inspectable.
3. **Missing data degrades capability explicitly.** Do not fabricate precision.
4. **Tenant isolation is a release blocker.**
5. **System-of-record boundaries stay explicit.** CafeOS-native facts and imported facts must preserve provenance.

## What is not complete in Core Commerce v1

The full ecosystem is the canonical direction, but the first commerce slice does **not** claim completion of:

- payment acquiring or card-token processing;
- refunds/split payment;
- KDS/bar routing;
- modifiers/toppings/combos;
- full inventory/recipe depletion;
- loyalty execution;
- payroll;
- full accounting/ERP;
- e-invoicing;
- delivery dispatch;
- offline-first native POS.

These are deferred/later modules or slices, not rejected directions.

## Role of CafeOS Analyzer

**CafeOS Analyzer is a module and wedge, not the CafeOS product.**

Its jobs are:

- low-friction acquisition;
- file-based onboarding before connectors exist;
- compatibility discovery;
- deterministic metric validation;
- data-quality/reconciliation;
- migration bridge from existing POS systems;
- fallback import path.

Analyzer must never redefine CafeOS as “an Excel upload product.”

## Role of Control Tower

Control Tower is the cross-store decision layer above both CafeOS-native and integrated operating data.

It owns:

- Daily Brief;
- Store Health;
- Attention;
- Action;
- Measurement;
- evidence and source-boundary communication.

It must not silently mix first-party and imported facts until the read-model preserves lineage and comparable metric semantics.

## Decision hierarchy

For product-level decisions, authority order is:

1. \`MISSION.md\`
2. \`docs/PRODUCT_ARCHITECTURE.md\`
3. \`docs/ROADMAP.md\`
4. product/module PRDs and approved design specs
5. implementation docs/tests

A module PRD may narrow implementation scope, but it may not silently replace the CafeOS product mission.

## Anti-drift rules

- Do not confuse the current shipped slice with the whole CafeOS vision.
- Do not add features merely because they are easy to build.
- Analyzer remains narrow even though CafeOS grows broader.
- First-party execution belongs in explicit CafeOS modules, not inside Analyzer.
- Prefer integration where it lowers risk/cost, but do not forbid first-party execution when it is core to CafeOS.
- Do not let AI-generated analysis own numeric business truth.
- Every new module must identify the job, evidence, system-of-record boundary, action owner and measurable outcome.
- Primary distribution must remain **pull/inbound**; CafeOS must not depend on cold outbound sales.
