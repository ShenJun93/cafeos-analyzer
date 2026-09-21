#!/usr/bin/env bash
set -euo pipefail

readonly DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
readonly RECOVERED_POINT="2026-09-21T10:00:00Z"

command -v supabase >/dev/null
command -v psql >/dev/null

dump_help="$(supabase db dump --help)"
for flag in --db-url --data-only --role-only --use-copy --schema; do
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

now_ms() {
  date +%s%3N
}

dump_started="$(now_ms)"
echo "Creating Supabase logical recovery bundle..."
supabase db dump --db-url "$DB_URL" -f "$bundle_dir/roles.sql" --role-only
supabase db dump --db-url "$DB_URL" -f "$bundle_dir/schema.sql"
supabase db dump --db-url "$DB_URL" -f "$bundle_dir/data.sql" --use-copy --data-only --schema public
dump_ms="$(( $(now_ms) - dump_started ))"

for file in roles.sql schema.sql data.sql; do
  test -s "$bundle_dir/$file"
done

grep -q "daily_brief_aggregate" "$bundle_dir/schema.sql"
grep -q "71000000-0000-4000-8000-000000000001" "$bundle_dir/data.sql"
grep -q "72000000-0000-4000-8000-000000000002" "$bundle_dir/data.sql"

recovery_started="$(now_ms)"
echo "Resetting isolated local target to canonical migrations..."
supabase db reset

restore_started="$(now_ms)"
echo "Restoring synthetic logical data..."
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' \
  --file "$bundle_dir/data.sql" \
  --dbname "$DB_URL"
restore_sql_ms="$(( $(now_ms) - restore_started ))"

echo "Verifying recovered point, metrics and tenant isolation..."
psql "$DB_URL" --variable ON_ERROR_STOP=1 --file supabase/restore-fixtures/verify.sql
recovery_ms="$(( $(now_ms) - recovery_started ))"

echo "RESTORE_DRILL_PASS recovered_point=$RECOVERED_POINT dump_ms=$dump_ms restore_sql_ms=$restore_sql_ms recovery_ms=$recovery_ms"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    printf '%s\n' '### CafeOS synthetic restore drill'
    printf '%s\n' '- Result: PASS'
    printf '%s\n' "- Recovered point: $RECOVERED_POINT"
    printf '%s\n' '- Logical bundle: roles + schema + data'
    printf '%s\n' "- Dump time: ${dump_ms}ms"
    printf '%s\n' "- Data restore SQL time: ${restore_sql_ms}ms"
    printf '%s\n' "- Reset + restore + verification: ${recovery_ms}ms"
    printf '%s\n' '- Target: ephemeral local Supabase only (127.0.0.1:54322)'
  } >> "$GITHUB_STEP_SUMMARY"
fi
