# CafeOS — Experimental Source Binding Append-Only SQL Candidate v1

**2026-10-28 · DRAFT · NON-MIGRATION / DISPOSABLE-DB ONLY**

This source is an **auditable experimental PostgreSQL trigger candidate**, not approved CafeOS DDL. It is included by `tests/security/provenance-postgres-disposable-preflight.sql` only after that test has verified `current_database() = 'cafeos_provenance_preflight'` and begun a transaction that ends in `ROLLBACK`. It never connects to staging/production and is **not** a deployable source binding implementation.

## Why add this after PR #87

PR #87 proved PostgreSQL's real RLS/GRANT/FK and uniqueness semantics on synthetic candidate objects. It **did not** check that privileged writes could not mutate past binding/account history, skip revisions, forge timestamps or silently reactivate a revoked source-account binding. This slice adds executable negative checks for those specific data-model hazards.

## SQL candidate contents

- `tests/security/fixtures/provenance-append-only-candidate-v1.sql` requires the disposable database and pre-existing synthetic relations before installing test-only functions/triggers.
- An event `BEFORE INSERT` trigger uses a row lock on its parent binding and compares its revision against the highest already present. It rejects any gap or replay, rejects any new event after observed `revoked`/`rejected`, stamps `recorded_at` using the PostgreSQL server clock, and refuses nonmonotonic event timestamps.
- Two `BEFORE UPDATE OR DELETE` triggers reject changes to the synthetic binding and binding-event tables. Normal application roles lack all private schema/table grants, including `TRUNCATE`; trigger functions are `SECURITY INVOKER`, have pinned `search_path = pg_catalog`, use schema-qualified tables and have PUBLIC execute privileges revoked.
- The independent test harness attempts a skipped revision, a forged client-supplied timestamp, a proposal after revocation, UPDATE of account namespace, UPDATE/DELETE of historical events, and direct function/`TRUNCATE` access. The final rollback check proves the trial objects and roles are absent.

## Exact limits — do not overclaim

- **This is not an authoritative append-only ledger.** Object owners and superusers can disable triggers or alter tables. PostgreSQL triggers and transaction locks alone cannot establish trusted external source-account ownership, prevent a sufficiently privileged administrator from rewriting history, or replace independently monitored audit logging.
- **This is not a production concurrency proof.** The binding row lock demonstrates the proposed single-binding serialization strategy, but true concurrent transactions, isolation-level behaviors, deadlocks and retries require a separate executable race harness and security review.
- **This is not verified source evidence.** The dummy account digest is not a real HMAC; no signing key, connector identity, proof verification, customer data, real POS order, merchant import or payment is touched.
- **This is not production RLS acceptance.** The roles are local synthetic probes; there is no signed Supabase Auth JWT, Data API schema exposure check, installed provenance schema, real Tenant/Store membership policy or approved service writer.
- **Revocation remains terminal** in this v1 synthetic model. A later auditable recovery/rotation contract must be independently designed; simply inserting `proposed` after `revoked` is forbidden.
- **This is not a migration.** Do not copy it into `supabase/migrations`, send it to Supabase MCP `execute_sql`, or run it against CafeOS staging/production. The temporary fixture database guard is a safety control, not operator authorization.

## Required evidence

- Dedicated workflow `.github/workflows/provenance-postgres-disposable.yml` at the PR's exact HEAD must report:
  `PROVENANCE_PG_PRIVILEGES_PASS`, `PROVENANCE_PG_FK_AND_UNIQUENESS_PASS`, `PROVENANCE_PG_RLS_TENANT_A_PASS`, `PROVENANCE_PG_RLS_TENANT_B_PASS`, `PROVENANCE_PG_GENERIC_AUTH_DENIED_PASS`, `PROVENANCE_PG_APPEND_ONLY_HISTORY_PASS`, `PROVENANCE_PG_FUNCTION_AND_TRUNCATE_DENIED_PASS`, `PROVENANCE_PG_DISPOSABLE_ROLLBACK_PASS`, `PROVENANCE_PG_PREFLIGHT_JOB_PASS`.
- The normal Node CI must remain green with committed `dist` reproducible.
- Independent real-DB gates `RLS-01` to `RLS-17` documented in `docs/security/2026-10-28-cafeos-provenance-rls-acceptance-matrix.md` remain **NOT RUN/BLOCKED**.

Security rationale: [PostgreSQL CREATE TRIGGER](https://www.postgresql.org/docs/17/sql-createtrigger.html), [Supabase database functions and invoker/definer](https://supabase.com/docs/guides/database/functions), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

**All stacked PRs DRAFT / RELEASE NO-GO**; no merge/deploy/schema migration, money aggregation, POS/import deduplication or offline POS claim.
