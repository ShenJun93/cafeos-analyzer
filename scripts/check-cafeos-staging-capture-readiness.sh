#!/usr/bin/env bash
# CafeOS owner-only staging SOURCE READ-ONLY + local encrypted-key escrow preflight.
# This command NEVER exports database bytes, modifies staging or grants approval.
set -euo pipefail
umask 077

stop() { echo "STOP_CAFEOS_CAPTURE_PREFLIGHT_$1" >&2; exit 12; }
[[ $# -eq 0 && "$(id -u)" != 0 ]] || stop INVOCATION
[[ "${CI:-}" != true && "${GITHUB_ACTIONS:-}" != true ]] || stop NOT_FOR_CI
[[ "${CAFEOS_STAGING_READONLY_PREFLIGHT_ACK:-}" == "SOURCE_READONLY_ONLY" ]] || stop OWNER_ACK_REQUIRED
for bin in bash age age-keygen sha256sum stat grep cmp git realpath df; do
  command -v "$bin" >/dev/null || stop TOOL_MISSING
done

script_root="$(cd -- "$(dirname -- "$0")" && pwd)"
source_check="$script_root/check-cafeos-staging-readonly-verifyfull.sh"
[[ -f "$source_check" && ! -L "$source_check" ]] || stop SOURCE_CHECK_UNAVAILABLE
home_real="$(realpath -e -- "$HOME")"
[[ "$(stat -c %u "$home_real")" == "$(id -u)" ]] || stop HOME_OWNERSHIP
age_home="$home_real/.local/share/cafeos-staging-backup"
escrow="$home_real/.local/share/cafeos-staging-recovery-escrow"
config="$home_real/.config/cafeos-staging"
cli="$home_real/.local/share/cafeos-tools/supabase-2.122.0/supabase"
source_key="$age_home/identity.txt"
source_recipient="$age_home/recipients.txt"

private_dir() {
  [[ -d "$1" && ! -L "$1" ]] || stop PRIVATE_DIRECTORY_MISSING
  [[ "$(stat -c %a "$1")" == 700 && "$(stat -c %u "$1")" == "$(id -u)" ]] || stop PRIVATE_DIRECTORY_MODE
  if git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1; then stop PRIVATE_DIRECTORY_INSIDE_GIT; fi
}
private_file() {
  [[ -f "$1" && ! -L "$1" && -r "$1" ]] || stop PRIVATE_FILE_MISSING
  [[ "$(stat -c %u "$1")" == "$(id -u)" && "$(stat -c %a "$1")" == 600 ]] || stop PRIVATE_FILE_MODE
}
private_dir "$age_home"
private_dir "$escrow"
private_dir "$config"
for file in "$source_key" "$source_recipient" "$escrow/identity-recovery.age" \
  "$escrow/expected-recipient.txt" "$escrow/recovery-recipient.txt" \
  "$escrow/manifest.sha256" "$escrow/RECOVER.txt" \
  "$config/pgpass" "$config/db-root-ca.crt"; do
  private_file "$file"
done
[[ -x "$cli" && ! -L "$cli" ]] || stop CLI_BINARY_MISSING
[[ "$("$cli" --version)" == 2.122.0 ]] || stop CLI_VERSION_DRIFT

expected_ca='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
actual_ca="$(sha256sum "$config/db-root-ca.crt" | cut -d' ' -f1)"
[[ "$actual_ca" == "$expected_ca" ]] || stop STAGING_CA_PIN_DRIFT

source_public="$(age-keygen -y "$source_key" 2>/dev/null)" || stop ORIGINAL_AGE_KEY_INVALID
[[ "$source_public" == age1* ]] || stop SOURCE_RECIPIENT_INVALID
grep -qxF -- "$source_public" "$source_recipient" || stop SOURCE_KEY_RECIPIENT_MISMATCH
cmp -s -- "$source_recipient" "$escrow/expected-recipient.txt" || stop ESCROW_SOURCE_RECIPIENT_MISMATCH
recovery_public="$(cat -- "$escrow/recovery-recipient.txt")"
[[ "$recovery_public" == age1* && "$recovery_public" != "$source_public" ]] || stop INDEPENDENT_RECIPIENT_INVALID
[[ "$(wc -l < "$escrow/recovery-recipient.txt")" -eq 1 ]] || stop RECOVERY_RECIPIENT_MULTILINE

manifest_hash="$(sha256sum "$escrow/manifest.sha256" | cut -d' ' -f1)"
[[ "$manifest_hash" == dd63b211dc5a25c516b16494ebde997fef211524ffe0184a4a597d4b17e2bf1d ]] || stop ESCROW_MANIFEST_PIN_DRIFT
(
  cd "$escrow"
  sha256sum identity-recovery.age expected-recipient.txt recovery-recipient.txt RECOVER.txt
) | cmp -s - "$escrow/manifest.sha256" || stop ESCROW_MEMBER_DIGEST_DRIFT

# This tests source connectivity and seven original SQL receipt bytes only.
# It NEVER invokes a backup command or reads application/identity row payloads.
bash "$source_check" || stop SOURCE_READONLY_VERIFICATION_FAILED
echo 'CAFEOS_LOCAL_SOURCE_CRYPTO_AND_ESCROW_PREFLIGHT_PASS'
echo 'CAFEOS_PINNED_CLI_2_122_0_PRESENT'
echo 'CAFEOS_OFFHOST_SAMSUNG_READBACK_OPERATOR_REPORTED_PASS_NOT_INDEPENDENT_ATTESTATION'
echo 'CAFEOS_OWNER_INDEPENDENT_PHYSICAL_CUSTODY_ATTESTATION_PENDING'
echo 'CAFEOS_REAL_SUPABASE_COMPATIBLE_BACKUP_NOT_AUTHORIZED_OR_EXECUTED'
echo 'CAFEOS_INDEPENDENT_DATABASE_RESTORE_NOT_PROVEN'
echo 'CAFEOS_RELEASE_NO_GO'
