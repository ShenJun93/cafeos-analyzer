# CafeOS — GHCR-free distinct PostgreSQL Auth catalog acceptance (synthetic)

Date: 2026-10-30. Parent: PR #102. This is **not** an actual Supabase/Auth/JWT restore and does **not** supersede blocked PR #99 vendor-image CI.

## Problem and user job
PR #99 added a strong managed Auth catalog parity check after a synthetic cross-server restore, but both exact-head Supabase DB CI jobs stopped **before** that assertion because the container registry rejected GHCR image pulls (`toomanyrequests`). Existing standalone read-only negative controls proved that the comparator detects differences, but not that a successful recovery preserves its invariants on a second server.

The user job is to know whether a restored Auth identity/tenant database remains structurally safe before activating CafeOS. The canonical authority is Git source, run-specific CI output, and full-stack/real-data evidence when separately approved; the CI fixture is never the system of record.

## Approach
New `scripts/run-ci-cafeos-auth-catalog-cross-server-no-ghcr.sh` and independent GitHub Actions workflow:

- Runs only in GitHub Actions, as OS user `postgres`, on an Ubuntu 24.04 runner with preinstalled PostgreSQL 16 and apt-packaged age. No Docker, GHCR, Supabase credentials, network download of container images, or staging connection.
- Creates one fresh scratch **database** on the runner's default PostgreSQL cluster, plus a **second independently initialized PostgreSQL cluster** on a private `/dev/shm` tmpfs directory. Uses distinct `pg_control_system().system_identifier` values to prove actual independent server/cluster identity. The target has `listen_addresses=''`, a private Unix-domain socket and no TCP exposure.
- Source has only two fixed fake `example.invalid` Auth users/identities and a small fake Auth schema with real index, unique constraint, RLS flag, policy and non-internal trigger. This is *not* Supabase's managed Auth DDL.
- Runs `pg_dump -Fc` through age encryption; decrypts via pipe into `pg_restore --single-transaction --exit-on-error` on the other server. No plaintext dump is written to disk.
- **Extracts the exact SQL text of `auth_catalog_sql` from PR #99's `scripts/run-ci-cafeos-distinct-postgres-age-restore.sh`**, rather than using a second weaker comparator. Requires nonzero catalog item count and exact matching source/target digest after restore.
- Five separate negative controls mutate **only the second synthetic server**: drop/recreate an index, drop/recreate a named unique constraint, disable/re-enable RLS, drop/recreate a policy, and drop/recreate a trigger. Each mutation must change the digest; each restoration must match the original fingerprint.
- EXIT trap stops only the new target PostgreSQL cluster, drops only the created synthetic source DB, removes the private tmpfs files/age key, and refuses a successful result if cleanup fails.

## Evidence limits / hard holds
This gate is an independent synthetic PostgreSQL **catalog comparator** acceptance that avoids the GHCR rate-limit. It is not a running GoTrue/Auth API service, actual Supabase managed Auth schema or dataset, a storage-provider restoration, JWT E2E, actual tenant isolation, or proof that original staging would recover. It does not remove PR #99's exact real managed-schema-on-official-image CI BLOCKED status.

PR #98's distinct-server synthetic Auth/history restore PASS is separate and remains useful. PR #100–#102 Storage synthetic work is separate and cannot prove Storage API/JWT access. Off-device age key custody, explicit source export approval, actual encrypted staging capture, target full-stack restore and security signoff remain prerequisites.

No staging or production change, merge, deploy, or security policy bypass. Keep all PRs DRAFT and **RELEASE NO-GO**.
