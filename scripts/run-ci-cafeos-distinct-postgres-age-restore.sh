#!/usr/bin/env bash
# Synthetic ONLY: restore encrypted Auth + history from CI local Supabase to an
# independent PostgreSQL SERVER on Docker --network none, not a second DB.
# This is not a real staging backup or a managed Supabase recovery certificate.
set -euo pipefail
umask 077

[[ "$(printenv GITHUB_ACTIONS || true)" == 'true' && "$(printenv CI || true)" == 'true' ]] || {
  echo STOP_GITHUB_ACTIONS_SYNTHETIC_ONLY >&2; exit 42;
}
[[ -f .github/workflows/supabase-db.yml ]] || exit 42
for bin in docker psql pg_dump pg_isready age age-keygen sha256sum; do
  command -v "$bin" >/dev/null || { echo "STOP_MISSING_TOOL_$bin" >&2; exit 42; }
done

readonly local_db='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
readonly target='cafeos-ci-distinct-postgres-restore'
# Use Supabase's official full PostgreSQL 17.11 image, not the CLI slim
# image (requires CLI-managed bootstrap). Pin the GHCR manifest digest.
# Do not use public ECR for this CI fixture: registry returned a data cap.
readonly target_image='ghcr.io/supabase/postgres:17.11.0.006@sha256:c141fd17ac6a76c4323e90b3aee8ff1a23d2e89e547c2b963cfadc309c079cc2'
readonly uid='92000000-0000-4000-8000-000000000001'
readonly iid='92000000-0000-4000-8000-000000000002'
pg_isready -h 127.0.0.1 -p 54322 -U postgres -d postgres -q ||
  { echo STOP_LOCAL_SOURCE_UNAVAILABLE >&2; exit 42; }
[[ "$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c \
  "select current_database() || ':' || current_user")" == 'postgres:postgres' ]] ||
  { echo STOP_UNEXPECTED_SOURCE_IDENTITY >&2; exit 42; }
[[ "$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c \
  "select (select count(*) from auth.users)::text || ':' || (select count(*) from auth.identities)::text")" == '0:0' ]] ||
  { echo STOP_SOURCE_AUTH_NOT_BLANK >&2; exit 42; }
[[ "$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c \
  "select count(*) > 0 from supabase_migrations.schema_migrations")" == 't' ]] ||
  { echo STOP_SOURCE_MIGRATION_HISTORY_MISSING >&2; exit 42; }

# Pin the target image to the actual running disposable CI source database.
source_ids="$(docker ps -q --filter 'publish=54322')"
[[ -n "$source_ids" && "$(printf '%s\n' "$source_ids" | wc -l)" -eq 1 ]] ||
  { echo STOP_LOCAL_SOURCE_DOCKER_CONTAINER_COUNT >&2; exit 42; }
source_name="$(docker inspect --format '{{.Name}}' "$source_ids")"
source_image="$(docker inspect --format '{{.Config.Image}}' "$source_ids")"
[[ "$source_name" == /supabase_db_* ]] ||
  { echo STOP_SOURCE_DOCKER_CONTAINER_NAME >&2; exit 42; }
# CI's SUPABASE_USE_SLIM_IMAGES=true selects the signed GHCR slim image.
# Other than the exact upstream 17.11.0.006-r0 slim build, permit only
# the separately observed source ECR PostgreSQL 17 family.
[[ "$source_image" == ghcr.io/supabase/cli/postgres:17.11.0.006-r0* ||
   "$source_image" == public.ecr.aws/supabase/postgres:17.11.0.006* ]] ||
  { echo STOP_SOURCE_DOCKER_IMAGE_NOT_PINN >&2; exit 42; }
[[ -z "$(docker ps -aq --filter "name=^/$target$")" ]] ||
  { echo STOP_TARGET_ALREADY_EXISTS >&2; exit 42; }

