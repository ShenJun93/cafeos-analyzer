# CafeOS — second-device age recovery acceptance (owner-executed)

Date: 2026-10-28 (Asia/Ho_Chi_Minh). PR #74 remains Draft / Release NO-GO.

## Purpose and limits

The MAIN-PC WSL provisional age identity cannot be considered safely recoverable until a genuinely **independent trusted device** can decrypt an escrow copy of the original identity with its own recovery private identity. The software verifies cryptographic readback and two independently preserved public trust anchors. It **cannot prove physical device independence** or a real staging database restore; the owner must attest custody separately.

Do NOT send private identities, ciphertext, staging credentials or decrypted bytes to ChatGPT, GitHub, CI or screenshots. Do not copy the second device's private identity onto MAIN-PC. The escrow must stay outside all Git worktrees.

## A. Generate a recovery identity on the second device only

In a trusted Linux/WSL installation, using trusted age and age-keygen binaries, run as a nonroot owner:

    umask 077
    mkdir -p "$HOME/.local/share/cafeos-offhost-recovery"
    chmod 700 "$HOME/.local/share/cafeos-offhost-recovery"
    age-keygen -o "$HOME/.local/share/cafeos-offhost-recovery/recovery-identity.txt"
    chmod 600 "$HOME/.local/share/cafeos-offhost-recovery/recovery-identity.txt"
    age-keygen -y "$HOME/.local/share/cafeos-offhost-recovery/recovery-identity.txt"

Transport ONLY the printed PUBLIC recipient to MAIN-PC WSL in a separate owner-owned 0600 single-line file. Never transport the second-device private identity.

## B. Create the escrow on MAIN-PC WSL

From the vetted CafeOS checkout, on an interactive nonroot terminal:

    bash scripts/prepare-cafeos-age-recovery-recipient.sh /secure/path/to/second-device-recipient.txt

The guarded script publishes five files at:

    $HOME/.local/share/cafeos-staging-recovery-escrow

The output now includes CAFEOS_ESCROW_MANIFEST_SHA256 (SHA-256 of the manifest.sha256 file), along with OFF_HOST_RECOVERY_NOT_PROVEN.

**Independently record two public trust anchors OUTSIDE the copied escrow, and preserve them on the second device from a different handoff than the escrow itself:**

1. Original MAIN-PC source public recipient: the single line that existed BEFORE the escrow, in $HOME/.local/share/cafeos-staging-backup/recipients.txt. Transport only this public value.
2. The CAFEOS_ESCROW_MANIFEST_SHA256 printed by the source operator; store it as one lowercase 64-hex line, recorded separately from the escrow.

Copy the encrypted five-file escrow to the independent trusted device without including either private key. Ensure escrow directory mode 0700 and each of its five files mode 0600. Keep the recovery identity and two separately recorded trust-anchor files in a DIFFERENT directory at mode 0600 outside Git.

## C. On the second device, verify cryptography without writing a recovered private identity

Obtain the reviewed verifier code from the trusted repository, not executable instructions inside the copied escrow, then run:

    bash scripts/verify-cafeos-age-recovery-offhost.sh \
      "$HOME/secure-cafeos-escrow" \
      "$HOME/.local/share/cafeos-offhost-recovery/recovery-identity.txt" \
      "$HOME/.local/share/cafeos-offhost-recovery/trusted-source-public.txt" \
      "$HOME/.local/share/cafeos-offhost-recovery/trusted-manifest-sha256.txt"

These are FOUR file paths, not secret values. The verifier refuses root, Git-contained trust material, symlinks, improper ownership or file modes, manifest mismatch, wrong recovery private key, incorrect public recipient, and forged ciphertext. It decrypts the original identity ONLY through an age-to-age-keygen pipe and prints public-status strings, not the private identity.

Successful output:

    CAFEOS_AGE_RECOVERY_CRYPTOGRAPHIC_READBACK_PASS
    INDEPENDENT_DEVICE_CUSTODY_REQUIRES_OWNER_ATTESTATION
    ACTUAL_STAGING_BACKUP_AND_DATABASE_RESTORE_NOT_PROVEN

Any error is a **STOP**. Never substitute synthetic CI success for actual off-host custody.

## D. Custody evidence, still-needed gates

Record privately: date/time, reviewed Git commit, escrow manifest SHA-256, independent source of each trust anchor, which two physical machines were used, owner/key custodian, verifier exit status and separately observed recovery. Do not record private-key content, backup plaintext, or passwords.

Only after actual owner-confirmed off-host recovery may the next backup prerequisites be considered: staging-specific TLS root CA, external protected database password file, independently attested migration-ledger SHA-256, protected encrypted output location, compatible PostgreSQL clients and staging-read-only export policy.

Even a valid encrypted raw pg_dump is NOT a Supabase-compatible restore certification. Actual staging-derived roles/schema/data and original migration receipts must be securely captured and restored on a separate compatible target with Auth/RLS/managed-schema verification before any migration-history repair.

**NO migration repair, db push, staging DDL/DML, production deployment or PR merge is authorized by this runbook.**

Reference: https://man.archlinux.org/man/age-keygen.1.en
