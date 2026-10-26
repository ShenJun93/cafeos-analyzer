#!/usr/bin/env bash
# CafeOS STAGING backup candidate, NOT executed by CI or any live deployment.
# Requires offline-owned portable age recipient/identity, pg_dump >= 17 and SSL.
# Database traffic is read-only; pg_dump plaintext streams directly to age.
set -euo pipefail
umask 077
ref="wjatnyvdygvblirggdcm"
: "${PGHOST:?Set staging DB host via libpq}"
: "${PGUSER:?Set staging database user via libpq}"
: "${PGPASSFILE:?Set a protected external pgpass file}"
: "${PGSSLROOTCERT:?Set trusted staging root CA file}"
: "${CAFEOS_BACKUP_DIR:?Choose non-repo backup output directory}"
: "${CAFEOS_AGE_RECIPIENTS:?Set external age public recipient file}"
: "${CAFEOS_AGE_IDENTITY:?Set external age private identity for readback}"

[[ "${PGDATABASE:-postgres}" == "postgres" ]]
[[ "${PGPORT:-5432}" == "5432" ]]
[[ "${PGSSLMODE:-}" == "verify-full" ]] || {
  echo "STOP: PGSSLMODE must be verify-full" >&2; exit 12;
}
[[ -z "${PGPASSWORD:-}" ]] || {
  echo "STOP: use PGPASSFILE, not a password environment variable" >&2; exit 12;
}
if [[ "$PGHOST" == "db.${ref}.supabase.co" ]]; then
  [[ "$PGUSER" == "postgres" ]] || exit 12
elif [[ "$PGHOST" =~ ^aws-[0-9]+-ap-southeast-1[.]pooler[.]supabase[.]com$ ]]; then
  [[ "$PGUSER" == "postgres.${ref}" ]] || exit 12
else
  echo "STOP: not the pinned CafeOS staging direct/session-pooler host" >&2
  exit 12
fi

for file in "$PGPASSFILE" "$PGSSLROOTCERT" "$CAFEOS_AGE_RECIPIENTS" "$CAFEOS_AGE_IDENTITY"; do
  [[ -f "$file" && -r "$file" ]] || { echo "STOP: missing protected local prerequisite" >&2; exit 12; }
