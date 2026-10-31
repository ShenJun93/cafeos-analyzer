# CafeOS — Real staging encrypted five-stream capture: NOT AUTHORIZED

Date: 2026-10-31. Parent: Draft PR #108. All staging mutations, exports and releases remain NO-GO.

## Recovery gate classification — match canonical product policy

**Authority:** [`docs/DATA_LIFECYCLE_RECOVERY_DESIGN.md`](../DATA_LIFECYCLE_RECOVERY_DESIGN.md), [issue #23](https://github.com/ShenJun93/cafeos-analyzer/issues/23) and [issue #62](https://github.com/ShenJun93/cafeos-analyzer/issues/62). They make `cafeos-staging` **synthetic-only** and explicitly permit rebuilding it from migrations plus test fixtures. They do **not** require a paid production recovery strategy for this staging project. **No real merchant rows may be introduced into synthetic staging to justify a restore test.** Existing staging Auth and tenant records still deserve care: do not assume an Auth identity or customer field is disposable or disclose it.

This PR is an **optional preservation/export experiment for a nonproduction source**, subject to the existing owner gates. It is **not a production release gate**, and its ciphertext/readback must not be promoted to production-tier backup or disaster-recovery evidence. Do not spend more resources on staging archival merely to make a release status green. The product's mandatory **E2 real-data** gate is a *separately approved* Supabase **Pro-or-stronger** project with permissioned merchant data, ordinary platform daily/off-site recovery points, a fully compatible **production-tier isolated restore acceptance**, tenant/RLS correctness and documented operator access. The closed synthetic restore drill [issue #41](https://github.com/ShenJun93/cafeos-analyzer/issues/41) remains sufficient for the synthetic engineering gate, not for E2.

**Target options and boundaries:**

- **Local isolated Supabase stack (MAIN-PC/WSL):** feasible *in principle* without changing the Supabase Free organization or paying for a new project, using a separately named Docker network/project, loopback-only published ports, private storage, and PostgreSQL + managed Auth/Storage services. It is independent of the remote staging **PostgreSQL process**, so it can serve as a **local technical restore rehearsal**, but shares the MAIN-PC failure domain and thus is **not** an off-device disaster-recovery copy or a production-tier cloud restore. Do not assert feasibility until actual free disk/RAM, Docker engine, image/extension parity, clean target instance and access isolation are measured. Official local setup guidance: https://supabase.com/docs/guides/local-development
- **Separate production-like Supabase project:** could satisfy the eventual E2 target under the approved Pro-tier/data governance policy, but creating a billable project or migrating actual data requires a separate explicit decision. Do not reuse any unrelated project as a test destination. Supabase's native Restore to a New Project flow itself requires a paid plan with physical backups: https://supabase.com/docs/guides/platform/clone-project

**Operational access blocker on 2026-10-31:** the authenticated MAIN-PC WAG device remains online, but FULL authority is no longer published. Local disk/Docker/restore-target inspection did not execute in this checkpoint. Desktop Commander fallback independently reports the MAIN-PC device offline. No new target was provisioned and no source data was copied. Restoring MAIN-PC access must use a legitimately owner-enabled session; do not bypass the gateway ACL.


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

This owner receipt is a human declaration, NOT independent cryptographic evidence that physical Samsung custody was truly verified or that the database was quiescent. A fresh 2026-10-31 Samsung/Termux **ADB-assisted cryptographic readback PASS was directly observed** with the SHA-pinned existing verifier and recorded privately on MAIN-PC as `receipt-adb-readback-20261031.md` (SHA-256 `c768564a8c5aaa2bbf5f7c2d4c16cc223ea362d99684f960e46a48b10081dd57`). Since Wi-Fi ADB remained enabled and MAIN-PC could drive Termux, this is **not** an owner-independent physical custody attestation. An independently preserved custody approval and an actual maintenance/write-freeze procedure remain outstanding.

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

**At present: Samsung ADB-assisted readback PASS; no owner-independent physical custody signoff, no real staging capture, no independent real-data restore, and no release.** The production-tier E2 recovery gate is separate from this staging-only candidate.
