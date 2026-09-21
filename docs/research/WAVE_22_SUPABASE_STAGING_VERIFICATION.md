# Wave 22 — Supabase staging DB verification

Date: 2026-09-21

## Environment

- Supabase organization: `hoanguyen93`
- isolated project: `cafeos-staging`
- project ref: `wjatnyvdygvblirggdcm`
- region: `ap-southeast-1`
- status at verification: `ACTIVE_HEALTHY`
- quoted project cost at creation: 0 USD/month
- no production merchant data used

## Applied for verification

The staging database was built with:

1. canonical `db/migrations/001_analyzer_core.sql`
2. canonical `db/contracts/control_tower_core.sql`

These were applied to staging with SQL execution for validation only. No production migration was created and no production environment was mutated.

## Verified database behavior

### Tenant isolation

Using Supabase's documented DB-test pattern with:

- `set local role authenticated`
- `set local request.jwt.claim.sub = '<test-user-uuid>'`

Tenant A owner could see exactly:

- 1 Tenant-A store
- 1 Tenant-A attention item
- 0 Tenant-B stores

Result: **PASS**

### Workflow authorization

Verified:

- Tenant-A owner can create a Tenant-A action.
- Action insert automatically creates one `action_status_history` row.
- Tenant-A viewer cannot create an action.
- Tenant-A owner cannot create an action for Tenant B.
- Authenticated users cannot read `customer_identifiers`.

Result: **PASS**

### Measurement trust boundary

Verified:

- operator can create a measurement window only as `pending` with null measured values;
- authenticated client cannot update baseline/measured values or mark it measured;
- values remained null after the blocked update.

Result: **PASS**

### Cross-tenant FK + idempotency

Verified at DB-owner level:

- Tenant-A line item pointing to Tenant-B `store_id` is rejected by composite tenant FK.
- Valid Tenant-A Store/Customer references succeed.
- duplicate `source_record_key` remains rejected.
- exactly one line item was committed.

Result: **PASS**

## Advisor findings and fixes

Initial Security Advisor:

- `customer_identifiers`: RLS enabled but no policy.

The table already had no authenticated grant and was inaccessible, but the contract was strengthened with an explicit authenticated deny policy.

Initial Performance Advisor:

- missing covering index for `actions_attention_fk`;
- missing covering index for legacy `transaction_line_items.first_import_id`.

Both indexes were added.

After fixes:

- **Security Advisor: 0 findings**
- **Performance Advisor: no unindexed-FK findings**
- only `unused_index` INFO notices remain, which are expected on a newly created low-traffic staging database and are not grounds for deleting indexes.

## Current gate

The schema contract has passed real staging execution, RLS negative tests, integrity tests, and advisors.

A migration-history artifact is still intentionally missing because the current execution environment does not have a working Supabase CLI. Do not invent a migration filename.

Next step:

1. use an environment with a working Supabase CLI;
2. create the migration through the CLI workflow;
3. reconcile it with the now staging-verified contract;
4. run DB tests again from migration state;
5. commit migration + test evidence;
6. only then begin authenticated `/api/app/*` and `/app` work.
