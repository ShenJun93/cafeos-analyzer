# CafeOS — verified portable encryption / local database restore (synthetic only)

**2026-10-26 | PR #74 DRAFT | Code HEAD `dc50f24762defb88c52ace8c651aa0453742fed2`**

## Accepted test evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| GitHub CI | Same HEAD | PASS |
| Chromium synthetic 390px / 1200px | Same HEAD | PASS |
| Supabase DB pgTAP / local migration repair and 8→10 guarded upgrade | Runs `40259256516` and `40259259386` | PASS |
| Age-encrypted Postgres custom dump | `scripts/run-local-age-backup-drill.sh` | PASS |
| Portable-key decrypt and restore to a separate disposable database | `CAFEOS_LOCAL_AGE_BACKUP_RESTORE_PASS` | PASS |
| Global-role metadata encrypted (password hashes excluded) and ciphertext checksums validated | Same CI runs | PASS |
| Actual staging PostgreSQL archive | Not executed | NOT_RUN |
| Actual staging off-host/Supabase managed-schema restore | Not executed | NOT_RUN |

## What was exercised

GitHub Actions runs PostgreSQL 17.6/Supabase on **127.0.0.1:54322 only** with a signed PGDG PostgreSQL 17 client and a synthetic one-time `age` recipient/identity. A synthetic source database contains two Vietnamese café sale records (combined **3155 minor units**) plus a sample `supabase_migrations` receipt. A custom-format dump is passed into age without plaintext dump files; `pg_dumpall --globals-only --no-role-passwords` is encrypted separately. The database ciphertext is decrypted directly into `pg_restore` via standard input on a **distinct** newly created empty database. Data row counts, totals, text digest and migration receipt version match. The created databases, private key and ciphertext are deleted on exit. No connection credentials for real staging or production are used.

## Findings fixed through real CI failures

- **Client/server version:** Ubuntu runner default `pg_dump 16.15` cannot dump PostgreSQL 17.6. The workflow now installs `postgresql-client-17` through the official PostgreSQL PGDG repository with `Signed-By` and uses its binary path.
- **Globals authentication:** `pg_dumpall -w` must have matching localhost libpq authentication, now supplied by a loopback connection string in the isolated test.
- **Standard input:** `pg_restore --list -` and `pg_restore --dbname=... -` were interpreted as filenames on PostgreSQL 17. The scripts now leave off the file argument so the piped archive is read from stdin.
- **Atomic archive:** the staging-specific backup candidate holds both ciphertext files and SHA-256 manifest in one private temp directory, validates them, then publishes the complete directory in a single rename.

## Critical limits / next release gates

The synthetic restore proves PostgreSQL and `age` tooling behavior, **not** a portable recovery of a full Supabase staging project. Staging includes managed Auth/Storage/migration schemas and role/extension/ownership constraints. A full encrypted staging logical backup has **not** been created. The only staging-derived archive so far is the earlier **7/7 original SQL migration receipt DPAPI backup** (same-profile restore verified). 

Before any real `migration repair`: securely provision a staging-specific DB credential file; establish portable age public recipient and separate private identity/off-host recovery custody; capture complete encrypted staging database and role metadata; test a fresh disposable target restoring real schemas/data with verified auth/migration/RLS invariants; review Supabase security advisor warnings and approve an exact version mapping. Keep PR #74 Draft / NO-GO and production unchanged.

References: https://www.postgresql.org/download/linux/ubuntu/ and https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore .
