# CafeOS — Real staging capture preflight (inspection-only)

**Date:** 2026-10-31. **Parent:** Draft PR #95. **Stage:** SOURCE CHECK PASS / CUSTODY NOT FULLY ATTESTED / EXPORT AND RESTORE NOT EXECUTED. **Release:** NO-GO.

## Why this gate exists

The source `cafeos-staging` has nonempty Auth and first-party Analyzer/Control Tower history. It is **not disposable**. Previous synthetic GitHub Actions tests (PR #95–#103) prove local encryption/restore mechanics, not actual staging-source capture. The old `scripts/backup-cafeos-staging-age.sh` uses raw `pg_dump -Fc` and `pg_dumpall --globals-only`; those two streams are **not** equivalent to the Supabase-specific five-component roles/schema/data/history-schema/history-data export, managed Auth/Storage treatment and independent restore workflow. Do not use it to declare recovery or run it against staging as a substitute.

The official Supabase manual migration guide calls for distinct roles, schema, data, and migration-history operations, plus consideration of changed managed `auth`/`storage` schemas and data-only exclusions for Storage vector tables:
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

Official backup guidance notes that database backups exclude Storage object **bytes** even though metadata may be included:
https://supabase.com/docs/guides/platform/backups

## New owner-only preflight

`scripts/check-cafeos-staging-capture-readiness.sh` **does not perform a backup**. It:

1. Refuses CI, root, arguments and missing explicit `SOURCE_READONLY_ONLY` acknowledgement.
2. Checks protected local WSL root/age/escrow/config directories: 0700, owner-owned, not inside Git; secret and anchor input files: 0600, owner-owned, regular, nonsymlink.
3. Requires exact Supabase CLI **2.122.0**, pinned staging CA checksum, original MAIN-PC source age identity/public recipient alignment, different off-host recovery public recipient, pinned encrypted escrow manifest SHA-256 and checksums of the four known escrow members. **Never copies/decrypts the second-device private identity.**
4. Invokes the already-proven `check-cafeos-staging-readonly-verifyfull.sh` for protected TLS `verify-full`, explicit `BEGIN TRANSACTION READ ONLY` and all **seven original SQL receipt bytes** matching the independently pinned ledger fingerprint. No Auth/business row payloads.
5. Prints machine-verifiable local readiness **separately** from the outstanding off-host owner custody attestation, capture authorization and independent restore target. It **always prints** `CAFEOS_REAL_SUPABASE_COMPATIBLE_BACKUP_NOT_AUTHORIZED_OR_EXECUTED` and `CAFEOS_RELEASE_NO_GO` even when source checks pass.

With MAIN-PC WAG approved/available and owner present, run from the **reviewed PR branch/worktree**, not an arbitrary downloaded script:

```bash
cd /mnt/e/Projects/cafeos-staging-capture-preflight-v1
CAFEOS_STAGING_READONLY_PREFLIGHT_ACK=SOURCE_READONLY_ONLY \
  bash scripts/check-cafeos-staging-capture-readiness.sh
```

The path is illustrative: create/use a distinct trusted Git worktree for the reviewed branch. The main `E:/Projects/cafeos-analyzer` worktree remains on PR #74 and must not be silently switched. Do not use `--dry-run` on a real Supabase CLI database dump: previous pinned CLI testing showed expansion of the DB password in its diagnostic output.

No personal secret, actual age identity, actual database ciphertext, database URL with password, user email, or authenticator key may be copied into GitHub issues, logs or chat.

## Specific open operator gates

- **Samsung/Termux:** owner reported `CAFEOS_AGE_RECOVERY_CRYPTOGRAPHIC_READBACK_PASS` on 2026-10-29 from an independently controlled recovery identity; main-PC escrow member integrity was reconfirmed 2026-10-31. Neither result is an independently auditable **physical-custody attestation**. The owner must keep on Samsung, **outside** the copied escrow and Git, a durable dated record of identity origin, manifest SHA-256, source public-recipient binding, exact verifier exit/pass result, device trust and key storage, independent trust-anchor provenance and their explicit approval. The recovery private identity remains on that second device. Do not confuse a screenshot/pass marker with proof of custody.
- **Real export:** obtain explicit owner approval for real-staging encrypted copy, select a private encrypted output directory with available capacity and authorized external recipient and preflight the exact CLI 2.122.0 remote TLS route, restrictive `PGPASSFILE`, five-filtered stream flags and error/cleanup paths. Stream plaintext directly into `age`, never to an intermediate SQL file. Avoid `--dry-run`.
- **Storage and Auth:** take a fresh read-only inventory at capture time; Auth users/identities were previously nonempty, and zero Storage buckets/objects at a past checkpoint does **not** prove absence at capture time. Preserve original seven full migration statement bytes and any relevant managed schema customizations; do not erase historical receipts or silently reconcile.
- **Restore target:** an owner-approved isolated compatible Supabase environment with adequate capacity, trusted DB connection, required managed services and supported encryption-root/role handling. It must be independent of the original staging DB and its own backup ciphertext; verify restored Auth, 17 public tables, exact original receipts, JWT/RLS and tenant/finance invariants. A same-PostgreSQL-server synthetic drill is not this target.
- **Release:** staging promotion, migration repair, source write, real cashier rollout, PR merge and merchant deployment stay blocked pending independent acceptance.

## Verification boundary

GitHub CI runs the static safety contract and shell syntax check using synthetic/no-contact input; it **cannot attest a Samsung private key or real source backup**. An owner-local successful preflight on a live stage is stronger than static tests but still **only** a read-only source+escrow check. Never mark `BACKUP_COMPLETE`, `RESTORE_PROVEN` or `RELEASE_GO` from this script.
