#!/usr/bin/env bash
# GitHub Actions disposable local Supabase only. Same SSL-off DB under
# managed-local vs remote host alias. No staging or merchant records.
set -euo pipefail
umask 077
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]] || {
  echo 'STOP_GITHUB_ACTIONS_ONLY' >&2; exit 42;
}
[[ -f .github/workflows/cafeos-cli-tls-routing.yml ]] || {
  echo 'STOP_WRONG_CHECKOUT' >&2; exit 42;
}
[[ "$(supabase --version)" == 2.122.0 ]] || {
  echo 'STOP_UNPINNED_CLI' >&2; exit 42;
}
db_names="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' || true)"
[[ "$(printf '%s\n' "$db_names" | grep -c '^supabase_db_' || true)" == 1 ]] || {
  echo 'STOP_UNEXPECTED_LOCAL_DB_CONTAINER' >&2; exit 42;
}
[[ "$(docker exec "$db_names" psql -X -U postgres -d postgres -Atq -c 'show ssl')" == off ]] || {
  echo 'STOP_EXPECTED_SSL_OFF_LOCAL_DB' >&2; exit 42;
}
[[ "$(docker exec "$db_names" psql -X -U postgres -d postgres -Atq -c 'select count(*) from auth.users')" == 0 ]] || {
  echo 'STOP_NONEMPTY_LOCAL_AUTH' >&2; exit 42;
}

work="$(mktemp -d)"
[[ "$(stat -c %a "$work")" == 700 ]] || exit 42
trap 'rm -rf -- "$work"' EXIT
printf '%s\n' 'localhost:54322:postgres:postgres:postgres' \
                '127.0.0.1:54322:postgres:postgres:postgres' > "$work/pgpass"
chmod 600 "$work/pgpass"
export PGPASSFILE="$work/pgpass" PGCONNECT_TIMEOUT=8
unset PGPASSWORD PGHOST PGHOSTADDR PGUSER PGPORT PGDATABASE \
  PGSERVICE PGSERVICEFILE PGSSLMODE PGSSLROOTCERT || true

probe() {
  local host="$1" mode="$2" url bytes code
  url="postgresql://postgres@$host:54322/postgres?sslmode=$mode"
  set +e
  bytes="$(set -o pipefail; supabase db dump --db-url "$url" --schema public \
    2>"$work/error" | wc -c)"
  code=$?
  set -e
  if [[ "$host" == localhost && "$mode" != disable ]]; then
    [[ "$code" != 0 && "$bytes" == 0 ]] || {
      echo "STOP_REMOTE_TLS_DOWNGRADE_$mode" >&2; exit 42;
    }
    grep -q 'Dumping schemas from remote database' "$work/error" || {
      echo "STOP_NOT_REMOTE_ROUTE_$mode" >&2; exit 42;
    }
    echo "CAFEOS_REMOTE_TLS_STRICT_SSL_OFF_REJECTED_$mode"
  else
    [[ "$code" == 0 && "$bytes" -gt 0 ]] || {
      echo "STOP_CONTROL_FAILED_$host:$mode" >&2; exit 42;
    }
    echo "CAFEOS_LOCAL_CONTROL_SUCCESS_$host:$mode"
  fi
}
probe 127.0.0.1 verify-full
probe localhost disable
probe localhost require
probe localhost verify-ca
probe localhost verify-full
echo 'CAFEOS_CLI_2_122_0_ROUTE_TLS_CI_PASS'
echo 'LOCAL_DISPOSABLE_ONLY_STAGING_NOT_ACCESSED'
