#!/usr/bin/env bash
# LOCAL-ONLY, EXPECTED TO FAIL until CLI enforces remote verify-full.
# This intentionally never connects to any real or staging database.
set -euo pipefail
umask 077

readonly cli="$HOME/.local/share/cafeos-tools/supabase-2.122.0/supabase"
readonly local_root="$HOME/.local/share/cafeos-cleanroom-20261029"
readonly container='supabase_db_cafeos-cleanroom-20261029'
readonly local_url='postgresql://postgres@127.0.0.1:54322/postgres'

[[ -x "$cli" && -f "$local_root/supabase/config.toml" ]] || {
  echo 'STOP_LOCAL_CLI_OR_CLEANROOM_MISSING'; exit 12;
}
[[ "$("$cli" --version)" == '2.122.0' ]] || {
  echo 'STOP_CLI_VERSION_NOT_PINNED'; exit 12;
}
docker ps --format '{{.Names}}' | grep -Fxq "$container" || {
  echo 'STOP_LOCAL_CONTAINER_NOT_RUNNING'; exit 12;
}
[[ "$(docker exec "$container" psql -X -U postgres -d postgres -Atq \
  -c 'select count(*) from auth.users')" == 0 ]] || {
  echo 'STOP_LOCAL_AUTH_NOT_EMPTY'; exit 12;
}

work="$(mktemp -d "$HOME/.local/share/.cafeos-cli-tls-negative-XXXXXXXX")"
[[ "$(stat -c '%a' "$work")" == 700 ]] || exit 12
cleanup() {
  rm -f -- "$work/local.pgpass" "$work/invalid-ca.crt"
  rmdir -- "$work" || true
}
trap cleanup EXIT
# Only the public default password from the disposable LOCAL Supabase stack.
printf '%s\n' '127.0.0.1:54322:postgres:postgres:postgres' > "$work/local.pgpass"
printf '%s\n' 'NOT_A_TRUSTED_ROOT_CA' > "$work/invalid-ca.crt"
chmod 600 "$work/local.pgpass" "$work/invalid-ca.crt"
export PGPASSFILE="$work/local.pgpass" PGCONNECT_TIMEOUT=8
unset PGPASSWORD PGHOST PGHOSTADDR PGUSER PGPORT PGDATABASE \
  PGSERVICE PGSERVICEFILE PGSSLCERT PGSSLKEY || true
cd "$local_root"

# Positive control: 0600 PGPASSFILE works without embedding a password in URL.
export PGSSLMODE=disable
unset PGSSLROOTCERT || true
if ! (set -o pipefail; "$cli" db dump --db-url "$local_url" \
  --schema public 2>/dev/null | sha256sum >/dev/null); then
  echo 'STOP_LOCAL_PGPASSFILE_BASELINE_FAILED'; exit 13;
fi
echo 'CAFEOS_LOCAL_CLI_PASSWORDLESS_URL_PGPASSFILE_PASS'

# Negative control: psql must refuse a fake CA (proves the fixture is invalid).
export PGSSLMODE=verify-full PGSSLROOTCERT="$work/invalid-ca.crt"
if psql "$local_url" -XwAtq -c 'select 1' >/dev/null 2>/dev/null; then
  echo 'STOP_PSQL_ACCEPTED_BAD_CA'; exit 13;
fi
echo 'CAFEOS_LOCAL_PSQL_BAD_CA_REJECTED'

# Security acceptance: the CLI must ALSO reject a nonexistent CA with a
# verify-full URL. The credential is resolved solely from the local PGPASSFILE.
readonly tls_url="$local_url?sslmode=verify-full&sslrootcert=$work/invalid-ca.crt"
if "$cli" db dump --db-url "$tls_url" --schema public \
  >/dev/null 2>/dev/null; then
  echo 'STOP_CAFEOS_CLI_VERIFYFULL_BAD_CA_ACCEPTED'; exit 42;
fi
echo 'CAFEOS_LOCAL_CLI_VERIFYFULL_BAD_CA_REJECTED'
echo 'CAFEOS_CLI_TLS_NEGATIVE_LOCAL_PROBE_PASS_STAGING_NOT_AUTHORIZED'