work="$(mktemp -d)"
[[ "$(stat -c '%a' "$work")" == '700' ]] || exit 42
target_created=0
fixture_marked=0
success=0
cleanup() {
  local status=$? cleanup_failed=0
  trap - EXIT
  if [[ "$fixture_marked" == 1 ]]; then
    # Exactly two fake UUIDs, hardcoded source localhost; never touch real users.
    psql "$local_db" -Xqw -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || cleanup_failed=1
BEGIN;
DELETE FROM auth.identities
 WHERE id='92000000-0000-4000-8000-000000000002'
   AND user_id='92000000-0000-4000-8000-000000000001';
DELETE FROM auth.users
 WHERE id='92000000-0000-4000-8000-000000000001';
COMMIT;
SQL
    [[ "$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c \
      "select (select count(*) from auth.users)::text || ':' || (select count(*) from auth.identities)::text")" == '0:0' ]] ||
      cleanup_failed=1
  fi
  if [[ "$target_created" == 1 ]]; then
    if [[ "$status" != 0 && "$fixture_marked" == 0 ]]; then
      # Only this blank, synthetic target exists; bounded startup diagnostics.
      docker inspect --format 'TARGET_STATE_RUNNING={{.State.Running}} EXIT={{.State.ExitCode}} OOM={{.State.OOMKilled}} HEALTH={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$target" >&2 || true
      docker logs --tail 18 "$target" >&2 || true
    fi
    docker rm -f "$target" >/dev/null 2>&1 || cleanup_failed=1
    [[ -z "$(docker ps -aq --filter "name=^/$target$")" ]] || cleanup_failed=1
  fi
  rm -rf -- "$work" || cleanup_failed=1
  if [[ "$cleanup_failed" != 0 ]]; then
    echo STOP_SYNTHETIC_CLEANUP_FAILED >&2; exit 42;
  fi
  if [[ "$status" == 0 && "$success" == 1 ]]; then
    printf '%s\n' \
      'CAFEOS_DISTINCT_POSTGRES_SOURCE_TARGET_ISOLATION_PASS' \
      'CAFEOS_DISTINCT_POSTGRES_AUTH_IDENTITY_HISTORY_AGE_RESTORE_PASS' \
      'CAFEOS_DISTINCT_POSTGRES_SOURCE_AND_TARGET_CLEANUP_PASS' \
      'SYNTHETIC_ONLY_NOT_FULL_MANAGED_SUPABASE_RESTORE'
  fi
  exit "$status"
}
trap cleanup EXIT

# No network, no published ports, no host bind mounts, ephemeral PGDATA.
docker run -d \
  --name "$target" \
  --network none \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700 \
  --label cafeos.ci.synthetic_only=true \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  "$target_image" >/dev/null
target_created=1
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$target")" == none ]] ||
  { echo STOP_TARGET_NETWORK >&2; exit 42; }
[[ "$(docker inspect --format '{{len .HostConfig.PortBindings}}' "$target")" == '0' ]] ||
  { echo STOP_TARGET_PORT_BINDINGS >&2; exit 42; }
[[ "$(docker inspect --format '{{len .Mounts}}' "$target")" == '0' ]] ||
  { echo STOP_TARGET_HOST_MOUNTS >&2; exit 42; }
[[ "$(docker inspect --format '{{.HostConfig.Privileged}}' "$target")" == 'false' ]] ||
  { echo STOP_TARGET_PRIVILEGED >&2; exit 42; }
# pg_isready can transiently succeed before the managed init process reaches
# a stable queryable state. Require 3 consecutive REAL SQL connections.
# Auth table presence/shape is a DIFFERENT strict gate below: a healthy bare
# PG target MUST get a schema mismatch diagnostic, never stall at readiness.
ready=0
for ((i=0; i<120; i++)); do
  if docker exec -u postgres "$target" pg_isready -q -d postgres >/dev/null 2>&1 &&
     [[ "$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c "SELECT 'READY'" 2>/dev/null || true)" == READY ]]; then
    ready=$((ready+1))
    if [[ "$ready" -ge 3 ]]; then break; fi
  else
    ready=0
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$target")" != true ]]; then
    echo STOP_TARGET_EXITED_DURING_MANAGED_INIT >&2
    break
  fi
  sleep 1
done
if [[ "$ready" -lt 3 ]]; then
  echo STOP_TARGET_PG_NOT_STABLY_QUERYABLE >&2
  # Diagnostic output is from a throwaway database without any real keys.
  docker logs --tail=12 "$target" >&2 || true
  exit 42
fi
[[ "$(docker exec -u postgres "$target" psql -XAtq -w -v ON_ERROR_STOP=1 -d postgres -c \
  "SHOW data_directory")" == '/var/lib/postgresql/data' ]] ||
  { echo STOP_TARGET_PGDATA >&2; exit 42; }
