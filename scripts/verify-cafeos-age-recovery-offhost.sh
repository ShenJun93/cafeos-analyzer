#!/usr/bin/env bash
# OFFLINE, second-device-only proof that an age recovery identity can decrypt
# the original CafeOS source identity. Never outputs the recovered private key.
# This proves cryptographic readback on the invoking host, NOT host independence.
set -euo pipefail
umask 077

[[ "$(id -u)" != 0 ]] || { echo 'STOP: run as nonroot owner' >&2; exit 12; }
[[ "$#" == 4 ]] || {
  echo 'Usage: bash verify-cafeos-age-recovery-offhost.sh ESCROW_DIR SECOND_DEVICE_IDENTITY TRUSTED_SOURCE_PUBLIC_FILE TRUSTED_MANIFEST_SHA256_FILE' >&2
  echo 'The last two inputs must be independently recorded OUTSIDE the copied escrow.' >&2
  exit 12
}

for bin in realpath stat git sha256sum cmp age age-keygen; do
  command -v "$bin" >/dev/null || { echo "STOP: missing executable $bin" >&2; exit 12; }
done

[[ -d "$1" && ! -L "$1" ]] || { echo 'STOP: escrow directory missing or symlinked' >&2; exit 12; }
escrow="$(realpath -e -- "$1")"
[[ "$(stat -c '%u' "$escrow")" == "$(id -u)" && "$(stat -c '%a' "$escrow")" == 700 ]] || {
  echo 'STOP: escrow must be an owner-owned private 0700 directory' >&2; exit 12
}
if git -C "$escrow" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo 'STOP: copied escrow cannot be inside a Git worktree' >&2; exit 12
fi

checked_file() {
  local input="$1"
  [[ -f "$input" && ! -L "$input" && -r "$input" ]] || {
    echo 'STOP: missing/unreadable/symlinked private input' >&2; exit 12
  }
  local canonical
  canonical="$(realpath -e -- "$input")"
  [[ "$(stat -c '%u' "$canonical")" == "$(id -u)" ]] || {
    echo 'STOP: file must belong to current operator' >&2; exit 12
  }
  case "$(stat -c '%a' "$canonical")" in
    600|400) ;;
    *) echo 'STOP: input file must have mode 0600 or 0400' >&2; exit 12 ;;
  esac
  printf '%s\n' "$canonical"
}
recovery="$(checked_file "$2")"
trusted_source="$(checked_file "$3")"
trusted_manifest="$(checked_file "$4")"
[[ "$recovery" != "$trusted_source" && "$recovery" != "$trusted_manifest"
   && "$trusted_source" != "$trusted_manifest" ]] || {
  echo 'STOP: independent inputs must be distinct files' >&2; exit 12
}
for file in "$recovery" "$trusted_source" "$trusted_manifest"; do
  case "$file" in
    "$escrow"/*) echo 'STOP: trust anchors/private key cannot come from escrow' >&2; exit 12 ;;
  esac
  if git -C "$(dirname "$file")" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo 'STOP: trust anchors/private key cannot be in Git' >&2; exit 12
  fi
done

for filename in identity-recovery.age expected-recipient.txt recovery-recipient.txt manifest.sha256 RECOVER.txt; do
  file="$escrow/$filename"
  checked_file "$file" >/dev/null
done

[[ "$(wc -l < "$trusted_source")" == 1 && "$(wc -l < "$trusted_manifest")" == 1 ]] || {
  echo 'STOP: trusted anchors must be single-line files' >&2; exit 13
}
source_public="$(cat "$trusted_source")"
manifest_trust="$(cat "$trusted_manifest")"
[[ "$source_public" =~ ^age1[0-9a-z]{45,}$ && "$manifest_trust" =~ ^[a-f0-9]{64}$ ]] || {
  echo 'STOP: invalid externally recorded trust anchors' >&2; exit 13
}
[[ "$(< "$escrow/expected-recipient.txt")" == "$source_public" ]] || {
  echo 'STOP: escrow expected recipient differs from independent source recipient' >&2; exit 13
}
recovery_public="$(age-keygen -y "$recovery")"
[[ "$recovery_public" =~ ^age1[0-9a-z]{45,}$ && "$recovery_public" != "$source_public"
    && "$(< "$escrow/recovery-recipient.txt")" == "$recovery_public" ]] || {
  echo 'STOP: second-device recovery identity does not match escrow recipient' >&2; exit 13
}

actual_manifest="$(sha256sum "$escrow/manifest.sha256" | cut -d' ' -f1)"
[[ "$actual_manifest" == "$manifest_trust" ]] || {
  echo 'STOP: escrow manifest differs from independently recorded SHA-256' >&2; exit 13
}
# Recompute in the same order as the producer. Do NOT trust paths inside a
# received manifest: a crafted manifest can name unrelated files.
(
  cd "$escrow"
  sha256sum identity-recovery.age expected-recipient.txt recovery-recipient.txt RECOVER.txt
) | cmp -s - "$escrow/manifest.sha256" || {
  echo 'STOP: escrow ciphertext or metadata SHA-256 mismatch' >&2; exit 13
}

# age-keygen -y accepts an identity from stdin. No source private-key file is
# written on this machine; the only emitted value is its PUBLIC recipient.
if ! recovered_source_public="$(
  age -d -i "$recovery" "$escrow/identity-recovery.age" | age-keygen -y
)"; then
  echo 'STOP: encrypted source identity cannot be recovered by second key' >&2; exit 14
fi
[[ "$recovered_source_public" == "$source_public" ]] || {
  echo 'STOP: decrypted identity differs from independent original recipient' >&2; exit 14
}
unset recovered_source_public

echo 'CAFEOS_AGE_RECOVERY_CRYPTOGRAPHIC_READBACK_PASS'
echo 'INDEPENDENT_DEVICE_CUSTODY_REQUIRES_OWNER_ATTESTATION'
echo 'ACTUAL_STAGING_BACKUP_AND_DATABASE_RESTORE_NOT_PROVEN'
