#!/usr/bin/env bash
set -euo pipefail

readonly DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
readonly RECOVERED_POINT="2026-09-21T10:00:00Z"

command -v supabase >/dev/null
command -v psql >/dev/null

dump_help="$(supabase db dump --help)"
for flag in --db-url --data-only --role-only --use-copy; do
  if ! grep -q -- "$flag" <<<"$dump_help"; then
    echo "Required Supabase CLI dump flag is unavailable: $flag" >&2
    exit 1
  fi
done

bundle_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$bundle_dir"
}
trap cleanup EXIT

echo "Seeding synthetic recovery fixture..."
psql "$DB_URL" --variable ON_ERROR_STOP=1 --file supabase/restore-fixtures/seed.sql

dump_started="$(date +%s)"
echo "Creating Supabase logical recovery bundle..."
supabase db dump --db-url "$DB_URL" -f "$bundle_dir/roles.sql" --role-only
supabase db dump --db-url "$DB_URL" -f "$bundle_dir/schema.sql"
supabase db dump --db-url "$DB_URL" -f "$bundle_dir/data.sql" --use-copy --data-only
dump_seconds="$(( $(date +%s) - dump_started ))"

for file in roles.sql schema.sql data.sql; do
  test -s "$bundle_dir/$file"
done

grep -q "daily_brief_aggregate" "$bundle_dir/schema.sql"
grep -q "71000000-0000-4000-8000-000000000001" "$bundle_dir/data.sql"
grep -q "72000000-0000-4000-8000-000000000002" "$bundle_dir/data.sql"

recovery_started="$(date +%s)"
echo "Resetting isolated local target to canonical migrations..."
supabase db reset

restore_started="$(date +%s)"
echo "Restoring synthetic logical data..."
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' \
  --file "$bundle_dir/data.sql" \
  --dbname "$DB_URL"
restore_sql_seconds="$(( $(date +%s) - restore_started ))"

echo "Verifying recovered point, metrics and tenant isolation..."
psql "$DB_URL" --variable ON_ERROR_STOP=1 --file supabase/restore-fixtures/verify.sql
recovery_seconds="$(( $(date +%s) - recovery_started ))"

echo "RESTORE_DRILL_PASS recovered_point=$RECOVERED_POINT dump_seconds=$dump_seconds restore_sql_seconds=$restore_sql_seconds recovery_seconds=$recovery_seconds"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### CafeOS synthetic restore drill"
    echo "- Result: PASS"
    echo "- Recovered point: `$RECOVERED_POINT`"
    echo "- Logical bundle: roles + schema + data"
    echo "- Dump time: `${dump_seconds}s`"
    echo "- Data restore SQL time: `${restore_sql_seconds}s`"
    echo "- Reset + restore + verification: `${recovery_seconds}s`"
    echo "- Target: ephemeral local Supabase only (`127.0.0.1:54322`)"
  } >> "$GITHUB_STEP_SUMMARY"
fi
