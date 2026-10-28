# CafeOS — recovery-path correction (2026-10-26)

**Scope:** PR #74 Draft, staging project `wjatnyvdygvblirggdcm`. Research and SELECT-only inventory. This is an execution gate correction, not permission to run database changes.

## New upstream evidence and implication

Supabase explicitly states that raw `pg_dump` includes managed/internal platform schemas and can cause permission errors when restored to Supabase. Its managed-platform migration procedure uses `supabase db dump` to export **roles, schema and data** separately and applies Supabase-specific filters. Historical migration receipts require an additional separate `supabase_migrations` schema/data export. Auth/Storage customizations and platform configuration may also need separate reconstruction.

Official references:
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/reference/cli/supabase-db-dump

**Consequence:** our existing `scripts/backup-cafeos-staging-age.sh` is still a valid *candidate to capture raw PostgreSQL bytes into an encrypted rescue archive*, but its successful execution plus offline archive verification **MUST NOT** be presented as successful Supabase-platform restore or sufficient permission for migration history repair. The 7/7 DPAPI receipt archive is another distinct, limited artifact.

## Live source inventory (SELECT-only, 2026-10-26)

- `pg_database_size` approximately **13 MB** (includes PostgreSQL storage overhead; not an estimated dump size).
- 1 `auth.users` record, 4 tenants, 4 tenant memberships, 4 stores, 0 menu items, 0 Commerce orders/payments and 0 daily closes.
- 0 Storage buckets and 0 Storage objects. The `supabase_vault` extension is installed but `vault.secrets` contains 0 rows; do not infer that all platform secrets/configuration are backed up.
- Extensions include `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`.
- 7 original migration receipts still present, fingerprint `fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3`. Neither pending Commerce integrity guard applied.

## Recovery gate redesign (NO live execution authorized)

**A. Historical original SQL receipts.** Maintain the existing 7/7 encrypted DPAPI evidence and separately pinned full-ledger hash. No repair yet.

**B. Raw encrypted rescue capture.** Existing `pg_dump -Fc` + `pg_dumpall --globals-only` + SHA-256 + age may be run **only after** protected staging DB credential, project-specific `verify-full` CA, securely controlled output, and independently recoverable/off-host age private key. A captured raw archive protects investigation/bit preservation; clean-room recovery remains unproven.

**C. Supabase-compatible recovery export.** Establish an approved operator-owned workflow based on documented `supabase db dump` roles/schema/data and separately exported `supabase_migrations` schema/data, pinning CLI/Docker and connection destination. Do **not** silently write plaintext SQL to a persistent NTFS/Git volume: the CLI examples use `-f` and plaintext; a secure short-lived filesystem/stream-encryption design and secret-safe connectivity need proof before live execution. Default CLI filtering of managed `auth`/`storage` schemas means completeness, including the one Auth user and any managed-schema customization, must be verified against the actual generated files, not inferred from documentation. Read the CLI version-specific behavior first.

**D. Actual isolated recovery acceptance.** Restore the actual staging-derived export to a distinct clean compatible Supabase installation/project; never restore into existing staging or production. Independently verify table counts and deterministic financial sums, Auth user presence, 7 full original receipts and source hash, SQL functions/extensions, RLS policies, exact EXECUTE/CREATE grants, tenant-crossing negatives, and Commerce RPC behavior. Recreate Auth/Storage customizations, Vault key requirements, platform secrets and external Storage bytes only if applicable. Never copy source JWT signing secrets or reuse live auth tokens in a new environment. Document any restore adaptations; a "PASS" requires *actual* restored data and independent reviewer evidence, not synthetic CI.

**E. Approval for migration/production.** Only after B+C+D pass, with owner-approved 7→canonical mapping and separate security review/JWT E2E, reconsider staging-only history repair and Commerce guards. No automatic `migration repair`, `db push`, merge or production deploy.

## Why this changes priority

The source is small (~13 MB), so capacity is not currently the principal technical obstacle. **The real blockers are recoverable custody (off-host age identity), authenticated project-specific database connectivity/TLS, and a compatible actual-data recovery target.** No additional synthetic negative controls should be considered release progress until one of those gates advances.

**Final status: PR Draft; staging and production unchanged; release NO-GO.**
