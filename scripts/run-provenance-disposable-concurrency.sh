#!/usr/bin/env bash
# Disposable PostgreSQL only: two real psql sessions race to append the same
# binding revision using a least-privilege synthetic worker role.
set -euo pipefail

if [[ "${PGHOST:-}" != "127.0.0.1" || "${PGDATABASE:-}" != "cafeos_provenance_preflight" ||
      "${PGUSER:-}" != "postgres" || "${PGPORT:-}" != "5432" ]]; then
  echo "STOP: expected isolated GitHub localhost preflight database" >&2
  exit 3
fi
if [[ "$(psql -X -Atqc 'select current_database()')" != "cafeos_provenance_preflight" ]]; then
  echo "STOP: connected to wrong database" >&2
  exit 3
fi
tmp="$(mktemp -d)"
first_pid=""
cleanup() {
  if [[ -n "$first_pid" ]]; then
    kill "$first_pid" 2>/dev/null || true
    wait "$first_pid" 2>/dev/null || true
  fi
  psql -X -v ON_ERROR_STOP=1 -qc \
    'DROP SCHEMA IF EXISTS cafeos_preflight_private CASCADE; DROP ROLE IF EXISTS cafeos_concurrency_worker;' >/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 \
  -f tests/security/fixtures/provenance-concurrency-setup-v1.sql \
  >"$tmp/setup.log" 2>&1
grep -q 'PROVENANCE_RACE_SETUP_PASS' "$tmp/setup.log"
echo PROVENANCE_PG_RACE_WORKER_PRIVILEGES_PASS

# The first worker holds an open transaction after revision 2 is inserted.
# We verify the lock is actually held before starting the second worker.
psql -X -v ON_ERROR_STOP=1 >"$tmp/first.log" 2>&1 <<'SQL' &
BEGIN;
SET ROLE cafeos_concurrency_worker;
INSERT INTO cafeos_preflight_private.binding_events
  (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
VALUES ('10000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        '51000000-0000-4000-8000-000000000001',
        2,'proposed','2000-01-01T00:00:00Z','2026-10-28T09:00:00Z');
\echo PROVENANCE_FIRST_INSERTED
SELECT pg_sleep(5);
COMMIT;
\echo PROVENANCE_FIRST_COMMITTED
SQL
first_pid=$!

ready=0
for _ in $(seq 1 80); do
  if grep -q 'PROVENANCE_FIRST_INSERTED' "$tmp/first.log" 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$ready" != 1 ]]; then
  echo "FAIL: first worker never completed initial uncommitted append" >&2
  cat "$tmp/first.log" >&2
  exit 1
fi

# A different PostgreSQL session must see the transaction-level lock held.
held="$(psql -X -Atqc "SELECT NOT pg_try_advisory_xact_lock(
  hashtextextended('51000000-0000-4000-8000-000000000001',0))")"
if [[ "$held" != "t" ]]; then
  echo "FAIL: advisory transaction lock not held across concurrent sessions" >&2
  exit 1
fi
echo PROVENANCE_PG_RACE_OVERLAP_CONFIRMED_PASS

# This second worker must block until first commits, then fail revision 2.
if psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
   >"$tmp/second.log" 2>&1 <<'SQL'
BEGIN;
SET ROLE cafeos_concurrency_worker;
SET LOCAL lock_timeout = '12s';
INSERT INTO cafeos_preflight_private.binding_events
  (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
VALUES ('10000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        '51000000-0000-4000-8000-000000000001',
        2,'proposed','2000-01-01T00:00:00Z','2026-10-28T09:00:00Z');
COMMIT;
SQL
then
  echo "FAIL: both concurrent revision-2 inserts committed" >&2
  exit 1
fi
grep -q '23514: Binding revision gap or replay' "$tmp/second.log" || {
  echo "FAIL: second worker failed for an unexpected reason" >&2
  cat "$tmp/second.log" >&2
  exit 1
}
wait "$first_pid"
first_pid=""
grep -q 'PROVENANCE_FIRST_COMMITTED' "$tmp/first.log"
if [[ "$(psql -X -Atqc "SELECT count(*) FROM cafeos_preflight_private.binding_events
    WHERE binding_id='51000000-0000-4000-8000-000000000001'")" != 2 ]]; then
  echo "FAIL: concurrent event history not exactly revisions 1/2" >&2
  exit 1
fi
echo PROVENANCE_PG_RACE_SERIALIZATION_PASS

# Two-tenant RLS is tested under the *worker* role, not the superuser.
if [[ "$(psql -X -Atqc "SET ROLE cafeos_concurrency_worker;
  SELECT count(*) FROM cafeos_preflight_private.binding_events")" != 2 ]]; then
  echo "FAIL: worker leaked foreign tenant events" >&2
  exit 1
fi
# Explicitly check that worker cannot write an event for Tenant B.
if psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
  >"$tmp/foreign.log" 2>&1 <<'SQL'
SET ROLE cafeos_concurrency_worker;
INSERT INTO cafeos_preflight_private.binding_events
  (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
VALUES ('20000000-0000-4000-8000-000000000002',
        '21000000-0000-4000-8000-000000000002',
        '52000000-0000-4000-8000-000000000002',
        2,'proposed','2000-01-01T00:00:00Z','2026-10-28T09:00:00Z');
SQL
then
  echo "FAIL: cross-Tenant event insert accepted" >&2
  exit 1
fi
if ! grep -qE '(42501|23503):' "$tmp/foreign.log"; then
  echo "FAIL: foreign tenant request did not fail with RLS/foreign-scope denial" >&2
  cat "$tmp/foreign.log" >&2
  exit 1
fi
echo PROVENANCE_PG_RACE_FOREIGN_TENANT_DENIED_PASS

# A valid revocation is appendable, but an unreviewed subsequent proposal is
# terminally refused by the trigger. Worker has INSERT but no UPDATE/DELETE.
psql -X -v ON_ERROR_STOP=1 >"$tmp/revoke.log" 2>&1 <<'SQL'
SET ROLE cafeos_concurrency_worker;
INSERT INTO cafeos_preflight_private.binding_events
  (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
VALUES ('10000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        '51000000-0000-4000-8000-000000000001',
        3,'revoked','2000-01-01T00:00:00Z','2026-10-28T10:00:00Z');
SQL
if psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
  >"$tmp/reactivate.log" 2>&1 <<'SQL'
SET ROLE cafeos_concurrency_worker;
INSERT INTO cafeos_preflight_private.binding_events
  (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
VALUES ('10000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        '51000000-0000-4000-8000-000000000001',
        4,'proposed','2000-01-01T00:00:00Z','2026-10-28T11:00:00Z');
SQL
then
  echo "FAIL: worker reactivated revoked binding" >&2
  exit 1
fi
grep -q '23514: Terminal provenance event cannot be reactivated' "$tmp/reactivate.log" || {
  echo "FAIL: revocation negative control failed for wrong reason" >&2
  cat "$tmp/reactivate.log" >&2
  exit 1
}
if [[ "$(psql -X -Atqc "SELECT count(*) FROM cafeos_preflight_private.binding_events
  WHERE binding_id='51000000-0000-4000-8000-000000000001'")" != 3 ]]; then
  echo "FAIL: terminal revocation history count wrong" >&2
  exit 1
fi
echo PROVENANCE_PG_RACE_REVOKED_TERMINAL_PASS

# This disposable database, credentials and roles are NOT CafeOS staging.
echo PROVENANCE_PG_RACE_PREFLIGHT_PASS
