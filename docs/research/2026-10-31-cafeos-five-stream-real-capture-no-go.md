# CafeOS — Real staging encrypted five-stream capture: NOT AUTHORIZED

Date: 2026-10-31. Parent: Draft PR #108. All staging mutations, exports and releases remain NO-GO.

## Why an additional manual capture path exists

The CafeOS staging source is nonempty (one Auth user/identity, seven legacy migration receipts and 17 public persistent tables). The connected Supabase organization was verified on 2026-10-31 as **Free plan**; Supabase's native **Restore to a new project** beta requires a paid plan and physical backups. There is currently no independent CafeOS actual-data restore target. Do not use any unrelated Supabase project. Primary source:
https://supabase.com/docs/guides/platform/clone-project

The historical two-file raw pg_dump operator script is not equivalent to Supabase's five separately filtered roles/schema/data/history-schema/history-data streams:
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Owner-approved manual capture candidate

New script: **scripts/operator-capture-cafeos-staging-five-stream-age.sh**. It cannot run without all of the following:
- Nonroot private WSL owner and no CI environment; a review of the exact script/commit before invocation.
- Exact owner export approval, separate owner offhost custody attestation, and owner attestation that ALL staging writes have actually been frozen.
- A separately kept six-line owner approval receipt (chmod 0600, not in Git, escrow or backup target), containing these exact fields:

    CAFEOS_OWNER_CAPTURE_APPROVAL_V1

    OFFHOST_CUSTODY_VERIFIED_BY_OWNER=YES

    STAGING_WRITE_FREEZE_VERIFIED_BY_OWNER=YES

    REAL_STAGING_ENCRYPTED_CAPTURE_APPROVED=YES

    ESCROW_MANIFEST_SHA256=dd63b211dc5a25c516b16494ebde997fef211524ffe0184a4a597d4b17e2bf1d

    OWNER_SIGNOFF_DATE_UTC=YYYY-MM-DDTHH:MM:SSZ

- An existing private WSL-native ciphertext directory outside /mnt and outside Git; at least 1 GiB free. No intermediate plaintext SQL is allowed.
- Exact local pinned Supabase CLI 2.122.0, original age source identity, DIFFERENT off-host recovery public recipient, encrypted escrow pin, private 0600 PGPASSFILE and pinned TLS root CA.
- Existing read-only source preflight: TLS verify-full, all seven original SQL receipt bytes and source identity pins unchanged.

This owner receipt is a human declaration, NOT independent cryptographic evidence that physical Samsung custody was truly verified or that the database was quiescent. The earlier Samsung/Termux recovery readback was owner-reported PASS. Durable external device custody proof and an actual maintenance/write-freeze procedure remain outstanding.

## Intended owner command (do not run before all gates)

From the reviewed dedicated worktree with proper private paths:

    export CAFEOS_OWNER_APPROVAL_FILE="$HOME/.local/share/cafeos-private-approvals/owner.txt"
    export CAFEOS_COMPATIBLE_BACKUP_DIR="$HOME/.local/share/cafeos-real-encrypted-backups"
    export CAFEOS_REAL_STAGING_EXPORT_APPROVAL="OWNER_AUTHORIZES_ENCRYPTED_CAPTURE_ONLY"
    export CAFEOS_SOURCE_WRITE_FREEZE_APPROVAL="OWNER_ATTESTS_STAGING_QUIESCENT"
    export CAFEOS_OFFHOST_CUSTODY_APPROVAL="OWNER_ATTESTS_INDEPENDENT_CUSTODY"
    bash scripts/operator-capture-cafeos-staging-five-stream-age.sh

No owner has supplied a qualifying receipt or authorized execution at this checkpoint. **This command must NOT be run now.**

If invoked later under legitimate approval, the script would stream each of five CLI SQL components directly to age (two public recipients). It would create only ciphertext, a public-recipient list, source ledger fingerprint, manifest and a warning file. It attempts to prove nonempty readback, Auth users/identities export table shape, migration history first/last known original versions, unchanged seven-receipt fingerprint and atomic manifest-checked publication. The data-only stream explicitly excludes storage.buckets_vectors and storage.vector_indexes, matching the official Supabase manual CLI migration guidance. A separate SELECT-only source gate compares 23 aggregate counts before/after (17 public persistent tables plus Auth, Storage, Vault and migration receipts) and stores only the SHA-256 of the normalized count JSON in the private archive. That gate detects row-count drift, not same-count content edits.

**Critical consistency limitation:** five independent dump commands do NOT share one guaranteed PostgreSQL snapshot. Neither checking the seven-statement migration fingerprint nor comparing 23 pre/post table counts proves Auth, business and finance point-in-time coherence. Equal counts can hide updated rows or concurrent insert/delete churn. The owner must enforce and document true write quiescence or replace this with a proven coherent backup method. The script cannot guarantee the former.

## Required independent restore

A separate, owner-approved and Supabase-compatible environment must restore and verify the actual encrypted output, including original seven full migration receipts, Auth users/identities, all 17 public tables and nonempty source business state, managed schema dependencies and Storage bytes if present, exact tenant isolation, cashier/manager signed-JWT RLS and POS financial controls.

Encrypted output is confidential and must not be shared in public Git/issues/chats. No source plaintext SQL, private identity or password should be logged. The existence of ciphertext is NOT sufficient for release.

**At present: no real staging capture, no owner custody signoff, no independent real-data restore, no release.**
