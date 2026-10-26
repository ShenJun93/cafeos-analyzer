# CafeOS — full staging backup execution gates (owner-controlled)

2026-10-26 · Project: `cafeos-staging` · Free plan · PR #74 Draft · **NO DATABASE CHANGE AUTHORIZED**

## Already verified

The seven original Supabase migration receipts have been archived as Windows DPAPI CurrentUser encrypted files on MAIN-PC, and 7/7 were independently restored and checked against real staging SQL SHA-256. A separate *synthetic only* PostgreSQL 17 + age full logical backup/restore passed in GitHub Actions. The live read-only SQL fingerprint query in `scripts/sql/cafeos-staging-receipt-fingerprint.sql` reports `fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3`. This is a **point-in-time indicator**, not a permanent expected constant: fresh live versions and hashes must be independently checked at execution time.

## Blocked prerequisites on MAIN-PC

- MAIN-PC WSL uses **Ubuntu 26.04**, with no system-installed age/PostgreSQL client and no noninteractive sudo. **Portable tools now PASS without sudo:** age 1.2.1, PostgreSQL 18.6 client suite and libpq 18.6, unpacked from Ubuntu APT packages in `E:\\Projects\\CafeOS-Evidence\\portable-backup-cli-20261026` (outside Git). The binaries and libraries run; a one-time age key encrypted and decrypted a synthetic token successfully, and the key was securely discarded. This is not a staging DB credential or actual backup.
- From the Supabase Dashboard **Connect** panel, obtain the project-specific **staging** direct/session-pooler host and database login, and prepare a 0600 `PGPASSFILE` **outside Git**. Never copy database passwords, JWTs, key files, passwords embedded in URIs, or WSL privilege credentials into chat or Git.
- Supply a validated CA trust file with `PGSSLMODE=verify-full` and an exact pinned staging host. Never use `sslmode=require` as a workaround. Do not relax the script's project host or receipt-history guards.
- Generate a portable `age` recipient/public key and secure 0600 private identity, with an independent recovery custodian; private key must be **outside the backup destination and outside Git**. This single-account DPAPI archive is insufficient for off-machine recovery.
- Set `CAFEOS_EXPECTED_RECEIPT_SHA256` to the **previously recorded full-ledger checkpoint fingerprint**, whose seven individual receipt SQLs were separately verified against the DPAPI archive, and verify the fresh staging SELECT-only fingerprint matches. The combined ledger hash was originally computed by staging SQL, **not independently recomputed from the encrypted archive**. Reference fingerprint rechecked this batch: `fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3`. Do not populate the expected value from the backup process's live query. Any mismatch requires STOP and renewed independent attestation.
- Pre-create a private **0700** backup directory outside source control, ideally on storage backed up separately. Confirm sufficient free space, and determine a safe off-host encrypted copy plus tested key recovery path.

## Controlled staging backup — future action only

With the prerequisites satisfied, review and invoke `scripts/backup-cafeos-staging-age.sh` in a trusted WSL session using standard libpq environment variables and externally protected files. The script is **not** automatically invoked by CI. It checks the exact staging host/user, `verify-full` TLS, file permissions, PostgreSQL client major >=17, the exact seven-version historical ledger, full original SQL SHA-256 equality with the **separately pinned earlier ledger fingerprint**, and SHA-256 stability after the dump. It streams an encrypted PostgreSQL custom-format database archive and role metadata (without role passwords), validates decryption and checksums, and atomically publishes a complete private archive directory containing the checksum manifest and SQL ledger fingerprint.

**STOP** if the current ledger differs from the original attested version set, the before/after SQL fingerprints do not match, any encryption/decryption/checksum fails, the host/certificate cannot be authenticated or the private key/destination is in a repository. Do not bypass any guard merely to produce a file.

## Required separate recovery acceptance

A successful archive is **NOT a recovery acceptance**. On an independent isolated PostgreSQL/Supabase-compatible restore target, prove actual table counts/data, public/managed Auth and Storage schemas, all relevant functions/extensions, role/ownership grants, tenant RLS, three Commerce RPC privilege profiles, exact migration receipts and financial invariants. Account for Supabase-managed configuration, storage object blobs, dashboard secrets and other platform state **outside** a bare PostgreSQL dump. Do not run recovered SQL against existing staging or production. Store signed-off evidence in Git without any personal data, credentials, SQL receipts, encryption keys or raw archive bytes.

