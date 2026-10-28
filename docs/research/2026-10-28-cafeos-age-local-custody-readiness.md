# CafeOS — local age custody readiness, no secrets (2026-10-28)

**Status:** OPERATOR PREFLIGHT ONLY. Read-only, network-free, nonroot Linux/WSL utility. No off-host device, encrypted escrow, backup, Supabase migration, database restore or financial transaction is certified by this script.

**Why:** On PR #90 the actual release remains blocked by independently recoverable custody of the source age identity. Desktop Commander on the operator's Windows PC is offline, and no second trusted device has been attested. More synthetic provenance SQL is not the immediate operational need.

## 1. MAIN-PC WSL local check

From a trusted, reviewed CafeOS checkout on MAIN-PC WSL, as the normal nonroot user, run:

```bash
bash scripts/check-cafeos-age-custody-readiness.sh --source
```

This checks only local protected file metadata and the original keypair:
- Source directory `$HOME/.local/share/cafeos-staging-backup` must exist, be owned by the invoking user and mode `0700`, outside Git.
- `identity.txt` and `recipients.txt` must be distinct, owner-owned, mode `0600` or `0400`, outside Git, regular nonsymlink files.
- `age-keygen -y` derives the original **public recipient** from the already-existing private identity; the script compares that in memory to the single line in `recipients.txt` without printing either value.
- `age-keygen` is discovered in PATH or the previously vetted user-owned portable binary location. The utility downloads nothing and makes no changes.
- Presence of `$HOME/.local/share/cafeos-staging-recovery-escrow` is reported **only as presence**, never as verification.

Expected source readiness output:

```text
CAFEOS_ESCROW_NOT_CREATED
CAFEOS_SOURCE_AGE_LOCAL_PREFLIGHT_PASS
INDEPENDENT_DEVICE_CUSTODY_NOT_ATTESTED
STAGING_BACKUP_AND_RESTORE_NOT_PROVEN
```

If an escrow folder exists, the first line becomes `CAFEOS_ESCROW_PRESENT_NOT_VERIFIED`, with **no** upgrade in trust.

## 2. Second trusted device local check

Generate and retain the **recovery private identity exclusively on the second trusted device** following `docs/research/2026-10-28-cafeos-offhost-age-acceptance-runbook.md`. Then, from a trusted copy of this checkout, run this command **on that device only**:

```bash
bash scripts/check-cafeos-age-custody-readiness.sh --recovery \
  "$HOME/.local/share/cafeos-offhost-recovery/recovery-identity.txt"
```

The tool checks existence, ownership, private mode, nonsymlink status, Git boundary, and whether the identity can yield a valid public recipient. It prints **no private key**, **no derived recipient** and **no filesystem path**. Output:

```text
CAFEOS_RECOVERY_IDENTITY_LOCAL_PREFLIGHT_PASS
INDEPENDENT_DEVICE_CUSTODY_NOT_ATTESTED
STAGING_BACKUP_AND_RESTORE_NOT_PROVEN
```

The final two lines are **always** printed: software cannot establish physical separation, independent trust-anchor provenance or real staging database recovery.

## 3. Required off-host proof (owner, NOT automated)

After both local checks pass, continue the **existing guarded process**:
1. Transport only the second device's **public** recipient to MAIN-PC; never transfer the second private identity.
2. On MAIN-PC, use `scripts/prepare-cafeos-age-recovery-recipient.sh` (requires an interactive, nonroot owner) to encrypt the source private identity into a five-file escrow **outside Git**.
3. Preserve the original source public recipient and escrow manifest SHA-256 as **two independently transmitted public trust anchors**, outside the copied escrow.
4. Copy the escrow (ciphertext only) to the second device and invoke `scripts/verify-cafeos-age-recovery-offhost.sh` with escrow path, independently held second identity and both separate trust anchors. Do not paste paths containing secrets, private identities, ciphertext, decrypted data or credentials into chat or logs.
5. Privately record which two physical devices were used, owner/key custodian, date, Git HEAD, successful verifier exit status and independent trust-anchor chain. A successful local readback alone is not physical custody proof.
6. Only after approved off-host recovery can a separately authorized Supabase-compatible encrypted full staging backup plus independent restore be considered. Even `pg_dump`/`age` ciphertext readback cannot establish managed Auth/Storage/RLS restore acceptance by itself.

**STOP** if any preflight emits `CAFEOS_AGE_LOCAL_PREFLIGHT_BLOCKED:*`. Do not bypass file permissions, commit keys, use admin/root as a shortcut, create an escrow from the same machine's fake "recovery" identity or run any staging-changing SQL.

## Evidence boundary

`scripts/test-cafeos-age-custody-readiness.sh` and GitHub workflow `.github/workflows/cafeos-age-custody-preflight.yml` exercise *generated synthetic keys* for working source/recovery and negative controls: missing files, symlinks, wrong modes, keypair mismatch, Git-contained recovery identity, incorrect arguments and an existing escrow marker. This proves only the safety and behavior of this diagnostic in one CI Linux environment. It is not a test of the operator's WSL filesystem, portable tools, independent trusted device or real backup.

**Release state: NO-GO.** No merge, migration history repair, guard deployments, source-account binding or merchant release is authorized by a positive local readiness check.