[[ "$(docker exec -u postgres "$target" stat -f -c '%T' /var/lib/postgresql/data)" == tmpfs ]] ||
  { echo STOP_TARGET_DATA_NOT_TMPFS >&2; exit 42; }

# The full image has a different bare Auth bootstrap than the CLI slim
# source (44 source columns versus 21 bare target columns in CI). For THIS
# DISPOSABLE SYNTHETIC PostgreSQL portability drill ONLY, rehydrate the source
# Auth DDL into the independent, networkless tmpfs target before data replay.
# This is NOT the Supabase managed-platform restore procedure. It must remain
# an explicit adaptation, followed by the original strict schema hash gate.
readonly target_auth_baseline_sql="SELECT
  CASE WHEN to_regclass('auth.users') IS NULL THEN 'ABSENT'
       WHEN (SELECT count(*) FROM auth.users)=0 THEN 'EMPTY'
       ELSE 'NOT_EMPTY' END"
[[ "$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c "$target_auth_baseline_sql")" != NOT_EMPTY ]] ||
  { echo STOP_TARGET_AUTH_NOT_EMPTY_BEFORE_DDL_REPLAY >&2; exit 42; }
# Fresh target only: no other Auth users, and its network / tmpfs / image
# identity was pinned above. Drop the old baseline schema, NEVER source data.
printf 'DROP SCHEMA IF EXISTS auth CASCADE;\n' |
  docker exec -i -u postgres "$target" psql -Xqw -v ON_ERROR_STOP=1 -d postgres -f - >/dev/null
pg_dump "$local_db" --schema-only --schema=auth --no-owner --no-acl |
  docker exec -i -u postgres "$target" psql -Xqw -v ON_ERROR_STOP=1 -d postgres -f - >/dev/null

# The source-derived test-only Auth schema must now match exactly.
auth_columns="select md5(string_agg(table_name || ':' || column_name || ':' ||
  udt_name || ':' || is_nullable, '|' order by table_name,ordinal_position))
  from information_schema.columns
  where table_schema='auth' and table_name in ('users','identities')"
source_cols="$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c "$auth_columns")"
target_cols="$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c "$auth_columns")"
[[ -n "$source_cols" && "$source_cols" == "$target_cols" ]] || {
  # Diagnostic ONLY: this queries catalog column definitions, NOT user rows,
  # Auth metadata or secrets. Do NOT delete this mismatch security gate.
  auth_catalog="select table_name || '.' || column_name || '|' ||
    ordinal_position::text || '|' || udt_name || '|' || is_nullable
    from information_schema.columns
    where table_schema='auth' and table_name in ('users','identities')
    order by table_name,ordinal_position"
  src_names="$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c "$auth_catalog")"
  dst_names="$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c "$auth_catalog")"
  echo "SOURCE_AUTH_COLUMN_COUNT=$(printf '%s\\n' "$src_names" | awk 'NF {n++} END {print n+0}')" >&2
  echo "TARGET_AUTH_COLUMN_COUNT=$(printf '%s\\n' "$dst_names" | awk 'NF {n++} END {print n+0}')" >&2
  # Only bounded +/- difference lines. Neither database's rows are queried.
  diff -U 0 <(printf '%s\\n' "$src_names") <(printf '%s\\n' "$dst_names") |
    awk '/^[-+]/ && !/^---/ && !/^\\+\\+\\+/ { if (++n <= 70) print "SCHEMA_DIFF " $0 }' >&2 || true
  echo STOP_MANAGED_AUTH_SCHEMA_MISMATCH >&2
  exit 42
}
echo CAFEOS_SYNTHETIC_TARGET_AUTH_SCHEMA_REPLAY_PASS
[[ "$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c \
  "select (select count(*) from auth.users)::text || ':' || (select count(*) from auth.identities)::text")" == '0:0' ]] ||
  { echo STOP_TARGET_AUTH_NOT_BLANK >&2; exit 42; }

# Reconstruct only historical ledger DDL from the disposable local source,
# including actual column order/types. No source row data is printed.
printf 'CREATE SCHEMA supabase_migrations;\n' |
  docker exec -i -u postgres "$target" psql -Xqw -v ON_ERROR_STOP=1 -d postgres -f - >/dev/null
pg_dump "$local_db" --schema-only --no-owner --no-acl \
  --table=supabase_migrations.schema_migrations |
  docker exec -i -u postgres "$target" psql -Xqw -v ON_ERROR_STOP=1 -d postgres -f - >/dev/null
