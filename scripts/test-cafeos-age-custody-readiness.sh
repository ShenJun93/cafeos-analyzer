#!/usr/bin/env bash
# Disposable, unprivileged local-key test. No external systems or merchant keys.
set -euo pipefail
umask 077
[[ "$(id -u)" != 0 ]] || { echo 'STOP: nonroot test required' >&2; exit 12; }
for bin in age-keygen git sha256sum stat mktemp; do command -v "$bin" >/dev/null; done
root="$(mktemp -d)"
trap 'rm -rf -- "$root"' EXIT
home="$root/operator-home"
source_dir="$home/.local/share/cafeos-staging-backup"
mkdir -p "$source_dir"
chmod 700 "$source_dir"
age-keygen -o "$source_dir/identity.txt" > /dev/null 2>&1
age-keygen -y "$source_dir/identity.txt" > "$source_dir/recipients.txt"
age-keygen -o "$root/recovery-identity.txt" > /dev/null 2>&1
age-keygen -o "$root/unrelated-identity.txt" > /dev/null 2>&1
chmod 600 "$source_dir/identity.txt" "$source_dir/recipients.txt" \
  "$root/recovery-identity.txt" "$root/unrelated-identity.txt"
probe='scripts/check-cafeos-age-custody-readiness.sh'

out="$(HOME="$home" bash "$probe" --source)"
grep -qxF 'CAFEOS_SOURCE_AGE_LOCAL_PREFLIGHT_PASS' <<< "$out"
grep -qxF 'CAFEOS_ESCROW_NOT_CREATED' <<< "$out"
grep -qxF 'INDEPENDENT_DEVICE_CUSTODY_NOT_ATTESTED' <<< "$out"
grep -qxF 'STAGING_BACKUP_AND_RESTORE_NOT_PROVEN' <<< "$out"

out="$(HOME="$home" bash "$probe" --recovery "$root/recovery-identity.txt")"
grep -qxF 'CAFEOS_RECOVERY_IDENTITY_LOCAL_PREFLIGHT_PASS' <<< "$out"
grep -qxF 'INDEPENDENT_DEVICE_CUSTODY_NOT_ATTESTED' <<< "$out"

# No private key text, public recipient, or user paths are emitted.
if grep -E -q 'AGE-SECRET-KEY|age1[a-z0-9]{45,}|identity.txt|$root' <<< "$out"; then
  echo 'FAIL: probe revealed local custody material' >&2
  exit 14
fi
echo CAFEOS_AGE_LOCAL_PREFLIGHT_POSITIVE_PASS

reject() {
  local reason="$1"
  shift
  local status=0
  HOME="$home" bash "$probe" "$@" > "$root/out" 2>&1 || status=$?
  if [[ "$status" != 12 ]] || ! grep -qF "CAFEOS_AGE_LOCAL_PREFLIGHT_BLOCKED:$reason" "$root/out"; then
    echo 'FAIL: incorrect or absent fail-closed rejection' >&2
    exit 14
  fi
  if grep -E -q 'AGE-SECRET-KEY|age1[a-z0-9]{45,}' "$root/out"; then
    echo 'FAIL: secret-related data reached denial logs' >&2
    exit 14
  fi
}
reject USAGE bogus-flag
reject USAGE --source another-argument
reject FILE_MISSING_OR_SYMLINK --recovery "$root/missing"
ln -s "$root/recovery-identity.txt" "$root/recovery-link"
reject FILE_MISSING_OR_SYMLINK --recovery "$root/recovery-link"
chmod 644 "$root/recovery-identity.txt"
reject FILE_MODE --recovery "$root/recovery-identity.txt"
chmod 600 "$root/recovery-identity.txt"

# Source recipient mismatch cannot be mistaken for a healthy source key.
age-keygen -y "$root/unrelated-identity.txt" > "$source_dir/recipients.txt"
reject KEYPAIR_MISMATCH --source
age-keygen -y "$source_dir/identity.txt" > "$source_dir/recipients.txt"
chmod 755 "$source_dir"
reject DIRECTORY_MODE --source
chmod 700 "$source_dir"

# Git-boundary violation: even a perfectly formed recovery private key cannot
# be treated as an acceptable key when stored inside source control.
mkdir "$root/repo"
git -C "$root/repo" init -q
cp -- "$root/recovery-identity.txt" "$root/repo/recovery-identity.txt"
chmod 600 "$root/repo/recovery-identity.txt"
reject GIT_BOUNDARY --recovery "$root/repo/recovery-identity.txt"

# Escrow existence is NOT proof of readback and is not silently overwritten.
mkdir -m 700 "$home/.local/share/cafeos-staging-recovery-escrow"
out="$(HOME="$home" bash "$probe" --source)"
grep -qxF 'CAFEOS_ESCROW_PRESENT_NOT_VERIFIED' <<< "$out"

echo CAFEOS_AGE_LOCAL_PREFLIGHT_NEGATIVE_PASS
echo CAFEOS_AGE_LOCAL_READINESS_SYNTHETIC_ONLY_PASS
echo PHYSICAL_SECOND_DEVICE_AND_STAGING_RECOVERY_NOT_PROVEN
