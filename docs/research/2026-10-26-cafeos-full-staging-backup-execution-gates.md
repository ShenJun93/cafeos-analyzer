# CafeOS — full staging backup execution gates (owner-controlled)

2026-10-26 · Project: `cafeos-staging` · Free plan · PR #74 Draft · **NO DATABASE CHANGE AUTHORIZED**

## Already verified

The seven original Supabase migration receipts have been archived as Windows DPAPI CurrentUser encrypted files on MAIN-PC, and 7/7 were independently restored and checked against real staging SQL SHA-256. A separate *synthetic only* PostgreSQL 17 + age full logical backup/restore passed in GitHub Actions. The live read-only SQL fingerprint query in `scripts/sql/cafeos-staging-receipt-fingerprint.sql` reports `fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3`. This is a **point-in-time indicator**, not a permanent expected constant: fresh live versions and hashes must be independently checked at execution time.

## Blocked prerequisites on MAIN-PC

- MAIN-PC WSL currently uses **Ubuntu 26.04**; no `age` or PostgreSQL client binaries are installed. APT shows candidates for `age` and `postgresql-client-18`, but unattended `sudo` is unavailable. Installing packages requires owner-controlled elevation; no apt mutation was done in this session.
- From the Supabase Dashboard **Connect** panel, obtain the project-specific **staging** direct/session-pooler host and database login, and prepare a 0600 `PGPASSFILE` **outside Git**. Never copy database passwords, JWTs, key files, passwords embedded in URIs, or WSL privilege credentials into chat or Git.
- Supply a validated CA trust file with `PGSSLMODE=verify-full` and an exact pinned staging host. Never use `sslmode=require` as a workaround. Do not relax the script's project host or receipt-history guards.
- Generate a portable `age` recipient/public key and secure 0600 private identity, with an independent recovery custodian; private key must be **outside the backup destination and outside Git**. This single-account DPAPI archive is insufficient for off-machine recovery.
- Pre-create a private **0700** backup directory outside source control, ideally on storage backed up separately. Confirm sufficient free space, and determine a safe off-host encrypted copy plus tested key recovery path.

## Controlled staging backup — future action only

With the prerequisites satisfied, review and invoke `scripts/backup-cafeos-staging-age.sh` in a trusted WSL session using standard libpq environment variables and externally protected files. The script is **not** automatically invoked by CI. It checks the exact staging host/user, `verify-full` TLS, file permissions, PostgreSQL client major >=17, the exact known seven-version historical ledger and the SHA-256 of **all original receipt SQL** before and after the dump. It streams an encrypted PostgreSQL custom-format database archive and role metadata (without role passwords), validates decryption and checksums, and atomically publishes a complete private archive directory containing the checksum manifest and SQL ledger fingerprint.

**STOP** if the current ledger differs from the original attested version set, the before/after SQL fingerprints do not match, any encryption/decryption/checksum fails, the host/certificate cannot be authenticated or the private key/destination is in a repository. Do not bypass any guard merely to produce a file.

## Required separate recovery acceptance

A successful archive is **NOT a recovery acceptance**. On an independent isolated PostgreSQL/Supabase-compatible restore target, prove actual table counts/data, public/managed Auth and Storage schemas, all relevant functions/extensions, role/ownership grants, tenant RLS, three Commerce RPC privilege profiles, exact migration receipts and financial invariants. Account for Supabase-managed configuration, storage object blobs, dashboard secrets and other platform state **outside** a bare PostgreSQL dump. Do not run recovered SQL against existing staging or production. Store signed-off evidence in Git without any personal data, credentials, SQL receipts, encryption keys or raw archive bytes.

Until that real off-host restore passes and migration mapping has independent approval: **do not run** `supabase migration repair`, `supabase db push`, either pending guard migration, or a production deployment.
