#!/usr/bin/env bash
# Expected FAIL for CLI 2.122.0 until it rejects SSL-off PostgreSQL under
# sslmode=require / verify-ca / verify-full. NEVER connects to staging.
set -euo pipefail
umask 077
readonly cli="$HOME/.local/share/cafeos-tools/supabase-2.122.0/supabase"
readonly cleanroom="$HOME/.local/share/cafeos-cleanroom-20261029"
readonly db='supabase_db_cafeos-cleanroom-20261029'
readonly base='postgresql://postgres@127.0.0.1:54322/postgres'
readonly prefix='/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix'
export PATH="$prefix/usr/lib/postgresql/18/bin:$prefix/usr/bin:/usr/bin:/bin"
export LD_LIBRARY_PATH="$prefix/usr/lib/x86_64-linux-gnu"

[[ -x "$cli" && "$("$cli" --version)" == '2.122.0' ]] || {
  echo STOP_PINNED_LOCAL_CLI_MISSING; exit 12;
}
[[ -f "$cleanroom/supabase/config.toml" ]] || {
  echo STOP_EXACT_CLEANROOM_ABSENT; exit 12;
}
docker ps --format '{{.Names}}' | grep -Fxq "$db" || {
  echo STOP_EXACT_LOCAL_CONTAINER_MISSING; exit 12;
}
[[ "$(docker exec "$db" psql -X -U postgres -d postgres -Atq -c 'show ssl')" == 'off' ]] || {
  echo STOP_EXPECTED_SSL_OFF_FIXTURE; exit 12;
}
[[ "$(docker exec "$db" psql -X -U postgres -d postgres -Atq -c 'select count(*) from auth.users')" == 0 ]] || {
  echo STOP_REAL_AUTH_ROWS_IN_FIXTURE; exit 12;
}
work="$(mktemp -d "$HOME/.local/share/.cafeos-ssl-downgrade-XXXXXXXX")"
[[ "$(stat -c '%a' "$work")" == '700' ]] || exit 12
trap 'rm -rf -- "$work"' EXIT
printf '%s\n' '127.0.0.1:54322:postgres:postgres:postgres' > "$work/local.pgpass"
chmod 600 "$work/local.pgpass"
export PGPASSFILE="$work/local.pgpass" PGCONNECT_TIMEOUT=8
unset PGPASSWORD PGHOST PGHOSTADDR PGUSER PGPORT PGDATABASE \
  PGSERVICE PGSERVICEFILE PGSSLMODE PGSSLROOTCERT || true
cd "$cleanroom"

failed=0
for mode in require verify-ca verify-full; do
  url="$base?sslmode=$mode"

  # Baseline libpq client must refuse all TLS-mandatory modes on SSL-off DB.
  if psql "$url" -XwAtq -c 'select 1' >/dev/null 2>/dev/null; then
    echo "STOP_PSQL_SSL_OFF_CONTROL_INVALID_$mode"; exit 13;
  fi
  echo "CAFEOS_PSQL_SSL_OFF_REJECTED_$mode"

  # Suppress *all SQL output*; verify CLI exit rather than the pipeline's
  # wc/sha exit, with no --dry-run or staging credentials.
  if "$cli" db dump --db-url "$url" --schema public >/dev/null 2>/dev/null; then
    echo "STOP_CAFEOS_CLI_SSL_OFF_DOWNGRADE_$mode"
    failed=1
  else
    echo "CAFEOS_CLI_SSL_OFF_REJECTED_$mode"
  fi
done
if [[ "$failed" != 0 ]]; then
  echo 'STOP_CAFEOS_CLI_TLS_DOWNGRADE_GATE_FAILED'
  exit 42
fi
echo 'CAFEOS_CLI_TLS_NO_DOWNGRADE_LOCAL_GATE_PASS'
echo 'SYNTHETIC_LOCAL_ONLY_STAGING_NOT_AUTHORIZED'
