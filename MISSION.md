# CafeOS Mission

## Product mission

Build the operating and customer-intelligence layer for multi-location café brands.

CafeOS should help an owner or HQ team answer and act on four recurring questions:

1. **What is happening across the business?**
2. **Why is it happening, with evidence?**
3. **Which customers, stores, products or dayparts need attention?**
4. **What action should the team take, and did that action improve the outcome?**

CafeOS is designed to sit **above existing POS and operational systems**, not to require a café to replace them.

## Initial ICP

Primary validation ICP: café brands with roughly **3–15 locations** that already use a POS or digital ordering system but lack a unified, evidence-backed control layer across stores and customers.

The architecture may later support larger chains, but product sequencing must be validated against the initial ICP first.

## Core product loop

`CONNECT → UNIFY → UNDERSTAND → ACT → MEASURE`

- **CONNECT:** ingest data from POS, ordering, loyalty, payment and other systems.
- **UNIFY:** map stores, products, transactions and customer identities into a canonical model.
- **UNDERSTAND:** produce deterministic business metrics, customer/store health and evidence-backed anomalies.
- **ACT:** turn insight into a bounded action, task, segment or experiment.
- **MEASURE:** determine whether the action changed business outcomes.

## Product pillars

1. **Data Foundation** — connectors, canonical model, identity, privacy, tenancy and evidence.
2. **HQ / Owner Control Tower** — daily brief, store health, anomalies, multi-store comparison and decision queue.
3. **Customer Intelligence** — Customer 360, lifecycle, frequency, retention, at-risk customers and segments.
4. **Growth & Experimentation** — campaign/offer planning, treatment/control design and incremental outcome measurement.
5. **Store Operations** — exception workflows, tasks, checklists, standards and cross-store follow-through.
6. **Customer Experience** — membership, personalized offers, order-ahead/pickup and related guest-facing capabilities only when justified by evidence and integration feasibility.

## What CafeOS is not

CafeOS is **not initially**:

- a replacement POS;
- a payment processor;
- a full accounting/payroll/ERP suite;
- a generic BI dashboard builder;
- an AI spreadsheet assistant;
- a loyalty points clone with no measurement layer.

Existing systems may continue to own transaction capture, kitchen/bar execution, payment, inventory and accounting. CafeOS should integrate with them and own the cross-system intelligence/action loop.

## Role of CafeOS Analyzer

**CafeOS Analyzer is a module and wedge, not the mission.**

Its jobs are:

- low-friction acquisition;
- file-based onboarding before connectors exist;
- compatibility discovery;
- deterministic metric validation;
- data-quality/reconciliation;
- proving that the CafeOS intelligence layer can create trusted value.

Analyzer must never redefine CafeOS as “an Excel upload product.”

## Decision hierarchy

For product-level decisions, authority order is:

1. `MISSION.md`
2. `docs/PRODUCT_ARCHITECTURE.md`
3. `docs/ROADMAP.md`
4. product/module PRDs
5. implementation docs/tests

A module PRD may narrow implementation scope, but it may not silently replace the CafeOS product mission.

## Anti-drift rules

- Validation exists to reduce uncertainty about the mission; it must not become the mission by default.
- Do not add features merely because they are easy to build.
- Do not clone commodity POS functionality unless evidence proves it is strategically necessary.
- Do not let AI-generated analysis own numeric business truth.
- Every new module must identify the job, evidence, system of record, action owner and measurable business outcome.
- Primary distribution must remain pull/inbound; the business must not depend on cold outbound sales.