[[ "$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c \
  "select count(*) from supabase_migrations.schema_migrations")" == 0 ]] ||
  { echo STOP_TARGET_LEDGER_NOT_BLANK >&2; exit 42; }

# Insert ONE non-login synthetic Auth user & identity into source only.
fixture_marked=1
psql "$local_db" -Xqw -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
BEGIN;
INSERT INTO auth.users
 (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
 VALUES ('92000000-0000-4000-8000-000000000001',
 '00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','separate-server-fixture@example.invalid',
 'NOT-A-VALID-PASSWORD',now(),now());
INSERT INTO auth.identities
 (id,provider_id,user_id,provider,identity_data,created_at,updated_at)
 VALUES ('92000000-0000-4000-8000-000000000002',
 'distinct-postgres-fixture-1',
 '92000000-0000-4000-8000-000000000001',
 'email',
 '{"sub":"92000000-0000-4000-8000-000000000001","email":"separate-server-fixture@example.invalid"}'::jsonb,
 now(),now());
COMMIT;
SQL
[[ "$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c \
  "select (select count(*) from auth.users)::text || ':' || (select count(*) from auth.identities)::text")" == '1:1' ]] ||
  { echo STOP_SOURCE_FIXTURE_COUNTS >&2; exit 42; }

age-keygen -o "$work/identity.txt" >/dev/null 2>&1
age-keygen -y "$work/identity.txt" > "$work/recipient.txt"
chmod 600 "$work/identity.txt" "$work/recipient.txt"
[[ "$(stat -c '%a' "$work/identity.txt")" == 600 ]] || exit 42

# Custom-format PostgreSQL archive encrypted DIRECTLY to age ciphertext.
# Plaintext data does not touch durable host filesystem.
pg_dump "$local_db" -w -Fc --data-only --no-owner --no-acl \
  --table=auth.users --table=auth.identities \
  --table=supabase_migrations.schema_migrations |
  age -R "$work/recipient.txt" -o "$work/three-tables.pgcustom.age"
[[ -s "$work/three-tables.pgcustom.age" ]] ||
  { echo STOP_CIPHERTEXT_EMPTY >&2; exit 42; }
sha256sum "$work/three-tables.pgcustom.age" > "$work/manifest.sha256"
(cd "$work" && sha256sum -c manifest.sha256 >/dev/null)

# Pipe decrypted PG custom archive into a DIFFERENT PG server via docker exec.
# No auth signing key/JWT; no plaintext SQL or dump file on host.
age -d -i "$work/identity.txt" "$work/three-tables.pgcustom.age" |
  docker exec -i -u postgres "$target" pg_restore \
    -w --data-only --no-owner --single-transaction --exit-on-error \
    -d postgres - >/dev/null

auth_check="select count(*) from auth.users u join auth.identities i
  on i.user_id=u.id where u.id='$uid' and i.id='$iid'
  and u.email='separate-server-fixture@example.invalid'"
[[ "$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c "$auth_check")" == 1 ]] ||
  { echo STOP_CROSS_SERVER_AUTH_IDENTITY_MISSING >&2; exit 42; }
[[ "$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c \
  "select (select count(*) from auth.users)::text || ':' || (select count(*) from auth.identities)::text")" == '1:1' ]] ||
  { echo STOP_CROSS_SERVER_AUTH_COUNT >&2; exit 42; }

# Preserve *all* canonical history statements and ordered SHA-256 (synthetic
# canonical history, NOT the independently pinned original staging 7 receipts).
history_sql="select count(*)::text || ':' || encode(sha256(convert_to(
  coalesce(string_agg(version || chr(31) || coalesce(name,'') || chr(31) ||
  coalesce(array_to_string(statements,chr(30)),''),chr(29) order by version),''),
  'UTF8')),'hex') from supabase_migrations.schema_migrations"
source_fp="$(psql "$local_db" -XAtq -v ON_ERROR_STOP=1 -c "$history_sql")"
target_fp="$(docker exec -u postgres "$target" psql -XAtqw -v ON_ERROR_STOP=1 -d postgres -c "$history_sql")"
[[ "$source_fp" =~ ^[1-9][0-9]*:[0-9a-f]{64}$ && "$source_fp" == "$target_fp" ]] ||
  { echo STOP_CROSS_SERVER_HISTORY_FINGERPRINT_MISMATCH >&2; exit 42; }
success=1
