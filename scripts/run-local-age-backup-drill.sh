#!/usr/bin/env bash
# Only the disposable GitHub Actions Supabase localhost stack may be used.
# Tests real encrypted pg_dump/age streaming and clean-room Postgres restore.
set -euo pipefail
umask 077
readonly DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
[[ "$DB_URL" == "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ]]
for binary in age age-keygen pg_dump pg_dumpall pg_restore createdb dropdb psql pg_isready; do
  command -v "$binary" >/dev/null
done
for binary in pg_dump pg_dumpall pg_restore; do
  [[ "$("$binary" --version)" == *" 17."* ]] || {
    echo "STOP: disposable restore rehearsal requires PostgreSQL client major 17" >&2
    exit 42
  }
done
pg_isready -h 127.0.0.1 -p 54322 -U postgres -d postgres -q
[[ "$(psql "$DB_URL" -Atq -c "select current_database()||':'||current_user")" == "postgres:postgres" ]]

source_db="cafeos_age_src_$$"
restore_db="cafeos_age_dst_$$"
source_url="postgresql://postgres:postgres@127.0.0.1:54322/$source_db"
restore_url="postgresql://postgres:postgres@127.0.0.1:54322/$restore_db"
tmp="$(mktemp -d)"
source_created=false
restore_created=false
cleanup() {
  if [[ "$restore_created" == true ]]; then
    dropdb --if-exists --maintenance-db="$DB_URL" "$restore_db" || true
  fi
  if [[ "$source_created" == true ]]; then
    dropdb --if-exists --maintenance-db="$DB_URL" "$source_db" || true
  fi
  rm -f -- "$tmp/identity" "$tmp/recipients" "$tmp/database.pgdump.age" "$tmp/globals.sql.age" "$tmp/manifest.sha256"
  rmdir -- "$tmp" 2>/dev/null || true
}
trap cleanup EXIT
# The scratch names must be absent; never overwrite any existing database.
for db in "$source_db" "$restore_db"; do
  [[ "$(psql "$DB_URL" -Atq -c "select count(*) from pg_database where datname = '$db'")" == "0" ]]
done
createdb --maintenance-db="$DB_URL" "$source_db"
source_created=true
createdb --maintenance-db="$DB_URL" "$restore_db"
restore_created=true
psql "$source_url" -X -q -v ON_ERROR_STOP=1 <<'SQL'
create schema synthetic;
create table synthetic.sales (id integer primary key, title text not null, cents integer not null);
insert into synthetic.sales(id,title,cents) values
 (1,'Cà phê sữa đá',2900),(2,'Tổng thử nghiệm',255);
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key, statements text[]);
insert into supabase_migrations.schema_migrations values
 ('20260921100732',array['select 1','select 2']);
SQL
age-keygen -o "$tmp/identity" >/dev/null 2>&1
age-keygen -y "$tmp/identity" > "$tmp/recipients"
pg_dump -w -Fc --dbname="$source_url" | age -R "$tmp/recipients" -o "$tmp/database.pgdump.age"
pg_dumpall -w --globals-only --no-role-passwords --dbname="$DB_URL" |
  age -R "$tmp/recipients" -o "$tmp/globals.sql.age"
[[ -s "$tmp/database.pgdump.age" && -s "$tmp/globals.sql.age" ]]
age -d -i "$tmp/identity" "$tmp/database.pgdump.age" |
  pg_restore --no-owner --no-acl --exit-on-error --dbname="$restore_url"
age -d -i "$tmp/identity" "$tmp/globals.sql.age" | sha256sum >/dev/null
(
 cd "$tmp"
 sha256sum database.pgdump.age globals.sql.age > manifest.sha256
 sha256sum -c manifest.sha256 >/dev/null
)
s="$(psql "$source_url" -Atq -c "select count(*)::text||':'||sum(cents)::text||':'||md5(string_agg(title,',' order by id)) from synthetic.sales")"
t="$(psql "$restore_url" -Atq -c "select count(*)::text||':'||sum(cents)::text||':'||md5(string_agg(title,',' order by id)) from synthetic.sales")"
[[ "$s" == "$t" && "$s" == 2:3155:* ]] || {
 echo "STOP: synthetic encrypted restore data mismatch" >&2; exit 41;
}
[[ "$(psql "$restore_url" -Atq -c "select version from supabase_migrations.schema_migrations")" == "20260921100732" ]]
echo "CAFEOS_LOCAL_AGE_BACKUP_RESTORE_PASS: encrypted pg_dump + globals, isolated restore"
