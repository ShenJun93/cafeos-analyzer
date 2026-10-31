#!/usr/bin/env bash
# Synthetic-only Auth + migration-history recovery to TWO separate disposable
# databases on the SAME local GitHub Actions PostgreSQL server.
# This does not establish managed Supabase/off-host restore compatibility.
set -euo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == 'true' && "${CI:-}" == 'true' ]] || {
  echo 'STOP: disposable GitHub Actions environment required' >&2; exit 42;
}
[[ -f .github/workflows/supabase-db.yml ]] || {
  echo 'STOP: must run from the checked-out repo root' >&2; exit 42;
}
for bin in psql pg_dump pg_isready age age-keygen createdb dropdb; do
  command -v "$bin" >/dev/null || { echo "STOP: missing $bin" >&2; exit 42; }
done

readonly DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
readonly SRC='cafeos_ci_auth_hist_src'
readonly DST='cafeos_ci_auth_hist_dst'
source_url="postgresql://postgres:postgres@127.0.0.1:54322/$SRC"
target_url="postgresql://postgres:postgres@127.0.0.1:54322/$DST"
pg_isready -h 127.0.0.1 -p 54322 -U postgres -d postgres -q
[[ "$(psql "$DB_URL" -XAtq -v ON_ERROR_STOP=1 -c \
 "select current_database()||':'||current_user")" == 'postgres:postgres' ]] || exit 42
[[ "$(psql "$DB_URL" -XAtq -v ON_ERROR_STOP=1 -c \
 'select count(*) from auth.users')" == 0 ]] || {
  echo 'STOP: expected zero Auth users in disposable local baseline' >&2; exit 42;
}
for name in "$SRC" "$DST"; do
  [[ "$(psql "$DB_URL" -XAtq -v ON_ERROR_STOP=1 -c \
    "select count(*) from pg_database where datname='$name'")" == 0 ]] || {
    echo 'STOP: preexisting scratch DB, refusing overwrite' >&2; exit 42;
  }
done

work="$(mktemp -d)"
[[ "$(stat -c %a "$work")" == 700 ]] || exit 42
created=()
cleanup() {
  for name in "${created[@]}"; do
    dropdb --maintenance-db="$DB_URL" --if-exists --force "$name" >/dev/null ||
      echo 'WARN: scratch database cleanup failed' >&2
  done
  rm -rf -- "$work"
}
trap cleanup EXIT

for name in "$SRC" "$DST"; do
  createdb --maintenance-db="$DB_URL" "$name"
  created+=("$name")
  # Only the blank LOCAL Auth schema is used as a structural fixture.
  # Never do this against hosted Supabase managed schemas.
  pg_dump --dbname="$DB_URL" --schema-only --schema=auth --no-owner --no-acl |
    psql "postgresql://postgres:postgres@127.0.0.1:54322/$name" \
      -Xq -v ON_ERROR_STOP=1 >/dev/null
  psql "postgresql://postgres:postgres@127.0.0.1:54322/$name" \
    -Xq -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations
 (version text PRIMARY KEY, name text NOT NULL, statements text[]);
SQL
done
echo 'CAFEOS_SYNTHETIC_DISTINCT_SOURCE_TARGET_READY'

psql "$source_url" -Xq -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users
 (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
 VALUES
 ('90000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','synthetic-cafeos@example.invalid',
  'SYNTHETIC-NOT-A-VALID-PASSWORD', now(), now());
INSERT INTO auth.identities
 (id, provider_id, user_id, provider, identity_data, created_at, updated_at)
 VALUES
 ('90000000-0000-4000-8000-000000000002',
  'synthetic-cafeos-user-1',
  '90000000-0000-4000-8000-000000000001',
  'email',
  '{"sub":"90000000-0000-4000-8000-000000000001","email":"synthetic-cafeos@example.invalid"}'::jsonb,
  now(), now());
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
 SELECT v, 'synthetic_local_only', ARRAY['select 1']
 FROM (VALUES
  ('20260921100732'),('20260921103432'),('20260921105352'),
  ('20260921133428'),('20260921141814'),('20260921151006'),
  ('20261025103648')
 ) AS versions(v);
SQL

counts() {
  psql "$1" -XAtq -v ON_ERROR_STOP=1 -c \
    "select (select count(*) from auth.users)::text || ':' ||
            (select count(*) from auth.identities)::text || ':' ||
            (select count(*) from supabase_migrations.schema_migrations)::text"
}
[[ "$(counts "$source_url")" == '1:1:7' && "$(counts "$target_url")" == '0:0:0' ]] || {
  echo 'STOP: synthetic fixture source/target counts incorrect' >&2; exit 42;
}
echo 'CAFEOS_SYNTHETIC_1_AUTH_1_IDENTITY_7_RECEIPTS_SOURCE_PASS'

age-keygen -o "$work/identity.txt" >/dev/null 2>&1
age-keygen -y "$work/identity.txt" > "$work/recipient.txt"
chmod 600 "$work/identity.txt" "$work/recipient.txt"
[[ "$(stat -c %a "$work/identity.txt")" == 600 ]] || exit 42

pg_dump --dbname="$source_url" --data-only --no-owner --no-acl \
  --schema=auth --schema=supabase_migrations |
  age -R "$work/recipient.txt" -o "$work/auth-history.age"
[[ -s "$work/auth-history.age" ]] || {
  echo 'STOP: empty age ciphertext' >&2; exit 42;
}
{
  printf 'BEGIN; SET LOCAL session_replication_role=replica;\n'
  age -d -i "$work/identity.txt" "$work/auth-history.age"
  printf '\nCOMMIT;\n'
} | psql "$target_url" -Xq -v ON_ERROR_STOP=1 >/dev/null
[[ "$(counts "$source_url")" == '1:1:7' && "$(counts "$target_url")" == '1:1:7' ]] || {
  echo 'STOP: Auth/history count mismatch after recovery' >&2; exit 42;
}

ledger_query="select md5(string_agg(version || ':' || name || ':' || array_to_string(statements,',') , '|' order by version)) from supabase_migrations.schema_migrations"
src_fp="$(psql "$source_url" -XAtq -v ON_ERROR_STOP=1 -c "$ledger_query")"
dst_fp="$(psql "$target_url" -XAtq -v ON_ERROR_STOP=1 -c "$ledger_query")"
[[ -n "$src_fp" && "$src_fp" == "$dst_fp" ]] || {
  echo 'STOP: synthetic migration receipts mismatch' >&2; exit 42;
}
[[ "$(psql "$target_url" -XAtq -v ON_ERROR_STOP=1 -c \
  "select count(*) from auth.users u join auth.identities i on i.user_id=u.id
   where u.email='synthetic-cafeos@example.invalid' and i.provider='email'")" == 1 ]] || {
  echo 'STOP: Auth user/identity relationship absent' >&2; exit 42;
}
echo 'CAFEOS_SYNTHETIC_DISTINCT_DB_AUTH_HISTORY_AGE_RESTORE_PASS'
echo 'SAME_LOCAL_POSTGRES_SERVER_NOT_REAL_SUPABASE_RESTORE_NOT_OFFHOST'
