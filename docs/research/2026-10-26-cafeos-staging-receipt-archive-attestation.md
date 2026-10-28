# CafeOS — 2026-10-26 encrypted staging migration receipt archive attestation

**Scope:** read-only original SQL receipt capture for `cafeos-staging` (`wjatnyvdygvblirggdcm`). Source Git PR #74 Draft.  
**Status:** receipt archive and same-profile restore **PASS**; live migration repair **NOT EXECUTED**.

## Collection / custody

- Seven records from `supabase_migrations.schema_migrations`, with the original `version`, `name` and ordered complete `statements` array, were read from the staging database without updating it.
- Each record was delivered individually through stdin to an interactive PowerShell process on MAIN-PC, rather than embedding SQL in shell commands or recording plaintext on disk.
- The local protected directory is **outside any source repository** and has Windows inherited ACLs disabled, with explicit current-user/SYSTEM access. Each receipt is encrypted with the Windows `ConvertFrom-SecureString` default **DPAPI CurrentUser** scheme. A manifest stores no SQL text: only version, name, SQL byte count, original SQL SHA-256, and ciphertext SHA-256.
- A separate PowerShell process reopened each encrypted file, decrypted **only in process memory**, and compared the original receipt structure, bytes and checksums with the manifest. All **7/7 PASS**. A fresh SQL query on staging recalculated SHA-256 from the ordered `statements` array; all seven hashes matched these recovered files.

## Exact SQL fingerprints (SHA-256 of the original joined statements)

| Staging version | SHA-256 |
| --- | --- |
| `20260921100732` | `6cb7adb053f03c379487b8aa098f41acb46d86e2731203818ee1d1be07fac47d` |
| `20260921103432` | `58374bdc4de734fbbaee53ebad75e4546e68dc1ad91e962a0dff3d53b737a773` |
| `20260921105352` | `03124b16f86ac98c0a78e5c9003b88fb7e13d4786074120b641358174015420d` |
| `20260921133428` | `7c785997493794b64e1af5d2d51dcd35f606dfa7f9cfbcfe6675fd1c3d9e1271` |
| `20260921141814` | `7f3ac46292129b407edabc5a18f89f8c842701142b1f22a010073c6a48139fca` |
| `20260921151006` | `7f3ac46292129b407edabc5a18f89f8c842701142b1f22a010073c6a48139fca` |
| `20261025103648` | `a6c28cd33d5b49e70c977ef7a04b33021ab602dad2a7672de9f561f236cc1b82` |

The two `action_measurement_loop` receipts have the same SQL bytes but retain distinct history versions in the archive.

## Limits and STOP gates

1. **DPAPI CurrentUser is tied to the Windows user/profile and system key material.** This is a same-account recovery check, not proof of cross-machine recovery. Back up the protected Windows profile/key material or make a separate cryptographically protected portable export with owner-controlled recovery credentials; avoid printing secrets into console or Git.
2. A migration-receipt export is **not a complete staging database backup** (does not preserve application data, managed schemas, all extensions, server configuration or WAL). Acquire and test a separate full staging backup/snapshot before any real history rewrite.
3. The migration repair plan still requires an independent reviewer to sign off each old→canonical mapping, exact SQL receipt backup and compensation steps. **Do not run `migration repair`, `db push` or the two pending guard migrations until these gates are met.**
4. Run `scripts/sql/cafeos-staging-legacy-ledger-readonly-preflight.sql` and `scripts/sql/cafeos-staging-post-repair-readonly-gate.sql` immediately before any approved change. If receipt hashes or privileges differ, **STOP**.
5. Both Commerce integrity guards are **still absent on staging**. Real authenticated staging HTTP/JWT E2E and independent Supabase security-advisor review remain NO-GO release gates.

This document deliberately contains no SQL statements, credentials, decryption keys or user-specific protected file paths.
