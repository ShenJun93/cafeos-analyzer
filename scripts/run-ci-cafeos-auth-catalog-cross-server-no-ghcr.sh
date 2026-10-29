#!/usr/bin/env bash
# CafeOS: exact PR99 Auth catalog comparator on TWO independent synthetic PG servers.
# GitHub CI only; no Docker/GHCR, external service, JWT, or staging records.
set -euo pipefail
umask 077
[[ "$(printenv GITHUB_ACTIONS || true)" == true &&
   "$(printenv CI || true)" == true &&
   "$(id -un)" == postgres ]] || { echo STOP_CI_POSTGRES_ONLY >&2; exit 42; }
for bin in node psql pg_dump pg_restore pg_config age age-keygen dropdb; do
  command -v "$bin" >/dev/null || { echo "STOP_MISSING_$bin" >&2; exit 42; }
done
readonly bindir='/usr/lib/postgresql/16/bin'
[[ -x "$bindir/initdb" && -x "$bindir/pg_ctl" ]] || { echo STOP_PG16_BINARIES >&2; exit 42; }
[[ "$(stat -f -c %T /dev/shm)" == tmpfs ]] || { echo STOP_TMPFS_REQUIRED >&2; exit 42; }
[[ "$(psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c "select current_setting('server_version_num')::int / 10000")" == 16 ]] ||
  { echo STOP_SOURCE_PG16_REQUIRED >&2; exit 42; }
readonly source_db=cafeos_auth_catalog_source_ci
readonly target_db=cafeos_auth_catalog_recovered_ci
readonly port=55887
[[ "$(psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c \
 "select count(*) from pg_database where datname='$source_db'")" == 0 ]] ||
 { echo STOP_SOURCE_DB_COLLISION >&2; exit 42; }
work="$(mktemp -d /dev/shm/cafeos-auth-catalog.XXXXXXXX)"
[[ "$(stat -c %a "$work")" == 700 ]] || exit 42
source_created=0
target_running=0
success=0
cleanup() {
  local status=$? failed=0
  trap - EXIT
  if [[ "$target_running" == 1 ]]; then
    "$bindir/pg_ctl" -D "$work/target-pg" -m immediate -w stop >/dev/null 2>&1 || failed=1
  fi
  if [[ "$source_created" == 1 ]]; then
    dropdb --if-exists --force "$source_db" >/dev/null 2>&1 || failed=1
  fi
  rm -rf -- "$work" || failed=1
  if [[ "$failed" != 0 ]]; then echo STOP_SYNTHETIC_CLEANUP_FAILED >&2; exit 42; fi
  if [[ "$status" == 0 && "$success" == 1 ]]; then
    printf '%s\n' \
      'CAFEOS_AUTH_CATALOG_DISTINCT_PG_CLUSTERS_PASS' \
      'CAFEOS_AUTH_CATALOG_EXACT_PR99_SQL_MATCH_PASS' \
      'CAFEOS_AUTH_CATALOG_SYNTHETIC_AGE_RESTORE_PASS' \
      'CAFEOS_AUTH_CATALOG_FIVE_NEGATIVE_CONTROLS_PASS' \
      'CAFEOS_AUTH_CATALOG_PRIVATE_TMPFS_CLEANUP_PASS' \
      'NO_REAL_SUPABASE_AUTH_JWT_OR_STAGING_TESTED'
  fi
  exit "$status"
}
trap cleanup EXIT

# Extract EXACT PR99-authored fingerprint SQL. Never silently substitute
# a weaker comparator just to make the independent CI run green.
node --input-type=module > "$work/catalog.sql" <<'JS'
import {readFileSync} from 'node:fs';
const script=readFileSync('scripts/run-ci-cafeos-distinct-postgres-age-restore.sh','utf8').replace(/\r\n/g,'\n');
const marker='auth_catalog_sql="';
const begin=script.indexOf(marker);
const end=script.indexOf('"\nsource_auth_catalog=',begin+marker.length);
if(begin<0||end<0) throw Error('STOP_PR99_SQL_EXTRACTION');
const sql=script.slice(begin+marker.length,end);
for(const part of ['pg_constraint','pg_indexes','pg_policies','pg_trigger','relrowsecurity']) {
 if(!sql.includes(part)) throw Error('STOP_PR99_SQL_WEAKENED_'+part);
}
if(sql.includes('"')) throw Error('STOP_PR99_SQL_UNEXPECTED_QUOTES');
process.stdout.write(sql+'\n');
JS
catalog="$(cat "$work/catalog.sql")"

createdb --template=template0 "$source_db"
source_created=1
mkdir -p "$work/socket"
"$bindir/initdb" -D "$work/target-pg" --auth-local=peer --auth-host=reject -U postgres >/dev/null
"$bindir/pg_ctl" -D "$work/target-pg" -o \
 "-c listen_addresses='' -c unix_socket_directories='$work/socket' -p $port -c shared_buffers=16MB -c max_connections=15" \
 -l "$work/target.log" -w start >/dev/null
target_running=1
src_system="$(psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c "select system_identifier from pg_control_system()")"
dst_system="$(psql -XAtqw -v ON_ERROR_STOP=1 -h "$work/socket" -p "$port" -d postgres -c "select system_identifier from pg_control_system()")"
[[ -n "$src_system" && -n "$dst_system" && "$src_system" != "$dst_system" ]] ||
  { echo STOP_NOT_DISTINCT_PG_SERVERS >&2; exit 42; }
