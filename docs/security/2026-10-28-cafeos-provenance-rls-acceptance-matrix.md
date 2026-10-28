# CafeOS Phase 1.1 — Provenance Storage Security Acceptance Matrix

**Status:** SPECIFICATION + EXECUTABLE NODE PREFLIGHT ONLY. **Not** PostgreSQL RLS acceptance, not a real signed-JWT test, not migration authorization.
**Date:** 2026-10-28.
**Parent:** PR #85, then #84 → #83 → #82 → #81 → #80 → #79 → #78 → #77 → #76 → #75 → #74.
**Job:** fail closed on unsafe source-account binding claims and precisely define what a future **isolated staging** database/RLS exercise must demonstrate before a migration can be authorized.

## What the current Node suite actually verifies

`tests/core-commerce-provenance-security-preflight.test.mjs` runs against **existing repository code**, not a mock implementation of hypothetical SQL permissions:

- The existing `requireCommerceManagerRole` denies Cashier/Analyst/Viewer and permits Manager/Admin/Owner.
- The actual `appContext` validates membership lookup requests against the selected Tenant and user; synthetic Supabase responses model missing membership, missing bearer and malformed user. **JWT signature/audience/expiry verification is NOT performed by the fake upstream.**
- The real `dispatchWorkflow` returns 404 for a provenance review route that does not exist. Neither `WORKFLOW_ROUTES` nor `vercel.json` currently advertises a source-account binding route. No new API permission is granted.
- The existing reviewer rejects cross-Tenant, Store and namespace claims; now rejects **two different binding IDs for the same Tenant/Store/namespace**, even when both claim the same upstream provider account and branch.
- Unverified claim fields such as `verified:true`, role, `signedJwt` and fake money never authorize POS/import linkage or combined sales.
- Only the two **inspected canonical SQL files** are asserted not to contain candidate provenance tables; this is **not a complete database inventory**. Any actual migration/DDL requires a new independently reviewed test gate.

## Future SQL/RLS acceptance — NOT RUN

These tests cannot pass on the current branch because no approved source binding schema, migrations, authenticated staging credentials or completed migration ledger exists. They are **blocking requirements**, not a claim of live coverage.

| Test ID | Hostile scenario and required outcome | Required evidence |
| --- | --- | --- |
| `RLS-01` | `anon` and generic `authenticated` roles cannot SELECT/INSERT/UPDATE/DELETE private binding or event tables | Real `has_table_privilege` / `has_schema_privilege` output + negative SQL queries |
| `RLS-02` | Private provenance schema absent from Supabase Data API exposed schemas and accessible RPC routes | Dashboard Data API settings + PostgREST route checks; SQL alone insufficient |
| `RLS-03` | Signed JWT Manager in Tenant A cannot read/write binding in Tenant B | Real token, role, DB RLS query + no cross-Tenant rows |
| `RLS-04` | Manager of Store A cannot bind source account to Store B, even in same Tenant | Composite FK `(tenant_id,store_id)` and tenant/store authorization checks |
| `RLS-05` | Cashier/Analyst/Viewer cannot create privileged binding claims or attestation | Authenticated request denial and zero new ledger rows |
| `RLS-06` | Any browser user attempting to set `verified=true`, `recorded_at`, signer, HMAC digest or owner is rejected | Bounded handler denial, trusted server timestamp check and zero write |
| `RLS-07` | Two concurrent insertions for same namespace or revision do not create duplicate active binding/event | DB unique constraints, atomic append/version concurrency test |
| `RLS-08` | Changing existing provider/account under same namespace cannot overwrite a binding | Immutable binding scope and explicit rejected/conflict event |
| `RLS-09` | Missing revision, skipped revision, duplicate/replayed revision or nonmonotonic time blocks review | Complete ordered ledger query with exact count + negative mutation tests |
| `RLS-10` | Revocation/rejection is sticky; no unreviewed reactivation | Event lifecycle audit and negative write/read-model tests |
| `RLS-11` | No direct exposure of connector secrets, raw provider account IDs, evidence refs, customer data or HMAC key | Response redaction checks + network trace + secret-store review |
| `RLS-12` | Any privileged function has constrained `search_path`, fixed actor check and no blanket public EXECUTE | Catalog review of functions, roles, grants and targeted queries |
| `RLS-13` | Views cannot bypass base table RLS; `security_invoker=true` where applicable | PostgreSQL version + view definition/permission inspection |
| `RLS-14` | Tenant deletion follows authorized offboarding workflow without crossing tenant boundaries or silently losing required audit trail | Full tenant-graph test and approved retention/privacy policy |
| `RLS-15` | Count/pagination/coverage of upstream POS export and CafeOS import are independently verified | Vendor-side receipt count, Store/day time boundaries, PostgREST exact count, missing-data behavior |
| `RLS-16` | No cross-source dedup or combined finance even for a verified identity until financial source-of-truth rules exist | Refund/tax/tip/void/settlement reconciliation and security signoff |
| `RLS-17` | Staging migration ledger, independent full backup/restore, off-host `age` recovery and owner approval | Live operator evidence + migration/checkpoint receipts |

### Safe catalog queries (future approval required)

The following **read-only examples** are not run automatically. A future staging operator must confirm the intended database and approved schema/table names first. Missing tables means **NOT RUN/BLOCKED**, not PASS.

```sql
-- Catalog-only privilege inspection; returns no merchant rows.
select n.nspname as schema_name,
       c.relname as object_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'private'
  and c.relname in ('source_account_bindings', 'source_account_binding_events');

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'private'
  and table_name in ('source_account_bindings','source_account_binding_events')
order by table_name, grantee, privilege_type;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'private'
  and tablename in ('source_account_bindings','source_account_binding_events')
order by tablename, policyname;
```

Catalog results are *only one layer*. Table existence, RLS enabled and absence of grants are not a substitute for actual signed-JWT negative access tests or verifying which schemas Supabase exposes via the Data API. Using a service-role key for negative testing would invalidate the test.

## Official security references

- Supabase: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — explicit policies with role and ownership predicates; exposed tables must have RLS.
- Supabase: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — Data API schema exposure vs role privileges.
- PostgreSQL: [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) and [GRANT](https://www.postgresql.org/docs/current/sql-grant.html).
- PostgreSQL: [CREATE VIEW](https://www.postgresql.org/docs/current/sql-createview.html) — invoker vs owner security semantics.

## Stop / release rules

A green Node suite proves the **existing code preflight** and synthetic claims, not DB permissions, live JWT signatures, vendor-account ownership, HMAC key handling or finance. A source-account namespace is a scope label until independently authenticated. All `RLS-01` through `RLS-17` remain NOT RUN/BLOCKED; no SQL migration, RLS policy change, service-role usage, staging/production write, merge, deployment, POS offline statement or unified revenue claim is permitted by this document.
