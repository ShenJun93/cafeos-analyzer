#!/usr/bin/env bash
# CafeOS operator-only action: encrypt existing age identity for off-machine escrow.
# Local envelope is NOT an off-host recovery. No cloud transfers in this script.
set -euo pipefail
umask 077
[[ "$(id -u)" != 0 && -t 0 && -t 1 ]] || {
  echo 'STOP: use an interactive owner WSL terminal, never CI or an agent shell' >&2
  exit 12
}
root="$HOME/.local/share"
keydir="$root/cafeos-staging-backup"
identity="$keydir/identity.txt"
recipients="$keydir/recipients.txt"
final="$root/cafeos-staging-recovery-escrow"
[[ -d "$root" && ! -L "$root" && "$(stat -c '%u' "$root")" == "$(id -u)" ]] || {
  echo 'STOP: local workspace not owned by operator' >&2; exit 12
}
[[ -d "$keydir" && ! -L "$keydir" && "$(stat -c '%a' "$keydir")" == 700 ]] || {
  echo 'STOP: source key directory must be private (0700)' >&2; exit 12
}
for input in "$identity" "$recipients"; do
  [[ -f "$input" && ! -L "$input" && "$(stat -c '%u' "$input")" == "$(id -u)" && "$(stat -c '%a' "$input")" == 600 ]] || {
    echo 'STOP: key/recipient file must be owner-private (0600)' >&2; exit 12
  }
done
[[ ! -e "$final" && ! -L "$final" ]] || {
  echo 'STOP: recovery envelope already exists; will not overwrite' >&2; exit 12
}
prefix='/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix/usr/bin'
age="$prefix/age"
keygen="$prefix/age-keygen"
[[ -x "$age" && -x "$keygen" ]] || {
  echo 'STOP: verified age tools not present' >&2; exit 12
}
if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo 'STOP: refuse escrow inside Git' >&2; exit 12
fi
expected="$("$keygen" -y "$identity" 2>/dev/null)"
[[ "$expected" == age1* ]] || { echo 'STOP: invalid age identity' >&2; exit 12; }
grep -qxF -- "$expected" "$recipients" || {
  echo 'STOP: source key does not match configured backup recipient' >&2; exit 12
}
work=''
cleanup() {
  local code=$?
  if [[ -n "$work" && -d "$work" ]]; then
    rm -f -- "$work/identity-recovery.age" "$work/expected-recipient.txt" "$work/manifest.sha256" "$work/RECOVER.txt"
    rmdir -- "$work" 2>/dev/null || true
  fi
  exit "$code"
}
trap cleanup EXIT
work="$(mktemp -d "$root/.cafeos-escrow-XXXXXXXX")"
[[ "$(stat -c '%a' "$work")" == 700 ]]
printf '%s\n' \
  'Encrypting existing age recovery identity with an independent passphrase.' \
  'Keep the passphrase in your password manager, never in chat or beside the file.' \
  'A second interactive passphrase entry will verify decryption.'
"$age" -p -o "$work/identity-recovery.age" "$identity"
[[ -s "$work/identity-recovery.age" && ! -L "$work/identity-recovery.age" ]]
chmod 600 "$work/identity-recovery.age"
# Identity plaintext travels only through a pipe, never to a temporary file.
recovered="$("$age" -d "$work/identity-recovery.age" | "$keygen" -y 2>/dev/null)" || {
  echo 'STOP: decrypt check failed; no envelope published' >&2; exit 13
}
[[ "$recovered" == "$expected" ]] || {
  echo 'STOP: decrypted key does not match source public recipient' >&2; exit 13
}
# Include the independently attested PUBLIC recipient, never the private identity.
# Without this file a second recovery machine cannot establish which key
# the decrypted identity was expected to reproduce.
printf '%s\n' "$expected" > "$work/expected-recipient.txt"
chmod 600 "$work/expected-recipient.txt"
[[ "$(cat "$work/expected-recipient.txt")" == "$expected" ]]
unset recovered expected
cat > "$work/RECOVER.txt" <<'TEXT'
CafeOS staging: PASSHRASE-ENCRYPTED age recovery identity, NOT OFF-HOST YET.
Copy identity-recovery.age, expected-recipient.txt, manifest.sha256
and RECOVER.txt together to a separate owner-controlled USB or encrypted
remote storage. The recipient is PUBLIC; the identity inside the .age
file is SECRET. Keep the passphrase independently in a password manager.
On a SECOND trusted machine with age and age-keygen installed, use Bash:
  set -euo pipefail
  sha256sum -c manifest.sha256
  recovered="$(age -d identity-recovery.age | age-keygen -y)"
  test "$recovered" = "$(cat expected-recipient.txt)"
  unset recovered
Record that the checksum and the recovered PUBLIC recipient both matched
on the second machine before using any actual staging backup. A local
checksum or decryption test on MAIN-PC alone is NOT off-host recovery.
Do not send decrypted key or passphrase through ChatGPT, Git, or CI.
Keep the original WSL age identity unchanged.
TEXT
chmod 600 "$work/RECOVER.txt"
(cd "$work" && sha256sum identity-recovery.age expected-recipient.txt RECOVER.txt > manifest.sha256 && sha256sum -c manifest.sha256 >/dev/null)
chmod 600 "$work/manifest.sha256"
mv -T --no-clobber -- "$work" "$final"
[[ -d "$final" && ! -d "$work" ]] || { echo 'STOP: atomic publication failed' >&2; exit 14; }
work=''
(cd "$final" && sha256sum -c manifest.sha256 >/dev/null)
echo 'LOCAL_AGE_ESCROW_ENCRYPT_AND_DECRYPT_PASS'
echo 'OFF_HOST_RECOVERY_NOT_PROVEN'
echo "ENCRYPTED_ESCROW_DIRECTORY=$final"
echo 'NEXT: copy only ciphertext files off-machine and verify there.'