done
[[ "$(stat -c '%a' "$PGPASSFILE")" == "600" ]] || {
  echo "STOP: pgpass file must have chmod 600" >&2; exit 12;
}
[[ -d "$CAFEOS_BACKUP_DIR" && -w "$CAFEOS_BACKUP_DIR" ]] || {
  echo "STOP: destination must preexist with restricted permissions" >&2; exit 12;
}
dest="$(realpath "$CAFEOS_BACKUP_DIR")"
key="$(realpath "$CAFEOS_AGE_IDENTITY")"
passfile="$(realpath "$PGPASSFILE")"
case "$key" in "$dest"/*) echo "STOP: decryption key cannot share backup directory" >&2; exit 12;; esac
case "$passfile" in "$dest"/*) echo "STOP: DB password file cannot share backup directory" >&2; exit 12;; esac
[[ "$(stat -c '%a' "$dest")" == "700" ]] || { echo "STOP: backup directory needs chmod 700" >&2; exit 12; }
# Neither confidential key material nor encrypted archives belong inside Git.
command -v git >/dev/null || { echo "STOP: git needed to verify destination boundaries" >&2; exit 12; }
if git -C "$dest" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "STOP: destination cannot be inside a Git working tree" >&2; exit 12;
fi
if git -C "$(dirname "$key")" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "STOP: age private identity cannot be inside a Git working tree" >&2; exit 12;
fi
[[ "$(stat -c '%a' "$key")" == "600" || "$(stat -c '%a' "$key")" == "400" ]] || {
  echo "STOP: age private identity must have file mode 0600 or 0400" >&2; exit 12;
}


for executable in psql pg_dump pg_dumpall pg_restore age sha256sum; do
  command -v "$executable" >/dev/null || { echo "STOP: missing required binary $executable" >&2; exit 12; }
done
for binary in pg_dump pg_dumpall pg_restore; do
  major="$("$binary" --version | grep -oE '[0-9]+([.][0-9]+)?$' | cut -d. -f1)"
  [[ "$major" =~ ^[0-9]+$ && "$major" -ge 17 ]] || {
    echo "STOP: PostgreSQL clients must be version 17 or newer" >&2; exit 12;
  }
done

# Default transaction settings are read-only; no data/ledger/DDL mutations.
export PGOPTIONS="-c default_transaction_read_only=on"
script_root="$(cd -- "$(dirname -- "$0")" && pwd)"
ledger_sql="$script_root/sql/cafeos-staging-receipt-fingerprint.sql"
[[ -r "$ledger_sql" ]] || { echo "STOP: receipt fingerprint SQL unavailable" >&2; exit 13; }
ledger_fingerprint() {
  psql -XAtw -v ON_ERROR_STOP=1 -d postgres -f "$ledger_sql"
}
ledger_hash_before="$(ledger_fingerprint)"
[[ "$ledger_hash_before" =~ ^[0-9a-f]{64}$ ]] || {
  echo "STOP: unexpected original migration receipt fingerprint" >&2; exit 13;
}

receipt_versions="$(psql -XAtw -v ON_ERROR_STOP=1 -d postgres -c \
  "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations")"
expected="20260921100732,20260921103432,20260921105352,20260921133428,20260921141814,20260921151006,20261025103648"
[[ "$receipt_versions" == "$expected" ]] || {
  echo "STOP: live staging receipt history differs from attested 7-version snapshot" >&2; exit 13;
}

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$dest/cafeos-staging-$stamp"
[[ ! -e "$final" ]] || { echo "STOP: existing backup directory" >&2; exit 13; }
work="$(mktemp -d "$dest/.cafeos-archive-XXXXXX")"
cleanup() {
  if [[ -d "$work" ]]; then
    rm -f -- "$work/database.pgdump.age" "$work/globals.sql.age" "$work/source-ledger-sha256.txt" "$work/manifest.sha256"
    rmdir -- "$work" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Stream plaintext only in pipes; both archive components remain in ONE
# private temporary directory until verified and published atomically.
pg_dump -w -Fc --dbname=postgres | age -R "$CAFEOS_AGE_RECIPIENTS" -o "$work/database.pgdump.age"
pg_dumpall -w --globals-only --no-role-passwords | age -R "$CAFEOS_AGE_RECIPIENTS" -o "$work/globals.sql.age"
[[ -s "$work/database.pgdump.age" && -s "$work/globals.sql.age" ]] || {
  echo "STOP: incomplete ciphertext archive" >&2; exit 14;
}
age -d -i "$CAFEOS_AGE_IDENTITY" "$work/database.pgdump.age" | pg_restore --list >/dev/null
age -d -i "$CAFEOS_AGE_IDENTITY" "$work/globals.sql.age" | sha256sum >/dev/null
# Reject mid-dump ledger edits, including modified SQL under unchanged versions.
ledger_hash_after="$(ledger_fingerprint)"
[[ "$ledger_hash_after" == "$ledger_hash_before" ]] || {
  echo "STOP: staging migration SQL ledger changed during backup" >&2
  exit 13
}
printf '%s\n' "$ledger_hash_before" > "$work/source-ledger-sha256.txt"
(
  cd "$work"
  sha256sum database.pgdump.age globals.sql.age source-ledger-sha256.txt > manifest.sha256
  sha256sum -c manifest.sha256 >/dev/null
)
# The manifest uses relative names inside the final directory, and a single
# same-filesystem directory rename prevents exposing half-complete archives.
mv --no-clobber --no-target-directory -- "$work" "$final"
[[ ! -d "$work" && -d "$final" ]] || {
  echo "STOP: atomic directory publication refused" >&2; exit 14;
}
(
  cd "$final"
  sha256sum -c manifest.sha256 >/dev/null
)
echo "CAFEOS_STAGING_ENCRYPTED_LOGICAL_BACKUP_COMPLETE: encrypted database and globals, no plaintext files"
echo "RESTORE_NOT_YET_PROVEN: require isolated fresh-DB pg_restore rehearsal before history repair"
