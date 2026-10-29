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

# A COPY table header can exist with ZERO records; require one synthetic
# Auth user and identity, then confirm the actual encrypted data contains BOTH.
# No staging IDs, users, passwords or real customer data are used here.
readonly fixture_user='91000000-0000-4000-8000-000000000001'
readonly fixture_identity='91000000-0000-4000-8000-000000000002'
[[ "$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c \
  'select (select count(*) from auth.users)::text || chr(58) || (select count(*) from auth.identities)::text')" == '0:0' ]] || {
  echo 'STOP: Auth test requires blank disposable local baseline' >&2
  exit 42
}

work="$(mktemp -d)"
[[ "$(stat -c '%a' "$work")" == '700' ]] || exit 42
fixture_inserted=0
cleanup() {
  local status=$? cleanup_failed=0
  trap - EXIT
  if [[ "$fixture_inserted" == 1 ]]; then
    # Explicitly delete only the two fixed synthetic IDs, never other Auth rows.
    psql "$local_db" -Xqw -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || cleanup_failed=1
BEGIN;
DELETE FROM auth.identities WHERE id='91000000-0000-4000-8000-000000000002'
  AND user_id='91000000-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id='91000000-0000-4000-8000-000000000001';
COMMIT;
SQL
    [[ "$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c \
      'select (select count(*) from auth.users)::text || chr(58) || (select count(*) from auth.identities)::text')" == '0:0' ]] || cleanup_failed=1
  fi
  rm -rf -- "$work" || cleanup_failed=1
  if [[ "$cleanup_failed" == 1 ]]; then
    echo 'STOP: synthetic Auth fixture or age cleanup failed' >&2
    exit 42
  fi
  exit "$status"
}
trap cleanup EXIT

# Local Supabase Auth schema on a disposable GitHub runner only. Transactional
# fixture, fixed fake identity; does not log or persist a valid password.
psql "$local_db" -Xqw -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
BEGIN;
INSERT INTO auth.users
 (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
 VALUES (
 '91000000-0000-4000-8000-000000000001',
 '00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','age-stream-synthetic@example.invalid',
 'NOT-A-VALID-PASSWORD', now(), now());
INSERT INTO auth.identities
 (id, provider_id, user_id, provider, identity_data, created_at, updated_at)
 VALUES (
 '91000000-0000-4000-8000-000000000002',
 'age-stream-fixture-1',
 '91000000-0000-4000-8000-000000000001',
 'email',
 '{"sub":"91000000-0000-4000-8000-000000000001","email":"age-stream-synthetic@example.invalid"}'::jsonb,
 now(), now());
COMMIT;
SQL
fixture_inserted=1
[[ "$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c \
  'select (select count(*) from auth.users)::text || chr(58) || (select count(*) from auth.identities)::text')" == '1:1' ]] || {
  echo 'STOP: synthetic Auth seed did not produce 1 user and 1 identity' >&2
  exit 42
}

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

# A header alone is insufficient: verify each known synthetic record actually
# occurs WITHIN its own COPY payload in the decrypted data stream.
# No plaintext is written to disk, printed, or retained beyond the awk process.
age -d -i "$work/identity.txt" "$work/data.sql.age" |
  awk '
    index($0, "COPY \"auth\".\"users\" ") == 1 { users=1; in_users=1; in_identities=0; next }
    index($0, "COPY \"auth\".\"identities\" ") == 1 { identities=1; in_identities=1; in_users=0; next }
    index($0, "COPY ") == 1 { in_users=0; in_identities=0; next }
    $0 == "\\." { in_users=0; in_identities=0; next }
    in_users && index($0, "91000000-0000-4000-8000-000000000001") { user_record=1 }
    in_identities && index($0, "91000000-0000-4000-8000-000000000002") { identity_record=1 }
    END { exit !(users && identities && user_record && identity_record) }
  ' || {
    echo 'STOP: exported encrypted data missing nonempty synthetic Auth records' >&2
    exit 42
  }
echo 'CAFEOS_LOCAL_AUTH_NONEMPTY_ENCRYPTED_EXPORT_PASS'

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
