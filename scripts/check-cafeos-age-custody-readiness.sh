#!/usr/bin/env bash
# Read-only, secret-silent local checks. NOT physical off-host attestation.
set -euo pipefail
umask 077
stop() { printf 'CAFEOS_AGE_LOCAL_PREFLIGHT_BLOCKED:%s\n' "$1" >&2; exit 12; }
[[ "$(id -u)" != 0 ]] || stop NONROOT_REQUIRED
[[ $# -ge 1 ]] || stop USAGE
for bin in realpath stat git; do
  command -v "$bin" >/dev/null 2>&1 || stop TOOL_MISSING
done
keygen="$(command -v age-keygen || true)"
if [[ -z "$keygen" && -x '/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix/usr/bin/age-keygen' ]]; then
  keygen='/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix/usr/bin/age-keygen'
fi
[[ -n "$keygen" && -x "$keygen" ]] || stop AGE_KEYGEN_MISSING
no_git() {
  if git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    stop GIT_BOUNDARY
  fi
}
dir_ok() {
  [[ -d "$1" && ! -L "$1" ]] || stop DIRECTORY_MISSING_OR_SYMLINK
  local canonical
  canonical="$(realpath -e -- "$1")" || stop DIRECTORY_INVALID
  [[ "$(stat -c '%u' -- "$canonical")" == "$(id -u)" ]] || stop DIRECTORY_OWNER
  [[ "$(stat -c '%a' -- "$canonical")" == 700 ]] || stop DIRECTORY_MODE
  no_git "$canonical"
}
file_ok() {
  [[ -f "$1" && -r "$1" && ! -L "$1" ]] || stop FILE_MISSING_OR_SYMLINK
  local canonical mode
  canonical="$(realpath -e -- "$1")" || stop FILE_INVALID
  [[ "$(stat -c '%u' -- "$canonical")" == "$(id -u)" ]] || stop FILE_OWNER
  mode="$(stat -c '%a' -- "$canonical")"
  [[ "$mode" == 600 || "$mode" == 400 ]] || stop FILE_MODE
  no_git "$(dirname -- "$canonical")"
}
recipient_of() {
  local derived
  derived="$("$keygen" -y "$1" 2>/dev/null)" || stop IDENTITY_UNREADABLE
  [[ "$derived" =~ ^age1[0-9a-z]{45,}$ ]] || stop IDENTITY_INVALID
  printf '%s' "$derived"
}
case "$1" in
  --source)
    [[ $# -eq 1 ]] || stop USAGE
    [[ -n "${HOME:-}" && "${HOME:0:1}" == "/" ]] || stop SOURCE_HOME_INVALID
    source_dir="$HOME/.local/share/cafeos-staging-backup"
    identity="$source_dir/identity.txt"
    recipients="$source_dir/recipients.txt"
    dir_ok "$source_dir"
    file_ok "$identity"
    file_ok "$recipients"
    [[ "$(realpath -e -- "$identity")" != "$(realpath -e -- "$recipients")" ]] ||
      stop SOURCE_FILES_NOT_DISTINCT
    [[ "$(wc -l < "$recipients")" -eq 1 ]] || stop RECIPIENT_FORMAT
    public="$(recipient_of "$identity")"
    [[ "$(< "$recipients")" == "$public" ]] || stop KEYPAIR_MISMATCH
    unset public
    escrow="$HOME/.local/share/cafeos-staging-recovery-escrow"
    if [[ -e "$escrow" || -L "$escrow" ]]; then
      dir_ok "$escrow"
      printf 'CAFEOS_ESCROW_PRESENT_NOT_VERIFIED\n'
    else
      printf 'CAFEOS_ESCROW_NOT_CREATED\n'
    fi
    printf 'CAFEOS_SOURCE_AGE_LOCAL_PREFLIGHT_PASS\n'
    ;;
  --recovery)
    [[ $# -eq 2 ]] || stop USAGE
    file_ok "$2"
    recovery_public="$(recipient_of "$2")"
    unset recovery_public
    printf 'CAFEOS_RECOVERY_IDENTITY_LOCAL_PREFLIGHT_PASS\n'
    ;;
  *) stop USAGE ;;
esac
printf 'INDEPENDENT_DEVICE_CUSTODY_NOT_ATTESTED\n'
printf 'STAGING_BACKUP_AND_RESTORE_NOT_PROVEN\n'
