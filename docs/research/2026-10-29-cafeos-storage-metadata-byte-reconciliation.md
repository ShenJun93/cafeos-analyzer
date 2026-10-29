# CafeOS — Storage metadata ↔ object bytes recovery reconciliation (synthetic)

Date: 2026-10-29. Base: PR #100 synthetic encrypted external Storage bytes. All work in independent PR worktree; **no staging, customer object, real Storage API, S3, Auth JWT or production connection**.

## Why a new check is needed
Supabase database backups may preserve rows in `storage.buckets`/`storage.objects` without preserving the physical object bytes in external object storage. Independently verifying SHA-256 of downloaded bytes is also insufficient: recovered files can have the wrong bucket visibility, tenant owner, version or object key. See https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore.

A read-only inspection of CafeOS' local cleanroom PostgreSQL 17.11 confirmed:
- `storage.buckets`: `id`, `name`, `public`, `owner_id`, `file_size_limit`, `allowed_mime_types`, etc.
- `storage.objects`: `id`, `bucket_id`, `name`, `owner_id`, `version`, `metadata`, etc.
- Both tables have RLS enabled. This observed shape is schema context, **not actual-Supabase data readback in the CI test**.

## Implemented synthetic contract
`scripts/verify-cafeos-synthetic-storage-recovery.mjs` compares **three independent conceptual categories**:
1. Source bucket/object metadata snapshot with selected restore-critical fields.
2. Target bucket/object metadata snapshot; bucket IDs, visibility, owner, max size, allowed MIME; object ID, path, version, owner, metadata size and MIME are compared exactly.
3. Source object-byte manifest with bucket/key/version/SHA-256, compared against ACTUAL recovered file bytes.

Verifier rejects missing or extra object metadata, duplicate bucket/object keys, changed version or owner, bucket visibility or MIME/size rules, unsafe relative paths, symlinks, special files, missing/extra restored files, byte-size and SHA-256 drift. Hashing streams using `FileHandle.createReadStream` rather than loading entire objects into memory, and files are opened with `O_NOFOLLOW` on Linux.

**Source snapshot and restored snapshot in this test are deliberately fake fixtures.** In the integrated `age` synthetic drill, the target metadata is a copy of the source fixture to establish a *positive* case; dedicated Node negative controls mutate the target metadata and show failures. It does **not** simulate real Storage database export/import or API write/readback. No external project credentials are involved.

Integrated after real synthetic `age` decrypt and BEFORE reporting PASS in `scripts/run-ci-cafeos-storage-objects-age-drill.sh`. All source, target, manifest and recovered bytes live in WSL/GitHub `/dev/shm` tmpfs with EXIT cleanup. Distinct workflow `.github/workflows/cafeos-storage-object-recovery-synthetic.yml` runs without Docker/GHCR.

## Acceptance and limits
MAIN-PC WSL tests `restore-drill-safety.test.mjs` + `storage-recovery-reconcile.test.mjs`: **41/41 PASS, 0 skip**; integrated age roundtrip with new metadata-byte check: PASS, source buckets 2 / objects 2 synthetic. Tests cover negative target-attribute and object-byte cases, including traversal and symlink. GitHub Actions exact child-head evidence required separately before CI gate closes.

Still **NOT PROVEN**: true source and target Supabase Storage metadata snapshot from a supported interface, Storage API and external file bytes roundtrip, RLS/policy/JWT tenant-bound access checks, owner-authorized staging backup, independent off-device key custody, managed full-stack Supabase restore, staging migration repair, merge or deploy. Historical zero objects does not remove the future actual-source inventory gate.

This is not a real-data backup utility; it must not be pointed at real source or restore targets. PR remains Draft, **RELEASE NO-GO**.
