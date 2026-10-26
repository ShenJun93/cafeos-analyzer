# CafeOS staging — portable database backup readiness (NOT RUN)

2026-10-26 · PR #74 Draft · staging only.

## Current authoritative facts

- Supabase organization plan: **Free / tier_free**. Do **not** assume automatic daily project backups; paid-plan daily backups and PITR differ. Check the database backup dashboard before relying on any retention claim.
- Current read-only staging: PostgreSQL 17.6, **14,011,539 bytes** of database size; **53** base tables in core managed/business schemas; **1** Auth user, **0** Storage objects, **7** old migration receipts.
- Seven original receipt SQLs are already DPAPI-encrypted on MAIN-PC and verified against fresh staging SHA-256. This is not a complete database or portable backup.
- Live security advisor: 3 privileged authenticated SECURITY DEFINER function warnings and leaked-password protection warning. A read-only grant/role check showed `anon` has no EXECUTE on the three privileged Commerce RPCs, while `authenticated` has execute access subject to their `auth.uid()` and explicit tenant-role checks. Independent security evaluation is still required.

## Prepared, but not executed

`scripts/backup-cafeos-staging-age.sh` is a **fail-closed candidate** for owner execution from a trusted WSL/Linux environment with PostgreSQL 17+ clients and `age`. It requires:

1. Staging-specific libpq parameters `PGHOST`, `PGUSER`, `PGDATABASE=postgres`, `PGPORT=5432`; only the pinned CafeOS direct host or Singapore session pooler is allowed.
2. `PGSSLMODE=verify-full` and a trusted `PGSSLROOTCERT`. Supply credentials via an out-of-repository `PGPASSFILE` with mode `0600`. Never paste passwords, database URLs containing passwords, auth JWTs or age private keys into chat, Git or CI logs.
3. An independent, restricted backup destination directory (mode `0700`), an `age` recipients file containing **portable public encryption recipients**, and a private `age` identity file stored **outside that destination and out of Git**, with recovery ownership established.
4. Read-only seven-receipt preflight against the real staging connection. If versions or connection host differ, STOP.
5. Stream `pg_dump -Fc` and `pg_dumpall --globals-only --no-role-passwords` straight to recipient-encrypted age ciphertext. Decrypt streaming in memory to inspect `pg_restore --list` and confirm ciphertext checksums. No plaintext dump file is created.
6. **Independently restore the encrypted archive into a fresh disposable PostgreSQL/Supabase-compatible database** and prove actual business/managed schemas, tenant RLS, Auth data, roles, tables, functions, financial invariants and migration history. `pg_restore --list` alone is NOT restore acceptance. Storage API objects and external platform configuration are outside a logical PostgreSQL dump.

The raw full-schema `pg_dump` contains managed-schema contents; restoration to a new managed Supabase project is **not guaranteed** and may require privilege/schema reconfiguration. Global export deliberately excludes role passwords. This candidate is not an approved one-command production backup and remains unexecuted until credentials, encryption key custody, restoration target and owner authorization are available.

## Stop/go

- **PASS:** Receipt archive (7/7) and read-only staging inventory.
- **PREPARED:** Portable age-encrypted streaming backup candidate; CI static/fail-closed checks.
- **NOT RUN:** Actual portable database dump; off-host decryption; full clean-room restore; restore compatibility.
- **HOLD:** Migration history repair, both Commerce integrity migrations on staging, authenticated JWT E2E, independent security approval and production.

References:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/reference/cli/supabase-inspect-db-role-configs
