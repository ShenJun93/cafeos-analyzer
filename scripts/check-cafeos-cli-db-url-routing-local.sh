#!/usr/bin/env bash
# MAIN-PC ONLY. Local diagnostic distinguishes --db-url managed-stack route
# from remote route using the SAME disposable SSL-disabled DB. No staging.
set -euo pipefail
umask 077
readonly cli="$HOME/.local/share/cafeos-tools/supabase-2.122.0/supabase"
readonly root="$HOME/.local/share/cafeos-cleanroom-20261029"
readonly container='supabase_db_cafeos-cleanroom-20261029'
[[ -x "$cli" && "$("$cli" --version)" == '2.122.0' ]] || {
  echo 'STOP_PINNED_LOCAL_CLI'; exit 12;
}
[[ -f "$root/supabase/config.toml" ]] || {
  echo 'STOP_EXACT_CLEANROOM_NOT_FOUND'; exit 12;
}
docker ps --format '{{.Names}}' | grep -Fxq "$container" || {
  echo 'STOP_LOCAL_CONTAINER_ABSENT'; exit 12;
}
[[ "$(docker exec "$container" psql -X -U postgres -d postgres -Atq -c 'show ssl')" == 'off' ]] || {
  echo 'STOP_EXPECTED_SSL_DISABLED_FIXTURE'; exit 12;
}
[[ "$(docker exec "$container" psql -X -U postgres -d postgres -Atq -c 'select count(*) from auth.users')" == '0' ]] || {
  echo 'STOP_NONEMPTY_AUTH_FIXTURE'; exit 12;
}
work="$(mktemp -d "$HOME/.local/share/.cafeos-route-tls-XXXXXXXX")"
[[ "$(stat -c '%a' "$work")" == '700' ]] || exit 12
trap 'rm -rf -- "$work"' EXIT
printf '%s\n' 'localhost:54322:postgres:postgres:postgres' \
                '127.0.0.1:54322:postgres:postgres:postgres' > "$work/pgpass"
chmod 600 "$work/pgpass"
export PGPASSFILE="$work/pgpass" PGCONNECT_TIMEOUT=8
unset PGPASSWORD PGHOST PGHOSTADDR PGUSER PGPORT PGDATABASE \
  PGSERVICE PGSERVICEFILE PGSSLMODE PGSSLROOTCERT || true
cd "$root"
check() {
  local host="$1" mode="$2" result code url
  url="postgresql://postgres@$host:54322/postgres?sslmode=$mode"
  set +e
  result="$(set -o pipefail; "$cli" db dump --db-url "$url" --schema public 2>"$work/err" | wc -c)"
  code=$?
  set -e
  if [[ "$host" == 'localhost' && "$mode" != 'disable' ]]; then
    if [[ "$code" == 0 || "$result" != 0 ]]; then
      echo "STOP_REMOTE_PATH_FAILED_TO_REQUIRE_TLS_$mode"; exit 42;
    fi
    echo "CAFEOS_REMOTE_PATH_REJECTS_SSL_OFF_$mode"
  else
    if [[ "$code" != 0 || "$result" -le 0 ]]; then
      echo "STOP_LOCAL_CONTROL_FAILED_$host:$mode"; exit 14;
    fi
    echo "CAFEOS_LOCAL_PATH_SUCCESS_$host:$mode"
  fi
}
check '127.0.0.1' 'verify-full'
check 'localhost' 'disable'
check 'localhost' 'require'
check 'localhost' 'verify-ca'
check 'localhost' 'verify-full'
echo 'CAFEOS_CLI_2_122_0_LOCAL_REMOTE_TLS_ROUTE_PASS'
echo 'SYNTHETIC_ONLY_STAGING_NOT_ACCESSED'
