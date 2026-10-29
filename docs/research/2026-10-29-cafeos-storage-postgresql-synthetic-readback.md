# CafeOS — PostgreSQL-backed synthetic Storage metadata + object-byte recovery

**Scope:** synthetic test only, not actual Supabase Storage service or staging. Parent PR #101 checks fake source/target metadata snapshots plus recovered object bytes. This step changes the target metadata evidence: SQL rows are restored into a **separate PostgreSQL database**, then independently queried from that database rather than cloned in JavaScript.

## Reproducible fixture

Workflow `.github/workflows/cafeos-storage-postgres-readback-synthetic.yml` runs only on GitHub Actions `ubuntu-24.04` with the runner's **preinstalled PostgreSQL 16** (service initially disabled) and Ubuntu-packaged `age`, without Docker or GHCR. Documented runner packaging: https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md.

Script `scripts/run-ci-cafeos-storage-postgres-readback-drill.sh`:
1. Refuses non-GitHub CI and colliding database names. Uses only the local peer-authenticated PostgreSQL socket. Names are pinned `cafeos_synthetic_storage_source_20261029` and `cafeos_synthetic_storage_recovered_20261029`.
2. Creates a **small synthetic representation** of the `storage.buckets` and `storage.objects` fields, with two fake bucket rows and two fake object rows. The schema is NOT the vendor-managed Storage schema. Enables RLS flags on its fake tables but does NOT exercise actual API RLS or JWT.
3. Pipes a custom-format `pg_dump` of the fake schema/data directly through `age`, stores ciphertext only under private `/dev/shm`, decrypts through a pipe into `pg_restore --single-transaction --exit-on-error` against the **other database**.
4. Separately age-encrypts the two fake file blobs and decrypts their bytes, also under `/dev/shm`. Generates per-object SHA-256 manifest from the original file bytes.
5. Independently SELECTs bucket/object rows from source and recovered PostgreSQL databases into separate private JSON snapshots, then invokes the PR #101 verifier to compare bucket public/owner/size/MIME attributes, object ID/path/version/owner/size/MIME, exact keyset and the ACTUAL recovered object bytes.
6. Performs two **real SQL target-only mutations**, with independent readback and required failure reason: object version drift and bucket public-visibility drift; restores only the fixed synthetic rows and re-verifies the positive case.
7. The EXIT trap removes only databases created during the test and all temporary file material; cleanup failure prevents PASS.

## Evidence boundaries

This eliminates PR #101's copied target-metadata **positive-fixture weakness** for the new *synthetic* PostgreSQL readback path. Both databases are on the **same runner PostgreSQL server**, not separate servers or a fully running Supabase stack. The fake Storage schema is NOT managed Supabase Storage; this is not an operational Storage API/S3 backup, file migration, or RLS/JWT access test. CI uses no real credentials, users, buckets or production data. Actual platform and original staging snapshot/restore, offhost age private-key custody, security review and release sign-off remain OPEN.

A true Supabase Storage recovery must obtain metadata and object bytes through supported platform/API procedures: https://supabase.com/docs/guides/storage/schema/design and https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore.

**Hard hold:** PR stays Draft and release NO-GO. No staging SQL, migration repair, merge, deploy, or local security-policy bypass from this synthetic result.
