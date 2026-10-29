#!/usr/bin/env bash
# CafeOS staging SOURCE-ONLY validation. SELECT only; no DB dumps or mutations.
# Explicit transaction READ ONLY is essential: session poolers can ignore
# PGOPTIONS=default_transaction_read_only=on. Never print any credential.
set -euo pipefail
umask 077

[[ "$(id -u)" != 0 ]] || { echo 'STOP_ROOT'; exit 12; }
readonly STAGING_REF='wjatnyvdygvblirggdcm'
readonly expected_fp='fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3'
readonly expected_ca='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
readonly cfg="$HOME/.config/cafeos-staging"
readonly passfile="$cfg/pgpass"
readonly ca="$cfg/db-root-ca.crt"
readonly prefix='/mnt/e/Projects/CafeOS-Evidence/portable-backup-cli-20261026/prefix'
readonly psql="$prefix/usr/lib/postgresql/18/bin/psql"
readonly script_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly receipt_sql="$script_root/sql/cafeos-staging-receipt-fingerprint.sql"

[[ -d "$cfg" && ! -L "$cfg" && "$(stat -c '%a' "$cfg")" == '700' ]] || {
  echo 'STOP_STAGING_CONFIG_DIRECTORY'; exit 12;
}
for file in "$passfile" "$ca"; do
  [[ -f "$file" && ! -L "$file" && "$(stat -c '%a' "$file")" == '600' ]] || {
    echo 'STOP_PROTECTED_STAGING_FILE'; exit 12;
  }
done
[[ "$(sha256sum "$ca" | cut -d' ' -f1)" == "$expected_ca" ]] || {
  echo 'STOP_STAGING_CA_HASH_MISMATCH'; exit 12;
}
[[ -x "$psql" && -f "$receipt_sql" ]] || {
  echo 'STOP_PSQL_OR_RECEIPT_SQL_MISSING'; exit 12;
}

export PATH="$prefix/usr/lib/postgresql/18/bin:$prefix/usr/bin:/usr/bin:/bin"
export LD_LIBRARY_PATH="$prefix/usr/lib/x86_64-linux-gnu"
export PGHOST='aws-0-ap-southeast-1.pooler.supabase.com'
export PGUSER="postgres.$STAGING_REF"
export PGPORT=5432 PGDATABASE=postgres
export PGSSLMODE=verify-full PGSSLROOTCERT="$ca"
export PGPASSFILE="$passfile" PGCONNECT_TIMEOUT=8
unset PGOPTIONS PGPASSWORD PGSERVICE PGHOSTADDR || true

# Read-only transaction, bounded connection, no SQL result other than one boolean.
if ! identity_result="$(timeout 20 "$psql" -XwqAt -v ON_ERROR_STOP=1 \
  -c "BEGIN TRANSACTION READ ONLY; SELECT (current_database()='postgres' AND current_setting('transaction_read_only')='on')::text; COMMIT;" 2>/dev/null)"; then
  echo 'STOP_STAGING_AUTH_OR_TLS_FAILED'; exit 13;
fi
[[ "$identity_result" == 'true' ]] || { echo 'STOP_SOURCE_IDENTITY_UNEXPECTED'; exit 13; }
echo 'CAFEOS_STAGING_SOURCE_VERIFYFULL_READONLY_PASS'

# Compare SQL text in all seven original migration receipts, not versions alone.
# The SQL file itself is a single SELECT; execute it inside a fresh explicit
# READ ONLY transaction rather than relying on session pooler startup options.
if ! live_fp="$( {
    printf 'BEGIN TRANSACTION READ ONLY;\n'
    cat -- "$receipt_sql"
    printf '\nCOMMIT;\n'
  } | timeout 20 "$psql" -XwqAt -v ON_ERROR_STOP=1 2>/dev/null )"; then
  echo 'STOP_STAGING_RECEIPT_QUERY_FAILED'; exit 13;
fi
[[ "$live_fp" == "$expected_fp" ]] || {
  echo 'STOP_STAGING_RECEIPT_DRIFT'; exit 13;
}
echo 'CAFEOS_STAGING_SEVEN_ORIGINAL_RECEIPTS_PASS'
echo 'CAFEOS_STAGING_SOURCE_READONLY_READY_EXPORT_AND_RESTORE_NOT_AUTHORIZED'
