#!/usr/bin/env bash
# CafeOS synthetic Storage OBJECT-BYTE recovery drill.
# No database, no Supabase network, no staging, no provider credentials.
# A metadata-only SQL dump CANNOT recover the external Storage object bytes.
set -euo pipefail
umask 077

if [[ "$(printenv GITHUB_ACTIONS || true)" != true || "$(printenv CI || true)" != true ]]; then
  [[ "$(printenv CAFEOS_SYNTHETIC_LOCAL || true)" == '1' ]] || {
    echo STOP_SYNTHETIC_CI_OR_LOCAL_OPTIN_REQUIRED >&2; exit 42;
  }
fi
for bin in age age-keygen sha256sum cmp dd find stat mktemp; do
  command -v "$bin" >/dev/null || { echo "STOP_TOOL_UNAVAILABLE_$bin" >&2; exit 42; }
done
[[ -d /dev/shm && "$(stat -f -c %T /dev/shm)" == tmpfs ]] || {
  echo STOP_SYNTHETIC_TMPFS_REQUIRED >&2; exit 42;
}
work="$(mktemp -d /dev/shm/cafeos-storage-synthetic.XXXXXXXX)"
[[ "$(stat -c '%a' "$work")" == '700' ]] || exit 42
success=0
cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$work" || { echo STOP_SYNTHETIC_CLEANUP_FAILED >&2; exit 42; }
  if [[ "$status" == 0 && "$success" == 1 ]]; then
    printf '%s\n' \
      'CAFEOS_STORAGE_SYNTHETIC_AGE_BYTES_ROUNDTRIP_PASS' \
      'CAFEOS_STORAGE_SYNTHETIC_SHA256_AND_KEYSET_PASS' \
      'CAFEOS_STORAGE_SYNTHETIC_WRONG_KEY_DENIED_PASS' \
      'CAFEOS_STORAGE_SYNTHETIC_CIPHERTEXT_TAMPER_DENIED_PASS' \
      'CAFEOS_STORAGE_SYNTHETIC_MISSING_EXTRA_CORRUPT_BYTES_DETECTED_PASS' \
      'CAFEOS_STORAGE_SYNTHETIC_TMPFS_AND_CLEANUP_PASS' \
      'NO_STAGING_NO_REAL_STORAGE_API_NO_FULL_SUPABASE_RESTORE'
  fi
  exit "$status"
}
trap cleanup EXIT

# Two fixed synthetic bucket/keys. Source and recovered files only on tmpfs.
source_dir="$work/source"
restored_dir="$work/restored"
cipher_dir="$work/ciphertext"
mkdir -p "$source_dir/bucket-photos" "$source_dir/bucket-menus"
mkdir -p "$restored_dir/bucket-photos" "$restored_dir/bucket-menus" "$cipher_dir"

# Include NUL / high-byte / line endings to prevent text-only false positives.
printf 'CAFEOS-SYNTHETIC-OBJECT-A\000\377\r\n' > "$source_dir/bucket-photos/object.bin"
printf 'menu,price\nespresso,125\ncafe\\,250\n' > "$source_dir/bucket-menus/menu.csv"
[[ "$(find "$source_dir" -type f | wc -l)" -eq 2 ]] || {
  echo STOP_SOURCE_SYNTHETIC_KEYSET >&2; exit 42;
}

# Explicit synthetic object-key manifest. This does not simulate Supabase
# Storage permissions, bucket policies, Storage API or remote S3 replication.
printf '%s\n' 'bucket-menus/menu.csv' 'bucket-photos/object.bin' > "$work/expected.keys"
sha256sum "$source_dir/bucket-menus/menu.csv" | cut -d ' ' -f1 > "$work/menu.sha256"
sha256sum "$source_dir/bucket-photos/object.bin" | cut -d ' ' -f1 > "$work/photo.sha256"

age-keygen -o "$work/identity.txt" >/dev/null 2>&1
age-keygen -y "$work/identity.txt" > "$work/recipient.txt"
chmod 600 "$work/identity.txt" "$work/recipient.txt"
[[ "$(stat -c '%a' "$work/identity.txt")" == 600 ]] || exit 42

