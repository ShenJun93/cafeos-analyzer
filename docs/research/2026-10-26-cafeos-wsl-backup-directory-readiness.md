# CafeOS — WSL staging backup destination readiness

Date: 2026-10-26. Project: cafeos-staging (wjatnyvdygvblirggdcm). PR #74 Draft. MAIN-PC operator workspace; no staging database credentials used or staging backup performed.

## Readiness evidence

On the real MAIN-PC WSL unprivileged Linux user, created only two empty directories:

| Artifact | Linux path | Permissions | Status |
| --- | --- | --- | --- |
| Encrypted archive output destination | $HOME/.local/share/cafeos-staging-archives | 0700 | READY |
| Separate private configuration area for future operator-supplied CA and PGPASSFILE | $HOME/.config/cafeos-staging | 0700 | READY, EMPTY |
| Existing provisional age identity | $HOME/.local/share/cafeos-staging-backup/identity.txt | 0600 | PRESENT, LOCAL ONLY |

Verified that the archive destination is outside the Git working tree, separate from the provisional identity, on a Linux filesystem, and can atomically rename a private temporary directory. The temporary synthetic marker was deleted and the destination subsequently rechecked: **zero archive members**. The separate configuration directory also had **zero files**. No private key material, password, CA contents or authentication data entered Git, chat or logs.

Portable binaries are available under the previously verified WSL path /mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix: age, age-keygen, pg_dump, pg_dumpall, pg_restore and psql. These are not on the default WSL PATH; operator must explicitly configure the tested portable prefix for a future authorized backup execution.

This satisfies **only the local empty destination prerequisite** in the existing backup candidate script; it is NOT a successful backup or an off-machine independent copy. Backups stored solely in the same WSL profile are not independent of loss of MAIN-PC.

## Hard blockers remain unchanged

1. Obtain the exact database **session pooler** tuple from this project's authenticated Dashboard Connect panel; earlier probe of a region-pattern hostname is not a verified project connection tuple. Direct DB hostname is IPv6-only from MAIN-PC and was unreachable.
2. Obtain this project's trusted root CA via the authenticated Database Settings **Download Certificate** action. Verify `PGSSLMODE=verify-full` and `PGSSLROOTCERT`; the Linux system CA bundle did NOT verify the tested pooler certificate. The legacy public URL `https://supabase.com/prod-ca-2021.crt` returned HTTP 404, so it is not an alternative acquisition channel.
3. Store an operator-owned, protected 0600 `PGPASSFILE` outside Git and outside the archive directory without logging the password. No current credential file exists.
4. Prove off-host recovery of the provisional age private identity on an independent device or separately controlled encrypted recovery domain **before** using it to encrypt real staging data.
5. Prove an isolated real-data Supabase-compatible roles/schema/data + separate migration-receipt restore, per `docs/research/2026-10-26-cafeos-recovery-path-correction.md`. The existing raw pg_dump archive alone is not proof of managed Supabase recovery.

## Mandatory hold

The 7 original staging migration receipts remain untouched. Two Commerce guard migrations are unapplied. Source 3-workflow synthetic CI at preceding HEAD bba7792 succeeded. No staging DML/DDL, migration repair, db push, real pg_dump, clean-room restore, PR merge or production deployment occurred.

**Draft / Release NO-GO.**
