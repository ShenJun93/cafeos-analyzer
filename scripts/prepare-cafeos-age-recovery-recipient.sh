#!/usr/bin/env bash
# CafeOS owner-only encrypted recovery escrow for an INDEPENDENT age recipient.
# The recovery private identity MUST originate and remain on a second trusted device.
# No password prompts, generated passphrases, downloads or network transfers.
set -euo pipefail
umask 077

[[ "$(id -u)" != 0 && -t 0 && -t 1 ]] || {
  echo 'STOP: interactive nonroot owner WSL terminal required' >&2; exit 12
}
[[ "$#" == 1 ]] || {
  echo 'STOP: supply ONE local 0600 file containing ONLY the independent age PUBLIC recipient' >&2
  echo 'Generate its private identity on a SECOND trusted device; do not copy that private key here.' >&2
  exit 12
}

root="$HOME/.local/share"
keydir="$root/cafeos-staging-backup"
identity="$keydir/identity.txt"
original_recipients="$keydir/recipients.txt"
offhost_file="$1"
final="$root/cafeos-staging-recovery-escrow"
prefix='/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix/usr/bin'
age="$prefix/age"
keygen="$prefix/age-keygen"

[[ -d "$root" && ! -L "$root" && "$(stat -c '%u' "$root")" == "$(id -u)" ]] || {
  echo 'STOP: local workspace not owned by operator' >&2; exit 12
}
[[ -d "$keydir" && ! -L "$keydir" && "$(stat -c '%u' "$keydir")" == "$(id -u)" && "$(stat -c '%a' "$keydir")" == 700 ]] || {
  echo 'STOP: age key directory must be private (0700)' >&2; exit 12
}
for input in "$identity" "$original_recipients" "$offhost_file"; do
  [[ -f "$input" && ! -L "$input" && "$(stat -c '%u' "$input")" == "$(id -u)" && "$(stat -c '%a' "$input")" == 600 ]] || {
    echo 'STOP: age key/public-recipient inputs must be owned private regular files (0600)' >&2
    exit 12
  }
done
[[ "$offhost_file" != "$identity" && "$offhost_file" != "$original_recipients" ]] || {
  echo 'STOP: independent recipient must be a separate public-only file' >&2; exit 12
}
[[ ! -e "$final" && ! -L "$final" ]] || {
  echo 'STOP: escrow already exists; refusing overwrite' >&2; exit 12
}
[[ -x "$age" && -x "$keygen" ]] || {
  echo 'STOP: pinned age executables unavailable' >&2; exit 12
}
if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo 'STOP: escrow must never be stored in Git' >&2; exit 12
fi

source_public="$("$keygen" -y "$identity" 2>/dev/null)"
[[ "$source_public" == age1* ]] || { echo 'STOP: original key invalid' >&2; exit 13; }
grep -qxF -- "$source_public" "$original_recipients" || {
  echo 'STOP: source age identity/recipient mismatch' >&2; exit 13
}
[[ "$(wc -l < "$offhost_file")" -eq 1 ]] || {
  echo 'STOP: expected exactly one recovery PUBLIC recipient' >&2; exit 13
}
IFS= read -r offhost_public < "$offhost_file"
[[ "$offhost_public" =~ ^age1[0-9a-z]{45,}$ && "$offhost_public" != "$source_public" ]] || {
  echo 'STOP: independent PUBLIC recipient invalid or equal to original source' >&2; exit 13
}

work=''
cleanup() {
  local code=$?
  if [[ -n "$work" && -d "$work" ]]; then
    rm -f -- "$work/identity-recovery.age" "$work/expected-recipient.txt" \
      "$work/recovery-recipient.txt" "$work/manifest.sha256" "$work/RECOVER.txt"
    rmdir -- "$work" 2>/dev/null || true
  fi
  exit "$code"
}
trap cleanup EXIT
work="$(mktemp -d "$root/.cafeos-independent-escrow-XXXXXXXX")"
[[ "$(stat -c '%a' "$work")" == 700 ]]

