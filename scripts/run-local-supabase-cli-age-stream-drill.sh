#!/usr/bin/env bash
# Disposable GitHub Actions test only. This is NEVER a staging backup script.
# Proves: Supabase-filtered roles/schema/data plus separate migration history
# stream directly into age (no persistent plaintext SQL files).
set -euo pipefail
umask 077

[[ "${GITHUB_ACTIONS:-}" == "true" && "${CI:-}" == "true" ]] || {
  echo 'STOP: GitHub Actions synthetic localhost only' >&2
  exit 42
}
[[ -f .github/workflows/supabase-db.yml ]] || {
  echo 'STOP: run from the checked-out CafeOS repository root' >&2
  exit 42
}
for bin in supabase age age-keygen psql pg_isready sha256sum wc awk; do
  command -v "$bin" >/dev/null || { echo "STOP: missing $bin" >&2; exit 42; }
done
# NO remote connection flags, project links, credentials or staging source.
readonly local_db='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
pg_isready -h 127.0.0.1 -p 54322 -U postgres -d postgres -q
[[ "$(psql "$local_db" -X -Atq -v ON_ERROR_STOP=1 -c \
  "select current_database() || ':' || current_user")" == 'postgres:postgres' ]] || {
  echo 'STOP: database is not the disposable localhost test DB' >&2
  exit 42
}
[[ "$(psql "$local_db" -X -Atq -v ON_ERROR_STOP=1 -c \
  "select to_regclass('supabase_migrations.schema_migrations') is not null")" == 't' ]] || {
  echo 'STOP: local migration history fixture is missing' >&2
  exit 42
}
[[ "$(psql "$local_db" -X -Atq -v ON_ERROR_STOP=1 -c \
  'select count(*) > 0 from supabase_migrations.schema_migrations')" == 't' ]] || {
  echo 'STOP: local migration history contains no receipts' >&2
  exit 42
}

work="$(mktemp -d)"
[[ "$(stat -c '%a' "$work")" == '700' ]] || exit 42
cleanup() {
  # This ephemeral directory contains only synthetic age identity/ciphertexts.
  rm -rf -- "$work"
}
trap cleanup EXIT

age-keygen -o "$work/identity.txt" >/dev/null 2>&1
age-keygen -y "$work/identity.txt" > "$work/recipient.txt"
chmod 600 "$work/identity.txt" "$work/recipient.txt"
[[ "$(stat -c '%a' "$work/identity.txt")" == '600' ]] || exit 42

# Strictly hardcoded commands; do not accept arbitrary connection URLs or
# SQL in arguments. The five commands produce ONLY synthetic localhost dumps.
stream_encrypted() {
  local component="$1" outfile="$work/$1.sql.age"
  case "$component" in
    roles)
      supabase db dump --local --role-only |
        age -R "$work/recipient.txt" -o "$outfile" ;;
    schema)
      supabase db dump --local |
        age -R "$work/recipient.txt" -o "$outfile" ;;
    data)
      supabase db dump --local --data-only --use-copy |
        age -R "$work/recipient.txt" -o "$outfile" ;;
    history-schema)
      supabase db dump --local --schema supabase_migrations |
        age -R "$work/recipient.txt" -o "$outfile" ;;
    history-data)
      supabase db dump --local --schema supabase_migrations --data-only --use-copy |
        age -R "$work/recipient.txt" -o "$outfile" ;;
    *)
      echo 'STOP: unknown export component' >&2; exit 42 ;;
  esac

  [[ -s "$outfile" ]] || {
    echo "STOP: encrypted $component artifact empty" >&2
    exit 42
  }
  local plain_bytes
  plain_bytes="$(age -d -i "$work/identity.txt" "$outfile" | wc -c)"
  [[ "$plain_bytes" =~ ^[0-9]+$ && "$plain_bytes" -gt 0 ]] || {
    echo "STOP: encrypted $component did not decrypt to nonempty output" >&2
    exit 42
  }
  echo "CAFEOS_LOCAL_ENCRYPTED_COMPONENT_PASS=$component"
}

stream_encrypted roles
stream_encrypted schema
stream_encrypted data
stream_encrypted history-schema
stream_encrypted history-data

(
  cd "$work"
  sha256sum roles.sql.age schema.sql.age data.sql.age \
    history-schema.sql.age history-data.sql.age > manifest.sha256
  sha256sum -c manifest.sha256 >/dev/null
)
# Check a concrete migration receipt was preserved inside encrypted history
# data, but print no receipt text or SQL.
age -d -i "$work/identity.txt" "$work/history-data.sql.age" |
  awk 'index($0,"20260921005530") { found=1 } END { exit !found }' || {
    echo 'STOP: expected canonical migration version absent from encrypted data readback' >&2
    exit 42
  }

echo 'CAFEOS_SUPABASE_COMPATIBLE_STREAM_AGE_LOCAL_CI_PASS'
echo 'SYNTHETIC_LOCAL_ONLY_REAL_STAGING_EXPORT_AND_RESTORE_NOT_PROVEN'