# Two standalone encrypted objects: no plaintext on durable storage.
age -R "$work/recipient.txt" -o "$cipher_dir/object.bin.age" "$source_dir/bucket-photos/object.bin"
age -R "$work/recipient.txt" -o "$cipher_dir/menu.csv.age" "$source_dir/bucket-menus/menu.csv"
[[ -s "$cipher_dir/object.bin.age" && -s "$cipher_dir/menu.csv.age" ]] || exit 42

age -d -i "$work/identity.txt" -o "$restored_dir/bucket-photos/object.bin" "$cipher_dir/object.bin.age"
age -d -i "$work/identity.txt" -o "$restored_dir/bucket-menus/menu.csv" "$cipher_dir/menu.csv.age"

verify_restored() {
  local root="$1"
  [[ -f "$root/bucket-photos/object.bin" && ! -L "$root/bucket-photos/object.bin" ]] || return 1
  [[ -f "$root/bucket-menus/menu.csv" && ! -L "$root/bucket-menus/menu.csv" ]] || return 1
  [[ "$(find "$root" -type f | wc -l)" -eq 2 ]] || return 1
  [[ "$(find "$root" -type l | wc -l)" -eq 0 ]] || return 1
  [[ "$(sha256sum "$root/bucket-photos/object.bin" | cut -d ' ' -f1)" == "$(cat "$work/photo.sha256")" ]] || return 1
  [[ "$(sha256sum "$root/bucket-menus/menu.csv" | cut -d ' ' -f1)" == "$(cat "$work/menu.sha256")" ]] || return 1
}
verify_restored "$restored_dir" || { echo STOP_SYNTHETIC_STORAGE_BYTES_MISMATCH >&2; exit 42; }
cmp -s "$source_dir/bucket-photos/object.bin" "$restored_dir/bucket-photos/object.bin" || exit 42
cmp -s "$source_dir/bucket-menus/menu.csv" "$restored_dir/bucket-menus/menu.csv" || exit 42

# Negative: unrelated age identity MUST NOT decrypt.
age-keygen -o "$work/wrong-identity.txt" >/dev/null 2>&1
if age -d -i "$work/wrong-identity.txt" "$cipher_dir/object.bin.age" >/dev/null 2>&1; then
  echo STOP_WRONG_AGE_KEY_ACCEPTED >&2; exit 42
fi
# Negative: corrupt an AGE header byte. Do not print ciphertext or plaintext.
cp "$cipher_dir/object.bin.age" "$work/tampered.age"
printf 'X' | dd of="$work/tampered.age" bs=1 count=1 conv=notrunc status=none
if age -d -i "$work/identity.txt" "$work/tampered.age" >/dev/null 2>&1; then
  echo STOP_CORRUPTED_AGE_ARCHIVE_ACCEPTED >&2; exit 42
fi

# Negative controls operate on COPIES of restored synthetic bytes.
cp -a "$restored_dir" "$work/negative-missing"
rm -f "$work/negative-missing/bucket-menus/menu.csv"
if verify_restored "$work/negative-missing"; then
  echo STOP_MISSING_STORAGE_OBJECT_NOT_DETECTED >&2; exit 42
fi
cp -a "$restored_dir" "$work/negative-extra"
printf 'UNEXPECTED' > "$work/negative-extra/bucket-photos/extra.bin"
if verify_restored "$work/negative-extra"; then
  echo STOP_EXTRA_STORAGE_OBJECT_NOT_DETECTED >&2; exit 42
fi
cp -a "$restored_dir" "$work/negative-corrupt"
printf 'BAD' >> "$work/negative-corrupt/bucket-photos/object.bin"
if verify_restored "$work/negative-corrupt"; then
  echo STOP_CORRUPT_STORAGE_BYTES_NOT_DETECTED >&2; exit 42
fi

# A metadata manifest alone would NEVER prove external object-byte recovery.
# This test has no project credentials, API keys or access to real buckets.
success=1
