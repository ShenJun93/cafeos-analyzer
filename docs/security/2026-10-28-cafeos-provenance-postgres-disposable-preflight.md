# CafeOS — Disposable PostgreSQL Provenance Preflight

**Scope:** Real PostgreSQL 17 service in a GitHub-hosted ephemeral job, with **synthetic fixture SQL**. This is not Supabase production/staging, not signed-JWT acceptance, and not a migration. The canonical source-account schema is **not** implemented.

## Operator job

Check PostgreSQL's actual permission and relational behavior before any source-account provenance schema is authorized, while keeping all work isolated from merchant databases and application secrets.

## Guardrails

- Workflow `.github/workflows/provenance-postgres-disposable.yml` launches a temporary PostgreSQL container with database `cafeos_provenance_preflight`; it does not reference Supabase project IDs, remote database URLs, live credentials, Supabase CLI migrations or staging.
- The job connects only via `127.0.0.1:5432` to its own service container; synthetic password is not a merchant secret.
- The fixture at `tests/security/provenance-postgres-disposable-preflight.sql` aborts unless `current_database()` equals `cafeos_provenance_preflight` and the connected user is a fixture superuser. It performs all CREATE ROLE/SCHEMA/TABLE/POLICY/INSERT commands inside one transaction followed by `ROLLBACK`.
- Workflow independently asserts after psql returns that the synthetic schema and roles are absent. No migration file, GRANT, RLS policy, or binding is changed in the project's real database.
- Internal `cafeos_preflight_probe_a` / `probe_b` roles receive synthetic SELECT access solely so real PostgreSQL RLS can be observed; generic `anon`/`authenticated` fixture roles receive no private-schema USAGE or table grants. These are **not real Supabase roles** or JWT sessions.
- No source-system accounts, external transaction IDs, HMAC keys, service-role API keys or customer data are present. Digest values are repeated dummy characters, not cryptographic attestations.

## Exact tests this experimental SQL actually performs

| Gate | Executed assertion | Evidence limitation |
| --- | --- | --- |
| Local database guard | Test name and fixture superuser required | Guard protects accidental use, not malicious manual override |
| Catalog privilege denial | No private schema USAGE or table SELECT/INSERT/UPDATE/DELETE for synthetic app roles | Does not certify grants in real CafeOS PostgreSQL |
| RLS policies enforced | Both synthetic probe roles observe exactly one own-Tenant binding/event and no foreign rows | Roles represent static database policies, not real session/JWT authentication |
| No direct mutation | Probe A cannot UPDATE/DELETE, probe B cannot INSERT events | Test-only privilege model, not a production role policy |
| Cross-Tenant/Store composite FK | Synthetic wrong-Store binding and wrong-Tenant binding event raise foreign_key_violation | Candidate fixture schema, not a deployed migration |
| Namespace/revision uniqueness | Duplicate namespace and replayed binding revision raise unique_violation | Does not test concurrent transaction races |
| Cleanup | Entire fixture transaction rolled back, roles and schema absent | PostgreSQL service itself is disposed with the CI runner |

Each SQL gate prints a distinct `PROVENANCE_PG_..._PASS` marker and `ON_ERROR_STOP` prevents false success after a failed assertion. A green workflow demonstrates actual PostgreSQL behavior for this **isolated candidate fixture only**.

## What remains BLOCKED (RLS-01 … RLS-17 in canonical matrix)

- Real private schema DDL/constraints, data API exposed schema settings and SQL privileges for the actual CafeOS roles do not exist yet; no staging migration has been run.
- Real signed-JWT Manager/Owner/Tenant/Store authorization, authenticated Supabase RLS, service-role handling, view/function security and anti-replay attestations remain unverified.
- Historical revision completeness requires trusted ledger queries plus independently established expected count; a synthetic contiguous revision list cannot prove global completeness.
- True concurrent insert/version races, external vendor account ownership, source import completeness, refunds/taxes/tips/settlement and POS/import financial source-of-truth rules remain unverified.
- Staging migration ledger reconciliation, independent full backup/restore, off-host `age` recovery, security review, Windows exact-HEAD acceptance, merge and production rollout remain **RELEASE NO-GO**.

## Citations / upstream rationale

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Data API: https://supabase.com/docs/guides/api/securing-your-api
- PostgreSQL row security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL GRANT: https://www.postgresql.org/docs/current/sql-grant.html

**Never copy the synthetic fixture to `supabase/migrations` or execute it on staging/production.** Its schema/role names exist only to test PostgreSQL guarantees. Any real authorization or provenance migration requires separate design approval and authenticated staging security evidence.
