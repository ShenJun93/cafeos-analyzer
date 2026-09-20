# CafeOS Control Tower — Thin-Slice Implementation Design

## Goal

Implement the smallest persistent CafeOS loop that proves:

`trusted data → attention → owned action → later measurement`

This design reuses the existing Analyzer engine. It does not create a parallel analytics stack.

## Existing foundation

Already present and reusable:

- `tenants` and `tenant_members`
- import idempotency
- transaction line items
- RLS access helper
- CSV/XLSX ingestion
- normalization/mapping
- deterministic metrics
- store/daypart insight engine
- privacy/identity constraints

Existing public Analyzer APIs remain a separate unauthenticated validation surface.

## Minimum data-model delta

### 1. `stores`

Purpose: replace free-text store scope with a stable tenant-local entity.

Minimum fields:

- `id uuid PK`
- `tenant_id uuid FK`
- `source_namespace text`
- `external_key text`
- `name text`
- `timezone text`
- `active boolean`
- timestamps

Constraint:

- unique stable source identity within tenant/source namespace.

Migration strategy:

- do not immediately remove `transaction_line_items.store`;
- add optional `store_id` and backfill deterministically;
- preserve raw/source store text for lineage.

### 2. `customers` + `customer_identifiers`

Purpose: stable Customer 360 identity without fuzzy matching.

`customers`:

- `id`
- `tenant_id`
- timestamps

`customer_identifiers`:

- `id`
- `tenant_id`
- `customer_id`
- `type` (source_customer_id / phone / email)
- `matching_hmac`
- `source_namespace`
- `verified`
- timestamps

Rules:

- deterministic match only;
- no cross-tenant identity;
- raw identifier storage must follow privacy/encryption policy;
- existing `customer_key` remains a migration bridge, not the final identity model.

### 3. `attention_items`

Purpose: persist a deterministic insight as a workflow object.

Minimum fields:

- `id`
- `tenant_id`
- `type`
- `severity`
- `metric`
- `scope_type`
- `scope_key`
- `current_value`
- `baseline_value`
- `delta_value`
- `coverage jsonb`
- `confidence numeric/null`
- `evidence jsonb`
- `detector_version`
- `status` = open / acted / dismissed / resolved
- timestamps

Important:

- numeric values come from deterministic engine output;
- evidence must be sufficient to reproduce the statement;
- a stored attention item is not a causal diagnosis.

### 4. `actions`

Purpose: turn attention into owned follow-up.

Minimum fields:

- `id`
- `tenant_id`
- `attention_item_id nullable`
- `owner_user_id nullable`
- `action_type` = investigate / follow_up / segment / experiment_hypothesis
- `title`
- `expected_metric nullable`
- `expected_direction nullable`
- `status` = open / in_progress / resolved / dismissed
- `resolution_note nullable`
- `due_at nullable`
- timestamps

No generic task-management fields beyond what the product loop needs.

### 5. `action_status_history`

Purpose: auditable workflow history.

Fields:

- `id`
- `tenant_id`
- `action_id`
- `from_status`
- `to_status`
- `actor_user_id`
- `note nullable`
- `created_at`

### 6. `measurement_windows`

Purpose: close the loop without falsely claiming causality.

Minimum fields:

- `id`
- `tenant_id`
- `action_id`
- `metric`
- `scope_type`
- `scope_key`
- `baseline_start/end`
- `measurement_start/end`
- `baseline_value nullable`
- `measured_value nullable`
- `delta_value nullable`
- `status` = pending / measured / insufficient_data
- timestamps

Text/UI must say “before/after measured change” unless an experiment design supports causal attribution.

## Deferred data-model objects

Do not add in the first migration unless needed by the thin slice:

- full Product master
- Segment persistence
- Experiment / Assignment / Exposure / Conversion
- Campaign
- loyalty balances
- inventory
- accounting
- generic tasks/projects

## Minimum API delta

Keep public Analyzer endpoints unchanged.

Authenticated product endpoints should live under a separate boundary such as `/api/app/*`.

### Read

- `GET /api/app/brief`
- `GET /api/app/stores`
- `GET /api/app/stores/:id`
- `GET /api/app/attention`
- `GET /api/app/actions`
- `GET /api/app/actions/:id`
- `GET /api/app/customers/:id` only when identity support is ready

### Write

- `POST /api/app/actions`
- `PATCH /api/app/actions/:id/status`
- `POST /api/app/actions/:id/measurement-window`

All product endpoints require authenticated tenant membership and RLS-compatible access.

Do not let a client supply trusted metric values when the server can calculate them.

## Minimum UI delta

### Route 1 — `/app` Daily Brief

Contains only:

- data freshness / coverage
- top deterministic metrics
- top attention items
- unresolved actions

### Route 2 — `/app/stores/:id`

- store metrics vs baseline
- relevant attention items
- evidence
- actions for this store

### Route 3 — `/app/actions`

- open/in-progress/resolved actions
- owner/status
- source attention

### Route 4 — `/app/actions/:id`

- originating evidence
- action history
- resolution
- measurement window/result

### Route 5 — `/app/customers/:id`

Only when deterministic customer identity coverage exists.

Do not build a configurable dashboard builder.

## Daily Brief generation

Initial implementation can generate the brief on request from persisted transactions.

Do not introduce background queues, Kafka, ClickHouse or scheduled materialization until performance evidence requires them.

Later optimization may persist `metric_snapshots`; it is not mandatory for the first action-loop slice.

## Authentication and persistence

The current SQL contract already assumes Supabase/Postgres semantics and `auth.uid()`.

Before live product persistence:

1. exercise migrations against a real/staging Postgres/Supabase environment;
2. test tenant isolation with two tenants and multiple roles;
3. test denied cross-tenant reads/writes;
4. test import idempotency after store/customer promotion;
5. define deletion/retention behavior.

No production merchant data is allowed until these gates pass.

## Code reuse plan

### Reuse directly

- `src/csv.ts`
- `src/xlsx.ts`
- `src/file.ts`
- `src/mapping.ts`
- `src/normalize.ts`
- `src/imports.ts`
- `src/metrics.ts`
- `src/health.ts`
- `src/insights.ts`

### Adapt

- `src/types.ts` — separate canonical analytics types from workflow/domain types
- `src/analyze.ts` — expose reusable analysis service, not only Analyzer response shape
- DB migrations — promote stable Store/Customer and workflow objects

### Keep module-specific

- public Analyzer upload UX
- SEO landing pages
- compatibility issue flow
- field-kit UX
- public 4 MiB transient request constraints

## First implementation checkpoint

The next code PR should be **schema-contract only**, not a full UI build:

1. add migration `002_control_tower_core.sql`;
2. add static/DB contract tests for tenant isolation, foreign keys, status checks and deterministic scope;
3. update `DB_MODEL.md`;
4. add no live Supabase mutation yet;
5. CI must remain green.

Only after that contract is accepted should the authenticated app/API shell begin.

## Kill/stop conditions

Stop and redesign if:

- action workflow requires copying generic project-management functionality;
- product metrics start depending on LLM calculations;
- store/customer identity cannot be made deterministic;
- tenant isolation becomes weaker than the current Analyzer contract;
- implementation requires replacing POS execution to prove the first loop.
