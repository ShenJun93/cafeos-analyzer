#!/usr/bin/env bash
# Migration repair DRILL on disposable localhost only. Never link to staging.
set -euo pipefail
readonly DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
command -v supabase >/dev/null
command -v psql >/dev/null
command -v pg_isready >/dev/null

pg_isready -h 127.0.0.1 -p 54322 -U postgres -d postgres -q
# PostgreSQL is behind Docker port forwarding; server-side inet_server_addr()
# and inet_server_port() expose its container endpoint, not the host listener.
# The client-side DB_URL is pinned to localhost above; also verify DB identity.
[[ "$DB_URL" == "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ]]
[[ "$(psql "$DB_URL" -Atq -c "select current_database() || ':' || current_user")" == "postgres:postgres" ]]

readonly -a CANONICAL=(
  20260921005530 20260921005532 20260921100900 20260921164500
  20260921170000 20260921201000 20260921203000 20261025094352
  20261025130000 20261025140000 20261031190000
)
readonly -a HISTORICAL=(
  20260921005530 20260921005532 20260921100900 20260921164500
  20260921170000 20260921201000 20260921203000 20261025094352
)
readonly -a LEGACY=(
  20260921100732 20260921103432 20260921105352 20260921133428
  20260921141814 20260921151006 20261025103648
)

versions() {
  psql "$DB_URL" -Atq -c \
    "select coalesce(string_agg(version,',' order by version),'') from supabase_migrations.schema_migrations"
}
assert_versions() {
  local expected
  expected="$(printf '%s\n' "$@" | LC_ALL=C sort | paste -sd, -)"
  [[ "$(versions)" == "$expected" ]] || {
    echo "Wrong scratch migration versions. Expected $expected, got $(versions)" >&2
    exit 1
  }
}
schema_hash() {
  psql "$DB_URL" -Atq -c \
   "select md5(pg_get_functiondef('public.commerce_create_order(uuid,uuid,text,text,jsonb)'::regprocedure)||
     pg_get_functiondef('public.commerce_close_day(uuid,uuid,date)'::regprocedure)||
     pg_get_functiondef('public.commerce_capture_payment(uuid,uuid,text,numeric,text)'::regprocedure))"
}
data_hash() {
  psql "$DB_URL" -Atq -c \
   "select (select count(*) from public.tenants)::text||':'||
    (select count(*) from public.pos_orders)::text||':'||
    (select count(*) from public.pos_payments)::text||':'||
    (select count(*) from public.daily_closes)::text"
}

# The exact 11-version local stack also contains the Menu lifecycle.
assert_versions "${CANONICAL[@]}"
[[ "$(psql "$DB_URL" -Atq -c \
 "select position('COMMERCE_CLOSE_FUTURE_DATE' in pg_get_functiondef(
    'public.commerce_close_day(uuid,uuid,date)'::regprocedure))>0
 and position('v_snapshot_items' in pg_get_functiondef(
    'public.commerce_create_order(uuid,uuid,text,text,jsonb)'::regprocedure))>0")" == "t" ]]
before_schema="$(schema_hash)"
before_data="$(data_hash)"

# CLI repair --status applied requires a local migration file for each version.
# Create temporary no-op fixture files only in the ephemeral checked-out runner;
# they NEVER execute. Never commit them or use them for actual staging repair.
legacy_files=()
cleanup() {
  for path in "${legacy_files[@]}"; do
    rm -f -- "$path"
  done
}
trap cleanup EXIT
for version in "${LEGACY[@]}"; do
  path="supabase/migrations/${version}_synthetic_local_receipt.sql"
  [[ ! -e "$path" ]] || { echo "Refusing to overwrite a real migration: $path" >&2; exit 1; }
  printf '%s\n' '-- Local-only migration history placeholder; do not execute as schema SQL.' > "$path"
  legacy_files+=("$path")
done

# All changes below target the literal 127.0.0.1 scratch DB through --db-url.
supabase migration repair --db-url "$DB_URL" --status reverted "${CANONICAL[@]}"
assert_versions
supabase migration repair --db-url "$DB_URL" --status applied "${LEGACY[@]}"
assert_versions "${LEGACY[@]}"
[[ "$(schema_hash)" == "$before_schema" ]]
[[ "$(data_hash)" == "$before_data" ]]

# Replay proposed 7 old -> 8 canonical receipt mapping, with NO SQL execution.
supabase migration repair --db-url "$DB_URL" --status reverted "${LEGACY[@]}"
assert_versions
supabase migration repair --db-url "$DB_URL" --status applied "${HISTORICAL[@]}"
assert_versions "${HISTORICAL[@]}"

# The scratch DB *already has* SQL guards. A history-only rewrite must not
# fool the readonly staging classifier into thinking guards are unapplied.
phase="$(psql "$DB_URL" -Atq -f scripts/sql/cafeos-staging-post-repair-readonly-gate.sql | awk -F '|' '{print $NF}')"
[[ "$phase" == "STOP_REVIEW_REQUIRED" ]] || {
 echo "Classifier falsely accepted mismatched SQL body: $phase" >&2
 exit 1
}
[[ "$(schema_hash)" == "$before_schema" ]]
[[ "$(data_hash)" == "$before_data" ]]

# Restore initial 10-version local ledger and prove data/functions unchanged.
supabase migration repair --db-url "$DB_URL" --status applied 20261025130000 20261025140000 20261031190000
assert_versions "${CANONICAL[@]}"
[[ "$(schema_hash)" == "$before_schema" ]]
[[ "$(data_hash)" == "$before_data" ]]
echo "CAFEOS_LOCAL_LEDGER_REPAIR_DRILL_PASS old=7 historical=8 canonical=11"
