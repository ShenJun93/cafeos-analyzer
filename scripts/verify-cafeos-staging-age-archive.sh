#!/usr/bin/env bash
# Read-only, network-free verification of a copied CafeOS staging age archive.
# Does NOT create a database or prove a database restore.
set -euo pipefail
umask 077
: "${CAFEOS_ARCHIVE_DIR:?Set the external copied archive directory}"
: "${CAFEOS_AGE_IDENTITY:?Set an independently controlled age private identity}"
: "${CAFEOS_EXPECTED_MANIFEST_SHA256:?Set trusted SHA-256 of the original manifest from outside the archive}"
: "${CAFEOS_EXPECTED_RECEIPT_SHA256:?Set separately pinned original receipt ledger SHA-256}"
for digest in "$CAFEOS_EXPECTED_MANIFEST_SHA256" "$CAFEOS_EXPECTED_RECEIPT_SHA256"; do
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || { echo "STOP: invalid external SHA-256 checkpoint" >&2; exit 12; }
done
for cmd in age pg_restore sha256sum realpath stat cmp git; do
  command -v "$cmd" >/dev/null || { echo "STOP: missing verifier binary $cmd" >&2; exit 12; }
done
[[ -d "$CAFEOS_ARCHIVE_DIR" && -r "$CAFEOS_ARCHIVE_DIR" ]] || { echo 'STOP: missing external archive' >&2; exit 12; }
[[ -f "$CAFEOS_AGE_IDENTITY" && -r "$CAFEOS_AGE_IDENTITY" && ! -L "$CAFEOS_AGE_IDENTITY" ]] || { echo 'STOP: missing protected private identity' >&2; exit 12; }
archive="$(realpath -e -- "$CAFEOS_ARCHIVE_DIR")"
identity="$(realpath -e -- "$CAFEOS_AGE_IDENTITY")"
[[ "$(stat -c '%a' "$archive")" == 700 ]] || { echo 'STOP: copied archive directory must have mode 0700' >&2; exit 12; }
[[ "$(stat -c '%a' "$identity")" == 600 || "$(stat -c '%a' "$identity")" == 400 ]] || { echo 'STOP: private identity must have mode 0600/0400' >&2; exit 12; }
case "$identity" in "$archive"/*) echo 'STOP: key cannot be inside copied archive' >&2; exit 12;; esac
if git -C "$archive" rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo 'STOP: archive cannot be inside Git' >&2; exit 12; fi
if git -C "$(dirname "$identity")" rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo 'STOP: private identity cannot be inside Git' >&2; exit 12; fi
for filename in database.pgdump.age globals.sql.age source-ledger-sha256.txt manifest.sha256; do
  [[ -f "$archive/$filename" && -r "$archive/$filename" && -s "$archive/$filename" && ! -L "$archive/$filename" ]] || { echo "STOP: missing/unsafe archive member $filename" >&2; exit 12; }
done
[[ "$(wc -c < "$archive/source-ledger-sha256.txt")" -eq 65 && "$(cat "$archive/source-ledger-sha256.txt")" == "$CAFEOS_EXPECTED_RECEIPT_SHA256" ]] || { echo 'STOP: original ledger fingerprint differs from trusted checkpoint' >&2; exit 13; }
manifest_hash="$(sha256sum "$archive/manifest.sha256")"
[[ "${manifest_hash%% *}" == "$CAFEOS_EXPECTED_MANIFEST_SHA256" ]] || { echo 'STOP: copied manifest differs from trusted source manifest' >&2; exit 13; }
(cd "$archive"; sha256sum database.pgdump.age globals.sql.age source-ledger-sha256.txt) | cmp -s - "$archive/manifest.sha256" || { echo 'STOP: copied ciphertext/metadata SHA-256 mismatch' >&2; exit 13; }
# The first pass authenticates/decrypts all encrypted dump bytes, while
# pg_restore --list checks the custom archive catalog. This is NOT restoration.
age -d -i "$identity" "$archive/database.pgdump.age" | sha256sum >/dev/null
age -d -i "$identity" "$archive/database.pgdump.age" | pg_restore --list >/dev/null
age -d -i "$identity" "$archive/globals.sql.age" | sha256sum >/dev/null
echo 'CAFEOS_OFFLINE_ARCHIVE_READBACK_PASS: manifest, ciphertext, age private-key readback, pg_restore catalog'
echo 'REAL_STAGING_DATABASE_RESTORE_NOT_PROVEN'
