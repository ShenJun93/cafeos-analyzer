# CafeOS — synthetic Storage object-byte recovery gate (2026-10-29)

**Purpose:** A Supabase database restore can recover `storage.buckets`/`storage.objects` metadata while leaving actual external Storage file bytes missing. CafeOS needs a distinct byte-level restore gate for any future real Storage content.

**Scope:** synthetic only, no Supabase network, real Storage API, S3, staging, production or project secrets. Source fixture has two fixed fake bucket/object keys (one binary NUL/high-byte fixture, one text fixture); source, ciphertext, age private key, restored bytes and tampered copies all live under `/dev/shm` (tmpfs), are restricted by `umask 077`, and are removed by an EXIT trap. The script requires CI env or an explicit synthetic-local opt-in. It is NOT a real object backup script.

**Fixture exercise:** generates temporary age identity; encrypts each fake object with age; restores under separate key paths; validates exact keyset/number and SHA-256 plus byte equality. Negative controls require rejection of an unrelated private key, corrupted ciphertext, one missing object, one unexpected object, and corrupted restored bytes. No object contents or keys are printed to CI logs.

**Verification evidence:** MAIN-PC WSL age 1.2.1, successful synthetic exercise and cleanup, as well as `bash -n` and `node --test tests/restore-drill-safety.test.mjs` 39/39 PASS on the new branch. The independent workflow `.github/workflows/cafeos-storage-object-recovery-synthetic.yml` deliberately does not invoke `supabase start`, Docker or a GHCR image pull; it installs age from Ubuntu apt and runs the same synthetic test.

**Acceptance boundary:** This validates file-byte encryption, roundtrip, hash and mismatch detection only. It does NOT prove actual Supabase Storage API upload/download, bucket and RLS policy enforcement, object metadata/version/ownership consistency, large-file performance, provider-specific settings, JWT, real external buckets or a complete Supabase project restore. The historical staging inventory reported 0 buckets/0 objects at that checkpoint, but must be refreshed before any approved real backup.

**Release holds:** independent custody signoff for age recovery key; separately approved actual-source capture; verified TLS/secret-safe paths; actual Storage metadata plus external bytes and target API readback; target-issued JWT tenant-isolation tests; full managed platform compatibility. PR remains DRAFT, release NO-GO.

Official Supabase reference: https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore (explicit distinction between restored bucket/file metadata and missing external S3 files).