[[ "$(psql -XAtqw -v ON_ERROR_STOP=1 -h "$work/socket" -p "$port" -d postgres -c "show listen_addresses")" == '' ]] ||
  { echo STOP_TARGET_HAS_TCP_LISTENER >&2; exit 42; }
createdb -h "$work/socket" -p "$port" --template=template0 "$target_db"
source_sql() { psql -XAtqw -v ON_ERROR_STOP=1 -d "$source_db" -c "$1"; }
target_sql() { psql -XAtqw -v ON_ERROR_STOP=1 -h "$work/socket" -p "$port" -d "$target_db" -c "$1"; }

psql -Xqw -v ON_ERROR_STOP=1 -d "$source_db" <<'SQL'
BEGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(
 id text CONSTRAINT users_pkey PRIMARY KEY,
 email text CONSTRAINT users_email_key UNIQUE NOT NULL,
 tenant_id text NOT NULL,
 is_anonymous boolean NOT NULL DEFAULT false
);
CREATE TABLE auth.identities(
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES auth.users(id),
 provider text NOT NULL,
 provider_id text NOT NULL,
 UNIQUE(provider,provider_id)
);
CREATE INDEX auth_fixture_tenant_idx ON auth.users(tenant_id);
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_fixture_tenant_select ON auth.users
 FOR SELECT USING(tenant_id=current_setting('app.synthetic_tenant',true));
CREATE FUNCTION auth.fixture_trigger_fn() RETURNS trigger LANGUAGE plpgsql
 AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER auth_fixture_touch BEFORE INSERT ON auth.users
 FOR EACH ROW EXECUTE FUNCTION auth.fixture_trigger_fn();
INSERT INTO auth.users(id,email,tenant_id) VALUES
 ('user-a','a@example.invalid','tenant-a'),
 ('user-b','b@example.invalid','tenant-b');
INSERT INTO auth.identities(id,user_id,provider,provider_id) VALUES
 ('identity-a','user-a','email','a'),
 ('identity-b','user-b','email','b');
COMMIT;
SQL

age-keygen -o "$work/key.txt" >/dev/null 2>&1
recipient="$(age-keygen -y "$work/key.txt")"
[[ "$recipient" == age1* ]] || { echo STOP_EPHEMERAL_AGE_RECIPIENT >&2; exit 42; }
pg_dump -Fc --schema=auth --no-owner --no-acl -d "$source_db" |
  age -r "$recipient" -o "$work/auth.pgcustom.age"
age -d -i "$work/key.txt" "$work/auth.pgcustom.age" |
  pg_restore --no-owner --no-acl --single-transaction --exit-on-error \
    -h "$work/socket" -p "$port" -d "$target_db"
[[ "$(source_sql "select count(*) from auth.users")" == 2 &&
   "$(target_sql "select count(*) from auth.users")" == 2 &&
   "$(target_sql "select count(*) from auth.identities")" == 2 ]] ||
  { echo STOP_FAKE_AUTH_ROWS_NOT_RESTORED >&2; exit 42; }
baseline="$(source_sql "$catalog")"
[[ "$baseline" =~ ^[1-9][0-9]*:[0-9a-f]{32}$ &&
   "$baseline" == "$(target_sql "$catalog")" ]] ||
  { echo STOP_EXACT_PR99_CATALOG_BASELINE_DRIFT >&2; exit 42; }
count="$(printf '%s' "$baseline" | cut -d: -f1)"
[[ "$count" -ge 9 ]] || { echo STOP_INSUFFICIENT_AUTH_CATALOG_ITEMS >&2; exit 42; }
must_drift() {
  [[ "$(target_sql "$catalog")" != "$baseline" ]] ||
    { echo "STOP_FALSE_NEGATIVE_$1" >&2; exit 42; }
}
must_recover() {
  [[ "$(target_sql "$catalog")" == "$baseline" ]] ||
    { echo "STOP_CATALOG_NOT_RECOVERED_$1" >&2; exit 42; }
}
target_sql 'DROP INDEX auth.auth_fixture_tenant_idx'
must_drift index
target_sql 'CREATE INDEX auth_fixture_tenant_idx ON auth.users(tenant_id)'
must_recover index
target_sql 'ALTER TABLE auth.users DROP CONSTRAINT users_email_key'
must_drift constraint
target_sql 'ALTER TABLE auth.users ADD CONSTRAINT users_email_key UNIQUE(email)'
must_recover constraint
target_sql 'ALTER TABLE auth.users DISABLE ROW LEVEL SECURITY'
must_drift rls
target_sql 'ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY'
must_recover rls
target_sql 'DROP POLICY auth_fixture_tenant_select ON auth.users'
must_drift policy
target_sql "CREATE POLICY auth_fixture_tenant_select ON auth.users FOR SELECT USING(tenant_id=current_setting('app.synthetic_tenant',true))"
must_recover policy
target_sql 'DROP TRIGGER auth_fixture_touch ON auth.users'
must_drift trigger
target_sql 'CREATE TRIGGER auth_fixture_touch BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.fixture_trigger_fn()'
must_recover trigger
echo "AUTH_CATALOG_SYNTHETIC_ITEM_COUNT=$count"
success=1
