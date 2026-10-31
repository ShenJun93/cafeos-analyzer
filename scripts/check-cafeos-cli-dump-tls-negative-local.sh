#!/usr/bin/env bash
# Ephemeral TLS-enabled postgres:17-alpine fixture. NEVER connects to staging.
set -euo pipefail
umask 077
readonly name='cafeos-tls-fixture-20261029'
readonly port=55433
readonly cli="$HOME/.local/share/cafeos-tools/supabase-2.122.0/supabase"
readonly cleanroom="$HOME/.local/share/cafeos-cleanroom-20261029"
readonly base="postgresql://postgres@127.0.0.1:$port/postgres"
readonly pgpass_line="127.0.0.1:$port:postgres:postgres:cafeos-fixture-only"

[[ -x "$cli" && "$("$cli" --version)" == '2.122.0' ]] || {
  echo 'STOP: pinned CLI absent'; exit 12;
}
[[ -f "$cleanroom/supabase/config.toml" ]] || { echo 'STOP: local project missing'; exit 12; }
[[ "$(docker ps -aq --filter "name=^/$name$" | wc -l)" == 0 ]] || { echo 'STOP: fixture container already exists'; exit 12; }
if ss -ltn | grep -Eq '[:.]55433[[:space:]]'; then echo 'STOP: fixture port busy'; exit 12; fi
readonly prefix='/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix'
export PATH="$prefix/usr/lib/postgresql/18/bin:$prefix/usr/bin:/usr/local/bin:/usr/bin:/bin"
export LD_LIBRARY_PATH="$prefix/usr/lib/x86_64-linux-gnu"
command -v psql >/dev/null
work="$(mktemp -d "$HOME/.local/share/.cafeos-tls-real-XXXXXXXX")"
[[ "$(stat -c %a "$work")" == 700 ]] || exit 12
created=0
cleanup() {
  if [[ "$created" == 1 ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || echo 'WARN: fixture Docker cleanup failed'
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$work/valid-ca.key" -out "$work/valid-ca.crt" \
  -days 1 -sha256 -subj '/CN=CafeOS isolated local TLS CA' \
  -addext 'basicConstraints=critical,CA:TRUE' >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes \
  -keyout "$work/server.key" -out "$work/server.csr" \
  -subj '/CN=localhost' >/dev/null 2>&1
printf '%s\n' 'subjectAltName=DNS:localhost,IP:127.0.0.1' 'extendedKeyUsage=serverAuth' > "$work/server.ext"
openssl x509 -req -in "$work/server.csr" \
  -CA "$work/valid-ca.crt" -CAkey "$work/valid-ca.key" -CAcreateserial \
  -days 1 -sha256 -out "$work/server.crt" -extfile "$work/server.ext" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$work/wrong-ca.key" -out "$work/wrong-ca.crt" \
  -days 1 -sha256 -subj '/CN=CafeOS wrong local TLS CA' \
  -addext 'basicConstraints=critical,CA:TRUE' >/dev/null 2>&1
printf '%s\n' "$pgpass_line" > "$work/pgpass"
chmod 600 "$work/pgpass" "$work/server.key" "$work/valid-ca.key" "$work/wrong-ca.key"
echo 'CAFEOS_TEST_ONLY_CA_GENERATED'

# Separate disposable Postgres server; no existing app container changed.
docker run -d --name "$name" \
  --publish "127.0.0.1:$port:5432" \
  --env 'POSTGRES_PASSWORD=cafeos-fixture-only' \
  --env 'POSTGRES_DB=postgres' \
  postgres:17-alpine >/dev/null
created=1
for attempt in $(seq 1 40); do
  if docker exec "$name" pg_isready -U postgres -d postgres -q >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$name" pg_isready -U postgres -d postgres -q >/dev/null
docker cp "$work/server.crt" "$name:/var/lib/postgresql/server.crt"
docker cp "$work/server.key" "$name:/var/lib/postgresql/server.key"
docker exec -u root "$name" sh -c \
  'chown postgres:postgres /var/lib/postgresql/server.crt /var/lib/postgresql/server.key && chmod 0644 /var/lib/postgresql/server.crt && chmod 0600 /var/lib/postgresql/server.key'
docker exec "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "ALTER SYSTEM SET ssl = 'on'"
docker exec "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "ALTER SYSTEM SET ssl_cert_file = '/var/lib/postgresql/server.crt'"
docker exec "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "ALTER SYSTEM SET ssl_key_file = '/var/lib/postgresql/server.key'"
docker exec -u root "$name" sh -c \
 'sed -i "1i hostnossl all all 0.0.0.0/0 reject" "$PGDATA/pg_hba.conf"'
docker restart "$name" >/dev/null
for attempt in $(seq 1 40); do
  if docker exec "$name" pg_isready -U postgres -d postgres -q >/dev/null 2>&1; then break; fi
  sleep 1
done
[[ "$(docker exec "$name" psql -X -U postgres -d postgres -Atq -c 'show ssl')" == on ]] || {
  echo 'STOP: TLS not enabled'; exit 13;
}
echo 'CAFEOS_LOCAL_SERVER_SSL_ON'

export PGPASSFILE="$work/pgpass" PGCONNECT_TIMEOUT=8
unset PGPASSWORD PGHOST PGHOSTADDR PGUSER PGPORT PGDATABASE PGSERVICE PGSERVICEFILE PGSSLROOTCERT PGSSLMODE || true
cd "$cleanroom"
# Plaintext is disabled for this fixture's host TCP connections.
if PGSSLMODE=disable psql "$base" -XwAtq -c 'select 1' >/dev/null 2>/dev/null; then
  echo 'STOP: server accepted no-TLS path'; exit 13;
fi
echo 'CAFEOS_LOCAL_SERVER_PLAINTEXT_REJECTED'
# The valid CA must work with verify-full and expose an actual encrypted backend.
if ! PGSSLMODE=verify-full PGSSLROOTCERT="$work/valid-ca.crt" \
  psql "$base" -XwAtq -c 'select ssl from pg_stat_ssl where pid=pg_backend_pid()' 2>/dev/null |
  grep -Fxq t; then
  echo 'STOP: psql correct CA verify-full failed'; exit 13;
fi
echo 'CAFEOS_PSQL_GOOD_CA_VERIFYFULL_PASS'
if PGSSLMODE=verify-full PGSSLROOTCERT="$work/wrong-ca.crt" \
  psql "$base" -XwAtq -c 'select 1' >/dev/null 2>/dev/null; then
  echo 'STOP: psql accepted wrong CA'; exit 13;
fi
echo 'CAFEOS_PSQL_BAD_CA_REJECTED'

# Re-test pinned CLI using an SSL-REQUIRED local PostgreSQL server.
good="$base?sslmode=verify-full&sslrootcert=$work/valid-ca.crt"
bad="$base?sslmode=verify-full&sslrootcert=$work/wrong-ca.crt"
if (set -o pipefail; "$cli" db dump --db-url "$good" --schema public 2>/dev/null | sha256sum >/dev/null); then
  echo 'CAFEOS_CLI_GOOD_CA_ACCEPTED'
else
  echo 'CAFEOS_CLI_GOOD_CA_REJECTED'
fi
if (set -o pipefail; "$cli" db dump --db-url "$bad" --schema public 2>/dev/null | sha256sum >/dev/null); then
  echo 'STOP_CAFEOS_CLI_BAD_CA_ACCEPTED_ON_TLS_SERVER'
  exit 42
fi
echo 'CAFEOS_CLI_BAD_CA_REJECTED_ON_TLS_SERVER'
# Additional verifier: no-SSL must fail against a server rejecting non-TLS.
if "$cli" db dump --db-url "$base?sslmode=disable" --schema public >/dev/null 2>/dev/null; then
  echo 'STOP_CAFEOS_CLI_SSL_DISABLE_ACCEPTED_ON_TLS_SERVER'
  exit 42
fi
echo 'CAFEOS_CLI_SSL_DISABLE_REJECTED_ON_TLS_SERVER'
echo 'CAFEOS_LOCAL_TLS_CERT_TEST_PASS_ONLY_SYNTHETIC'
echo 'NO_STAGING_SOURCE_ACCESSED'