Until that real off-host restore passes and migration mapping has independent approval: **do not run** `supabase migration repair`, `supabase db push`, either pending guard migration, or a production deployment.

## Portable CLI verification on MAIN-PC (no sudo)

A user-owned, **non-Git** toolchain was created at `E:\Projects\CafeOS-Evidence\portable-backup-cli-20261026` by downloading three packages from Ubuntu 26.04 configured APT repositories, extracting them with `dpkg-deb -x`, and running binary/version checks. This did **not** use `sudo`, alter system packages, read Supabase database credentials or generate a permanent backup key.

| Package | SHA-256 of downloaded .deb |
|---|---|
| age 1.2.1-1build1 | `b6994be61dd9880456c36c13da5392ee4ab406763152cd86e33e430676aa8fb9` |
| libpq5 18.6 | `7e9199f54290b04a28e9f136207624ca30b0988d613159977fd84e8b4467e0a4` |
| postgresql-client-18 18.6 | `c46d1ace8f7d84a9648c63b566fff799b7ee3281db46ef6e7b99baf0fd7bd2e4` |

Verified `age --version`, `pg_dump --version`, `pg_dumpall --version`, `pg_restore --version`, `psql --version`, resolved dynamic library dependencies, and performed `MAIN_PC_AGE_ROUNDTRIP_PASS` with an ephemeral test-only private key deleted afterward.

To use the binaries in a **future owner-approved backup shell** (paths contain no secrets):

```bash
prefix=/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix
export PATH="$prefix/usr/lib/postgresql/18/bin:$prefix/usr/bin:$PATH"
export LD_LIBRARY_PATH="$prefix/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
age --version
pg_dump --version
```

The portable tools eliminate the package-install blocker but **do not** provide the necessary staging DB password, protected password file, trusted TLS CA, private age key recovery or full restore test. The backup script rejects private keys on Git worktrees and requires the private identity to have mode 0400/0600, so generate real secrets on an appropriate private filesystem, not an NTFS mount that cannot enforce Unix ownership/modes. Do not paste any credential into chat or Git.

## Independent encrypted-copy verification candidate (2026-10-26)

- After an owner-authorized, completed staging backup, capture `CAFEOS_BACKUP_MANIFEST_SHA256` **outside** the encrypted archive and outside Git. Copy the complete archive directory to an independent recovery environment (private directory mode 0700).
- On the independent environment, with an independently held age private identity (mode 0600/0400, outside Git and the archive), use `scripts/verify-cafeos-staging-age-archive.sh` with `CAFEOS_ARCHIVE_DIR`, `CAFEOS_AGE_IDENTITY`, `CAFEOS_EXPECTED_MANIFEST_SHA256` and the earlier pinned `CAFEOS_EXPECTED_RECEIPT_SHA256`. It performs offline manifest authenticity check against the separately recorded checksum, full ciphertext decryption, and a PostgreSQL custom-archive catalog read. No live database connection.
- This verifier is **not** a fresh-DB restore; it must never satisfy the actual Supabase-managed-schema clean-room restore gate by itself. The synthetic localhost drill runs it against a copied synthetic archive and rejects intentionally tampered ciphertext; this proves only the verifier's technical behavior.
- **Never publish actual archive bytes, its decryption identity or secret DB credentials in Git, PR comments, logs, or CI artifacts.** Retain `DRAFT / NO-GO` pending real backup, cross-machine key custody and independently restored staging database.

## Offline verifier negative controls — synthetic only

The disposable localhost age drill already proved correct independent-copy readback and rejection of corrupted ciphertext. The next CI acceptance also requires rejection of (a) a wrong out-of-band manifest SHA-256 and (b) a valid encrypted copy paired with an unrelated age private identity. These tests do not establish cross-machine recovery; only running the verifier on a real separately custodied encrypted archive and restoring the **actual** staging snapshot into an isolated compatible database can satisfy that gate.
