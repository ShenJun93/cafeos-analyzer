# CafeOS Product Architecture

## Positioning

CafeOS is a **full café operating ecosystem** with a modular architecture.

It can run first-party commerce through CafeOS POS and related operating modules, or integrate with an external POS when a merchant prefers to keep existing execution systems.

The common requirement is one tenant-safe canonical operating model and one evidence-backed Control Tower.

## Architecture principles

- one tenant/store identity model;
- deterministic business truth;
- explicit source provenance;
- module boundaries instead of one giant ERP service;
- CafeOS-native and integrated sources can coexist;
- no fake lineage to make modules appear unified;
- browser clients never receive service-role/secret credentials;
- RLS remains a database-enforced boundary.

## Layer 0 — Platform Core

Responsibilities:

- Supabase Auth;
- tenants and tenant memberships;
- RBAC;
- store identity;
- privacy/security policy;
- auditability;
- API boundary;
- backup/restore;
- billing/settings later.

## Layer 1 — Execution sources

### CafeOS-native execution

Core Commerce / CafeOS POS may own:

- menu;
- first-party order;
- payment record;
- daily close;
- later table/service/KDS/order-ahead workflows.

Other first-party modules may later own inventory, loyalty, staff and operational execution.

### External execution

Connectors/Analyzer may ingest from:

- KiotViet;
- Sapo FnB;
- CUKCUK;
- POS365;
- iPOS;
- Haravan;
- Excel/CSV;
- other supported systems.

CafeOS does not require an external merchant to replace a working POS merely to use Control Tower.

## Layer 2 — Canonical operating data

Responsibilities:

- Store;
- Product/Menu;
- Order/Transaction;
- Payment record;
- Customer identity;
- inventory facts later;
- staff facts later;
- source namespace and lineage;
- idempotency;
- deterministic metric semantics.

For CafeOS POS, Core Commerce tables are first-party system-of-record tables.

For external POS, import/connector records remain the source boundary.

## Layer 3 — Operations modules

### Core Commerce / CafeOS POS

Initial vertical slice:

\`Menu → Order → Payment Record → Daily Close → Dashboard\`

Trusted prices and totals are server/database-owned.

### Store Operations

Later:

- exception-to-task;
- checklists;
- standards;
- follow-up;
- recurring issue evidence.

### Inventory

Later:

- ingredient/product stock;
- recipes;
- receipts/transfers;
- theoretical depletion;
- variance;
- reorder visibility.

### Staff

Later:

- staff directory;
- permissions;
- shifts;
- attendance;
- operational accountability.

### Finance & Reconciliation

Later:

- daily close;
- settlement reconciliation;
- COGS/gross margin;
- bounded expenses;
- accounting integrations.

## Layer 4 — Analyzer / Integration Bridge

Analyzer remains:

- acquisition/onboarding;
- file import;
- POS compatibility;
- reconciliation;
- deterministic validation;
- source-lineage inspection;
- fallback path before an API connector exists.

Analyzer is not the place to build POS, inventory, loyalty, payroll or accounting UI.

## Layer 5 — Control Tower

Primary surfaces:

- Daily Brief;
- Store Health;
- store comparison;
- Data Health;
- Attention;
- Action;
- Measurement;
- evidence drill-down.

Control Tower should answer:

- what changed?
- where should I look first?
- who owns the action?
- what changed after the action?

A later unified read-model will combine CafeOS-native commerce facts with external/import facts while preserving source lineage.

## Layer 6 — Customers & Loyalty

Capabilities later:

- deterministic Customer 360;
- lifecycle/retention;
- membership;
- points/benefits;
- offers;
- segments;
- owned customer experience.

No fuzzy person matching.

## Layer 7 — Growth & Experimentation

Later:

- segment selection;
- offer hypothesis;
- treatment/control;
- exposure/conversion;
- incremental outcome measurement.

No autonomous consequential sending without bounded approval.

## System-of-record matrix

| Domain | CafeOS-native mode | Integrated mode |
| --- | --- | --- |
| Menu | CafeOS Core Commerce | external POS/menu connector |
| Order | CafeOS POS | external POS/import |
| Payment record | CafeOS Core Commerce | external payment/POS record |
| Daily close | CafeOS Core Commerce | imported/reconciled close |
| Customer | CafeOS deterministic identity | connector/import identity |
| Metrics | CafeOS deterministic read-model | CafeOS deterministic read-model |
| Action/Measurement | CafeOS Control Tower | CafeOS Control Tower |

## AI boundary

AI may:

- summarize deterministic facts;
- explain evidence;
- propose bounded investigation/action options;
- translate user intent into a validated plan.

AI may not:

- invent/alter prices, totals, balances or metrics;
- run arbitrary unvalidated tenant SQL;
- fuzzy-merge people;
- autonomously move money or perform consequential operations without a bounded approval policy.

## Primary next-product shape

The current next implementation is **Core Commerce v1**, not Analyzer v0.2.

Its first production-shaped spine is:

1. Menu;
2. CafeOS POS order;
3. payment record;
4. daily close;
5. commerce dashboard;
6. handoff into the same authenticated CafeOS shell as Control Tower and Analyzer.

The next read-model step after this slice is to include CafeOS-native paid orders in Control Tower metrics without falsifying import provenance.
