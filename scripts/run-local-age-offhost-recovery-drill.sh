#!/usr/bin/env bash
# Non-production REAL age crypto acceptance for the independent-key escrow flow.
# Both fake identities are generated in a disposable CI directory. Not actual
# off-host custody, not a staging database backup or restore.
set -euo pipefail
umask 077
[[ "$(id -u)" != 0 ]] || { echo 'STOP: nonroot synthetic runner only' >&2; exit 12; }
for bin in age age-keygen sha256sum git; do
  command -v "$bin" >/dev/null || { echo "STOP: missing $bin" >&2; exit 12; }
done

root="$(mktemp -d)"
cleanup() { rm -rf -- "$root"; }
trap cleanup EXIT
mkdir -m 700 "$root/escrow"
verifier="$(cd -- "$(dirname -- "$0")" && pwd)/verify-cafeos-age-recovery-offhost.sh"

age-keygen -o "$root/source-identity" >/dev/null 2>&1
age-keygen -o "$root/recovery-identity" >/dev/null 2>&1
age-keygen -o "$root/wrong-identity" >/dev/null 2>&1
age-keygen -y "$root/source-identity" > "$root/trusted-source"
age-keygen -y "$root/recovery-identity" > "$root/recovery-recipient"
age-keygen -y "$root/wrong-identity" > "$root/wrong-trusted-source"

age -R "$root/recovery-recipient" -o "$root/escrow/identity-recovery.age" "$root/source-identity"
cp "$root/trusted-source" "$root/escrow/expected-recipient.txt"
cp "$root/recovery-recipient" "$root/escrow/recovery-recipient.txt"
printf '%s\n' 'SYNTHETIC age recovery escrow — NO REAL SOURCE KEY' > "$root/escrow/RECOVER.txt"
(
  cd "$root/escrow"
  sha256sum identity-recovery.age expected-recipient.txt recovery-recipient.txt RECOVER.txt > manifest.sha256
)
sha256sum "$root/escrow/manifest.sha256" | cut -d' ' -f1 > "$root/trusted-manifest"
chmod 600 "$root"/source-identity "$root"/recovery-identity "$root"/wrong-identity \
  "$root"/trusted-source "$root"/wrong-trusted-source "$root"/trusted-manifest \
  "$root"/recovery-recipient "$root"/escrow/*

bash "$verifier" "$root/escrow" "$root/recovery-identity" \
  "$root/trusted-source" "$root/trusted-manifest" > "$root/success.log"
grep -qxF 'CAFEOS_AGE_RECOVERY_CRYPTOGRAPHIC_READBACK_PASS' "$root/success.log"
grep -qxF 'INDEPENDENT_DEVICE_CUSTODY_REQUIRES_OWNER_ATTESTATION' "$root/success.log"

reject() {
  local why="$1"
  shift
  if "$@" > "$root/negative.log" 2>&1; then
    echo "STOP: synthetic negative scenario unexpectedly passed: $why" >&2
    exit 14
  fi
}
reject 'wrong recipient private key' bash "$verifier" "$root/escrow" "$root/wrong-identity" \
  "$root/trusted-source" "$root/trusted-manifest"
reject 'wrong independent source recipient' bash "$verifier" "$root/escrow" "$root/recovery-identity" \
  "$root/wrong-trusted-source" "$root/trusted-manifest"

printf '%064d\n' 0 > "$root/wrong-manifest"
chmod 600 "$root/wrong-manifest"
reject 'wrong independent manifest digest' bash "$verifier" "$root/escrow" "$root/recovery-identity" \
  "$root/trusted-source" "$root/wrong-manifest"
ln -s "$root/trusted-source" "$root/symlink-source"
reject 'trust anchor symlink' bash "$verifier" "$root/escrow" "$root/recovery-identity" \
  "$root/symlink-source" "$root/trusted-manifest"

printf 'tamper' >> "$root/escrow/identity-recovery.age"
reject 'tampered encrypted identity' bash "$verifier" "$root/escrow" "$root/recovery-identity" \
  "$root/trusted-source" "$root/trusted-manifest"
(
  cd "$root/escrow"
  sha256sum identity-recovery.age expected-recipient.txt recovery-recipient.txt RECOVER.txt > manifest.sha256
)
reject 'forged self-consistent manifest without external approval' \
  bash "$verifier" "$root/escrow" "$root/recovery-identity" \
  "$root/trusted-source" "$root/trusted-manifest"

echo 'CAFEOS_SYNTHETIC_OFFHOST_RECOVERY_DRILL_PASS'
echo 'ACTUAL_SECOND_DEVICE_CUSTODY_NOT_VERIFIED'