# A second device holds the matching recovery identity. No passphrase input.
# Encrypt the existing secret key DIRECTLY to that independent public recipient.
"$age" -R "$offhost_file" -o "$work/identity-recovery.age" "$identity"
[[ -s "$work/identity-recovery.age" && ! -L "$work/identity-recovery.age" ]] || {
  echo 'STOP: age did not create encrypted escrow' >&2; exit 14
}
chmod 600 "$work/identity-recovery.age"
printf '%s\n' "$source_public" > "$work/expected-recipient.txt"
printf '%s\n' "$offhost_public" > "$work/recovery-recipient.txt"
chmod 600 "$work/expected-recipient.txt" "$work/recovery-recipient.txt"

cat > "$work/RECOVER.txt" <<'TEXT'
CafeOS STAGING age private-identity recovery (INDEPENDENT RECIPIENT MODE).
This encrypted bundle contains NO plaintext private key or passphrase.
Copy all five escrow files to a separate trusted second machine, which
ALREADY holds the matching recovery identity created there originally.
Do not move the second machine's recovery private identity onto MAIN-PC.
On SECOND MACHINE, within escrow folder (Bash):
  set -euo pipefail
  sha256sum -c manifest.sha256
  # Substitute the real path to the SECOND MACHINE's recovery private identity:
  recovered="$(age -d -i /secure/path/to/second-device-recovery-identity.txt identity-recovery.age | age-keygen -y)"
  test "$recovered" = "$(cat expected-recipient.txt)"
  test "$(age-keygen -y /secure/path/to/second-device-recovery-identity.txt)" = "$(cat recovery-recipient.txt)"
  unset recovered
Use scripts/verify-cafeos-age-recovery-offhost.sh ON THE SECOND MACHINE
with four inputs:
  1. Copied private escrow directory containing these five files
  2. The second machine's ORIGINAL locally generated recovery identity
  3. Independently recorded original CafeOS source PUBLIC recipient (outside escrow)
  4. Independently recorded SHA-256 of manifest.sha256 (outside escrow)
The script validates both external trust anchors, decrypts in a pipe, and
prints only a verification status; NEVER prints the private identity.
ALSO compare the recovered source PUBLIC recipient with a trusted independent
record made outside this copied bundle. Self-consistency alone is insufficient.
The original CafeOS source private key stays untouched on MAIN-PC.
Do not paste private keys or decrypted data into chat, Git, CI or terminal logs.
No actual staging DB backup may run until off-host recovery is VERIFIED.
TEXT
chmod 600 "$work/RECOVER.txt"
(
  cd "$work"
  sha256sum identity-recovery.age expected-recipient.txt recovery-recipient.txt \
    RECOVER.txt > manifest.sha256
  sha256sum -c manifest.sha256 >/dev/null
)
chmod 600 "$work/manifest.sha256"

mv -T --no-clobber -- "$work" "$final"
[[ -d "$final" && ! -d "$work" ]] || { echo 'STOP: publish failed' >&2; exit 14; }
work=''
(cd "$final" && sha256sum -c manifest.sha256 >/dev/null)
manifest_sha="$(sha256sum "$final/manifest.sha256" | cut -d' ' -f1)"
echo "CAFEOS_ESCROW_MANIFEST_SHA256=$manifest_sha"
echo 'COPY_MANIFEST_SHA256_AND_SOURCE_PUBLIC_RECIPIENT_TO_INDEPENDENT_TRUSTED_CHECKPOINT'
echo 'LOCAL_AGE_INDEPENDENT_RECIPIENT_ESCROW_CREATED'
echo 'NO_LOCAL_PASSPHRASES_GENERATED_OR_PROMPTED'
echo 'OFF_HOST_RECOVERY_NOT_PROVEN'
echo "ENCRYPTED_ESCROW_DIRECTORY=$final"
