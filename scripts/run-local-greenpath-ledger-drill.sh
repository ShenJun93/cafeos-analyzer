#!/usr/bin/env bash
# Disposable localhost Supabase only. Never target a cloud project.
set -euo pipefail
readonly DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
readonly HISTORICAL_LAST="20261025094352"
readonly -a HISTORICAL=(20260921005530 20260921005532 20260921100900 20260921164500 20260921170000 20260921201000 20260921203000 20261025094352)
readonly -a LEGACY=(20260921100732 20260921103432 20260921105352 20260921133428 20260921141814 20260921151006 20261025103648)
readonly -a FULL=( "${HISTORICAL[@]}" 20261025130000 20261025140000 )
command -v supabase >/dev/null
command -v psql >/dev/null
command -v pg_isready >/dev/null
[[ "$DB_URL" == "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ]]
pg_isready -h 127.0.0.1 -p 54322 -U postgres -d postgres -q
[[ "$(psql "$DB_URL" -Atq -c "select current_database() || ':' || current_user")" == "postgres:postgres" ]]

versions() {
  psql "$DB_URL" -Atq -c "select coalesce(string_agg(version,',' order by version),'') from supabase_migrations.schema_migrations"
}
assert_versions() {
  local expected
  expected="$(printf '%s\n' "$@" | LC_ALL=C sort | paste -sd, -)"
  [[ "$(versions)" == "$expected" ]] || { echo "Unexpected local ledger: $(versions)" >&2; exit 1; }
}
guards_present() {
  psql "$DB_URL" -Atq -c "select position('COMMERCE_CLOSE_FUTURE_DATE' in pg_get_functiondef('public.commerce_close_day(uuid,uuid,date)'::regprocedure))>0 and position('v_snapshot_items' in pg_get_functiondef('public.commerce_create_order(uuid,uuid,text,text,jsonb)'::regprocedure))>0"
}
phase() {
  psql "$DB_URL" -Atq -f scripts/sql/cafeos-staging-post-repair-readonly-gate.sql | awk -F '|' 'NF { print $NF }' | tail -n 1
}
post_guard_phase() {
  psql "$DB_URL" -Atq -f scripts/sql/cafeos-staging-post-guards-readonly-gate.sql | awk -F '|' 'NF { print $NF }' | tail -n 1
}
fingerprint() {
  psql "$DB_URL" -Atq -c "select md5(pg_get_functiondef('public.commerce_create_order(uuid,uuid,text,text,jsonb)'::regprocedure) || pg_get_functiondef('public.commerce_close_day(uuid,uuid,date)'::regprocedure) || pg_get_functiondef('public.commerce_capture_payment(uuid,uuid,text,numeric,text)'::regprocedure) || (select count(*)::text from public.tenants) || (select count(*)::text from public.pos_orders))"
}

# Discard only the CI-local stack; reapply exactly eight canonical migrations.
supabase db reset --local --no-seed --version "$HISTORICAL_LAST"
assert_versions "${HISTORICAL[@]}"
[[ "$(guards_present)" == "f" ]]
[[ "$(phase)" == "HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL" ]]
[[ "$(post_guard_phase)" == "POST_GUARDS_NOT_READY_REVIEW" ]]
baseline="$(fingerprint)"

# Old-version placeholders live ONLY in the disposable runner checkout.
legacy_files=()
cleanup() {
  for file in "${legacy_files[@]}"; do
    rm -f -- "$file"
  done
}
trap cleanup EXIT
for version in "${LEGACY[@]}"; do
  file="supabase/migrations/${version}_local_greenpath_placeholder.sql"
  [[ ! -e "$file" ]] || { echo "Refusing to overwrite $file" >&2; exit 1; }
  printf '%s\n' '-- Synthetic receipt only; never execute.' > "$file"
  legacy_files+=("$file")
done
supabase migration repair --db-url "$DB_URL" --status reverted "${HISTORICAL[@]}"
assert_versions
supabase migration repair --db-url "$DB_URL" --status applied "${LEGACY[@]}"
assert_versions "${LEGACY[@]}"
[[ "$(phase)" == "PRE_REPAIR_NO_GO" ]]
[[ "$(fingerprint)" == "$baseline" ]]

supabase migration repair --db-url "$DB_URL" --status reverted "${LEGACY[@]}"
assert_versions
supabase migration repair --db-url "$DB_URL" --status applied "${HISTORICAL[@]}"
assert_versions "${HISTORICAL[@]}"
[[ "$(phase)" == "HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL" ]]
[[ "$(fingerprint)" == "$baseline" ]]

cleanup
legacy_files=()
supabase migration up --db-url "$DB_URL"
assert_versions "${FULL[@]}"
[[ "$(guards_present)" == "t" ]]
[[ "$(phase)" == "STOP_REVIEW_REQUIRED" ]]
[[ "$(post_guard_phase)" == "POST_GUARDS_READY_FOR_AUTH_E2E" ]]
negative_phase="$(psql "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 \
  -f scripts/sql/cafeos-local-postguards-negative-fixture.sql | awk -F '|' 'NF { print $NF }' | tail -n 1)"
[[ "$negative_phase" == "POST_GUARDS_NOT_READY_REVIEW" ]] || {
  echo "Financial audit did not reject intentionally inconsistent Order: $negative_phase" >&2
  exit 1
}
[[ "$(post_guard_phase)" == "POST_GUARDS_READY_FOR_AUTH_E2E" ]]
supabase test db
[[ "$(post_guard_phase)" == "POST_GUARDS_READY_FOR_AUTH_E2E" ]]
echo "CAFEOS_LOCAL_GREENPATH_PASS: pre=8 legacy=7 reconciled=8 guarded=10"
