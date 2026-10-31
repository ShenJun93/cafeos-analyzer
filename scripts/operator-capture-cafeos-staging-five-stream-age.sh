#!/usr/bin/env bash
# CANDIDATE for owner-authorized staging capture only. Never run from CI.
# Five Supabase-compatible SQL streams, each piped directly into age.
# Never claims a consistent point-in-time snapshot or successful restore.
set -euo pipefail
umask 077
stop(){ echo "STOP_CAFEOS_FIVE_STREAM_$1" >&2; exit 42; }

[[ $# -eq 0 && "$(id -u)" != 0 ]] || stop OWNER_ONLY
[[ "${CAFEOS_REAL_STAGING_EXPORT_APPROVAL:-}" == 'OWNER_AUTHORIZES_ENCRYPTED_CAPTURE_ONLY' ]] || stop OWNER_EXPORT_APPROVAL_MISSING
[[ "${CAFEOS_SOURCE_WRITE_FREEZE_APPROVAL:-}" == 'OWNER_ATTESTS_STAGING_QUIESCENT' ]] || stop OWNER_WRITE_FREEZE_MISSING
[[ "${CAFEOS_OFFHOST_CUSTODY_APPROVAL:-}" == 'OWNER_ATTESTS_INDEPENDENT_CUSTODY' ]] || stop OWNER_CUSTODY_APPROVAL_MISSING
[[ "${CI:-}" != true && "${GITHUB_ACTIONS:-}" != true ]] || stop NEVER_IN_CI
[[ -n "${CAFEOS_OWNER_APPROVAL_FILE:-}" && -n "${CAFEOS_COMPATIBLE_BACKUP_DIR:-}" ]] || stop APPROVAL_OR_OUTPUT_MISSING

root="$(cd -- "$(dirname -- "$0")" && pwd)"
home="$(realpath -e -- "$HOME")"
approved="$(realpath -e -- "${CAFEOS_OWNER_APPROVAL_FILE:-}")" || stop RECEIPT_MISSING
dest="$(realpath -e -- "${CAFEOS_COMPATIBLE_BACKUP_DIR:-}")" || stop DEST_MISSING
src="$home/.local/share/cafeos-staging-backup"
esc="$home/.local/share/cafeos-staging-recovery-escrow"
key="$src/identity.txt"
source_pub="$src/recipients.txt"
offhost_pub="$esc/recovery-recipient.txt"
ca="$home/.config/cafeos-staging/db-root-ca.crt"
pass="$home/.config/cafeos-staging/pgpass"
cli="$home/.local/share/cafeos-tools/supabase-2.122.0/supabase"
private_file(){
  [[ -f "$1" && ! -L "$1" && -r "$1" ]] || stop PRIVATE_FILE_MISSING
  [[ "$(stat -c %a "$1")" == 600 && "$(stat -c %u "$1")" == "$(id -u)" ]] || stop PRIVATE_FILE_PERMISSIONS
  if git -C "$(dirname "$1")" rev-parse --is-inside-work-tree >/dev/null 2>&1; then stop PRIVATE_INPUT_IN_GIT; fi
}
for f in "$approved" "$key" "$source_pub" "$offhost_pub" "$ca" "$pass"; do private_file "$f"; done
[[ -d "$dest" && ! -L "$dest" && "$(stat -c %u "$dest")" == "$(id -u)" && "$(stat -c %a "$dest")" == 700 ]] || stop DEST_NOT_PRIVATE
case "$dest" in /mnt/*) stop WINDOWS_MOUNT_DESTINATION ;; esac
if git -C "$dest" rev-parse --is-inside-work-tree >/dev/null 2>&1; then stop DEST_IN_GIT; fi
[[ "$approved" != "$dest"/* && "$approved" != "$esc"/* ]] || stop OWNER_RECEIPT_NOT_SEPARATE
[[ "$(df -PB1 "$dest" | awk 'NR==2 {print $4}')" -gt 1073741824 ]] || stop LOW_DISK
[[ "$(wc -l < "$approved")" == 6 ]] || stop OWNER_RECEIPT_SHAPE
for v in 'CAFEOS_OWNER_CAPTURE_APPROVAL_V1' 'OFFHOST_CUSTODY_VERIFIED_BY_OWNER=YES' \
  'STAGING_WRITE_FREEZE_VERIFIED_BY_OWNER=YES' 'REAL_STAGING_ENCRYPTED_CAPTURE_APPROVED=YES' \
  'ESCROW_MANIFEST_SHA256=dd63b211dc5a25c516b16494ebde997fef211524ffe0184a4a597d4b17e2bf1d'; do
  grep -qxF -- "$v" "$approved" || stop OWNER_RECEIPT_INCOMPLETE
done
grep -qxE '^OWNER_SIGNOFF_DATE_UTC=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$approved" || stop OWNER_DATE_MISSING
# The owner receipt is a recorded assertion, not an independently proven
# device custody or a machine-enforced PostgreSQL write freeze.
[[ -z "${PGPASSWORD:-}" && -z "${SUPABASE_ACCESS_TOKEN:-}" && -z "${PGOPTIONS:-}" ]] || stop UNSAFE_ENVIRONMENT
[[ -x "$cli" && "$("$cli" --version)" == 2.122.0 ]] || stop CLI_NOT_PINNED
export CAFEOS_STAGING_READONLY_PREFLIGHT_ACK=SOURCE_READONLY_ONLY
bash "$root/check-cafeos-staging-capture-readiness.sh" >/dev/null || stop SOURCE_PREFLIGHT_FAILED
docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || stop DOCKER_UNAVAILABLE

original="$(age-keygen -y "$key" 2>/dev/null)" || stop SOURCE_AGE_KEY_INVALID
[[ "$original" == "$(cat -- "$source_pub")" ]] || stop SOURCE_RECIPIENT_MISMATCH
recovery="$(cat -- "$offhost_pub")"
[[ "$recovery" == age1* && "$recovery" != "$original" ]] || stop RECOVERY_RECIPIENT_INVALID

export PGHOST='aws-0-ap-southeast-1.pooler.supabase.com'
export PGUSER='postgres.wjatnyvdygvblirggdcm'
export PGPORT=5432 PGDATABASE=postgres PGSSLMODE=verify-full
export PGSSLROOTCERT="$ca" PGPASSFILE="$pass" PGCONNECT_TIMEOUT=8
unset PGHOSTADDR PGSERVICE || :
encoded_ca="$(python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PGSSLROOTCERT"],safe=""))')"
url="postgresql://$PGUSER@$PGHOST:$PGPORT/postgres?sslmode=verify-full&sslrootcert=$encoded_ca"
[[ "$url" == postgresql://postgres.wjatnyvdygvblirggdcm@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres\?sslmode=verify-full\&sslrootcert=* ]] || stop URL_DRIFT
prefix='/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix'
export PATH="$prefix/usr/lib/postgresql/18/bin:$PATH" LD_LIBRARY_PATH="$prefix/usr/lib/x86_64-linux-gnu"
sql="$root/sql/cafeos-staging-receipt-fingerprint.sql"
ledger(){
  { printf 'BEGIN TRANSACTION READ ONLY;\n'; cat "$sql"; printf '\nCOMMIT;\n'; } |
    timeout 20 psql -XwqAt -v ON_ERROR_STOP=1 2>/dev/null
}
before="$(ledger)" || stop SOURCE_LEDGER_READ_FAILED
[[ "$before" == fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3 ]] || stop ORIGINAL_LEDGER_DRIFT

counts_sql="$root/sql/cafeos-staging-capture-counts-readonly.sql"
[[ -f "$counts_sql" && ! -L "$counts_sql" ]] || stop SOURCE_COUNTS_SQL_MISSING
source_counts(){
  { printf 'BEGIN TRANSACTION READ ONLY;\n'; cat -- "$counts_sql"; printf '\nCOMMIT;\n'; } |
    timeout 35 psql -XwqAt -v ON_ERROR_STOP=1 2>/dev/null
}
validate_source_counts(){
  printf '%s\n' "$1" | python3 -c '
import json,sys
d=json.load(sys.stdin)
expected="auth_users auth_identities storage_buckets storage_objects vault_secrets migration_receipts tenants tenant_members stores imports transaction_line_items customers customer_identifiers attention_items actions action_status_history measurement_windows menu_categories menu_items pos_orders pos_order_items pos_payments daily_closes".split()
assert set(d)==set(expected), "Unexpected source count set"
assert all(type(d[k]) is int and d[k]>=0 for k in expected), "Invalid count"
assert d["auth_users"]>=1 and d["auth_identities"]>=1, "Auth unexpectedly empty"
assert d["migration_receipts"]==7, "Original migration receipt count changed"
' >/dev/null 2>&1 || stop SOURCE_COUNT_SHAPE_OR_BASELINE_INVALID
}
counts_before="$(source_counts)" || stop SOURCE_COUNTS_READ_FAILED
validate_source_counts "$counts_before"
# A pre/post full-table COUNT comparison detects cardinality drift only.
# It does NOT detect same-count mutations or prove a shared DB snapshot.

work="$(mktemp -d "$dest/.five-stream-XXXXXXXX")" || stop PRIVATE_TEMP_FAILED
published=0
cleanup(){
  code=$?
  trap - EXIT
  if [[ "$published" == 0 ]]; then
    rm -f -- "$work"/{roles,schema,data,history-schema,history-data}.sql.age "$work"/{recipients.txt,manifest.sha256,source-ledger.sha256,source-counts.sha256,NOTICE.txt} 2>/dev/null || :
    rmdir "$work" 2>/dev/null || :
  fi
  exit "$code"
}
trap cleanup EXIT
[[ "$(stat -c %a "$work")" == 700 ]] || stop TEMP_PERMISSIONS
printf '%s\n%s\n' "$original" "$recovery" > "$work/recipients.txt"
chmod 600 "$work/recipients.txt"
capture(){
  part="$1"
  out="$work/$part.sql.age"
  case "$part" in
    roles) "$cli" db dump --db-url "$url" --role-only 2>/dev/null | age -R "$work/recipients.txt" -o "$out" ;;
    schema) "$cli" db dump --db-url "$url" 2>/dev/null | age -R "$work/recipients.txt" -o "$out" ;;
    data) "$cli" db dump --db-url "$url" --data-only --use-copy --exclude "storage.buckets_vectors" --exclude "storage.vector_indexes" 2>/dev/null | age -R "$work/recipients.txt" -o "$out" ;;
    history-schema) "$cli" db dump --db-url "$url" --schema supabase_migrations 2>/dev/null | age -R "$work/recipients.txt" -o "$out" ;;
    history-data) "$cli" db dump --db-url "$url" --schema supabase_migrations --data-only --use-copy 2>/dev/null | age -R "$work/recipients.txt" -o "$out" ;;
    *) stop INVALID_COMPONENT ;;
  esac
  [[ -s "$out" ]] || stop EMPTY_CIPHERTEXT
  n="$(age -d -i "$key" "$out" 2>/dev/null | wc -c)" || stop DECRYPT_READBACK_FAILED
  [[ "$n" =~ ^[0-9]+$ && "$n" -gt 0 ]] || stop EMPTY_DECRYPT
  echo "CAFEOS_FIVE_STREAM_CIPHERTEXT_READBACK_PASS=$part"
}
capture roles
capture schema
capture data
capture history-schema
capture history-data
age -d -i "$key" "$work/data.sql.age" 2>/dev/null |
  awk 'index($0,"COPY \"auth\".\"users\" ")==1 {a=1} index($0,"COPY \"auth\".\"identities\" ")==1 {b=1} END {exit !(a&&b)}' || stop MANAGED_AUTH_SHAPE_MISSING
age -d -i "$key" "$work/history-data.sql.age" 2>/dev/null |
  awk 'index($0,"20260921100732"){a=1} index($0,"20261025103648"){b=1} END{exit !(a&&b)}' || stop MIGRATION_HISTORY_SHAPE_MISSING
after="$(ledger)" || stop SOURCE_LEDGER_RECHECK_FAILED
[[ "$after" == "$before" ]] || stop SOURCE_LEDGER_CHANGED_DURING_CAPTURE
counts_after="$(source_counts)" || stop SOURCE_COUNTS_RECHECK_FAILED
validate_source_counts "$counts_after"
[[ "$counts_after" == "$counts_before" ]] || stop SOURCE_CARDINALITY_DRIFT_DURING_CAPTURE
printf '%s\n' "$before" > "$work/source-ledger.sha256"
printf '%s\n' "$counts_before" | sha256sum | awk '{print $1}' > "$work/source-counts.sha256"
printf '%s\n' 'CONFIDENTIAL: not restore certified; 5 dumps are not a proven shared snapshot; independent restore required; RELEASE NO-GO.' > "$work/NOTICE.txt"
(cd "$work"; sha256sum roles.sql.age schema.sql.age data.sql.age history-schema.sql.age history-data.sql.age recipients.txt source-ledger.sha256 source-counts.sha256 NOTICE.txt > manifest.sha256; sha256sum -c manifest.sha256 >/dev/null)
final="$dest/cafeos-staging-five-stream-$(date -u +%Y%m%dT%H%M%SZ)"
[[ ! -e "$final" && ! -L "$final" ]] || stop DEST_EXISTS
mv --no-clobber --no-target-directory -- "$work" "$final" || stop ATOMIC_PUBLICATION_FAILED
published=1
(cd "$final" && sha256sum -c manifest.sha256 >/dev/null) || stop PUBLISHED_CIPHERTEXT_MANIFEST_FAILED
echo "CAFEOS_FIVE_STREAM_MANIFEST_SHA256=$(sha256sum "$final/manifest.sha256" | awk '{print $1}')"
echo 'CAFEOS_STAGING_FIVE_COMPONENT_CIPHERTEXT_CREATED_NOT_RESTORED'
echo 'CAFEOS_SOURCE_23_COUNT_FIELDS_PRE_POST_MATCH_ONLY'
echo 'CAFEOS_MULTISTREAM_SNAPSHOT_CONSISTENCY_NOT_MACHINE_PROVEN'
echo 'CAFEOS_INDEPENDENT_RESTORE_NOT_PROVEN'
echo 'CAFEOS_RELEASE_NO_GO'
