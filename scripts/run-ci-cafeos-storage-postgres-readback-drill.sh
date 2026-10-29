#!/usr/bin/env bash
# Synthetic-only: PostgreSQL Storage metadata + encrypted external object bytes.
# NEVER connect to a Supabase project or run with real Storage/customer records.
set -euo pipefail
umask 077
[[ "$(printenv GITHUB_ACTIONS || true)" == true && "$(printenv CI || true)" == true ]] || {
  echo STOP_GITHUB_ACTIONS_SYNTHETIC_ONLY >&2; exit 42;
}
for tool in age age-keygen node pg_dump pg_restore psql createdb dropdb sha256sum sudo; do
  command -v "$tool" >/dev/null || { echo "STOP_MISSING_TOOL_$tool" >&2; exit 42; }
done
[[ "$(stat -f -c %T /dev/shm)" == tmpfs ]] || {
  echo STOP_PRIVATE_TMPFS_NOT_AVAILABLE >&2; exit 42;
}
readonly source_db=cafeos_synthetic_storage_source_20261029
readonly target_db=cafeos_synthetic_storage_recovered_20261029
source_created=0
target_created=0
success=0
work="$(mktemp -d /dev/shm/cafeos-pg-storage.XXXXXXXX)"
[[ "$(stat -c %a "$work")" == 700 ]] || exit 42
cleanup() {
  local status=$? cleanup_bad=0
  trap - EXIT
  if [[ "$target_created" == 1 ]]; then
    sudo -u postgres dropdb --if-exists --force "$target_db" >/dev/null 2>&1 || cleanup_bad=1
  fi
  if [[ "$source_created" == 1 ]]; then
    sudo -u postgres dropdb --if-exists --force "$source_db" >/dev/null 2>&1 || cleanup_bad=1
  fi
  rm -rf -- "$work" || cleanup_bad=1
  if [[ "$cleanup_bad" != 0 ]]; then
    echo STOP_SYNTHETIC_DATABASE_OR_TMPFS_CLEANUP_FAILED >&2
    exit 42
  fi
  if [[ "$status" == 0 && "$success" == 1 ]]; then
    printf '%s\n' \
      'CAFEOS_SYNTHETIC_STORAGE_POSTGRES_SOURCE_TARGET_READBACK_PASS' \
      'CAFEOS_SYNTHETIC_STORAGE_POSTGRES_AGE_ARCHIVE_RESTORE_PASS' \
      'CAFEOS_SYNTHETIC_STORAGE_POSTGRES_OBJECT_BYTES_SHA256_PASS' \
      'CAFEOS_SYNTHETIC_STORAGE_SQL_TARGET_VERSION_DRIFT_DETECTED_PASS' \
      'CAFEOS_SYNTHETIC_STORAGE_SQL_TARGET_PUBLIC_DRIFT_DETECTED_PASS' \
      'CAFEOS_SYNTHETIC_STORAGE_POSTGRES_FIXTURE_CLEANUP_PASS' \
      'NO_REAL_SUPABASE_STORAGE_API_OR_PRODUCTION_DATA'
  fi
  exit "$status"
}
trap cleanup EXIT

# Peer-authenticated local Unix socket, no database URI/password/token.
sudo -u postgres pg_isready -q -d postgres || { echo STOP_LOCAL_POSTGRES_NOT_READY >&2; exit 42; }
for db in "$source_db" "$target_db"; do
  exists="$(sudo -u postgres psql -XqAtw -v ON_ERROR_STOP=1 -d postgres \
    -c "SELECT count(*) FROM pg_database WHERE datname='$db'")"
  [[ "$exists" == 0 ]] || { echo STOP_SYNTHETIC_DATABASE_NAME_COLLISION >&2; exit 42; }
done
sudo -u postgres createdb --template=template0 "$source_db"
source_created=1
sudo -u postgres createdb --template=template0 "$target_db"
target_created=1

# Dedicated SYNTHETIC representation of selected Storage metadata columns.
# This is NOT Supabase's actual managed storage schema or API.
mkdir -p "$work/source/bucket-photos" "$work/source/bucket-menus"
mkdir -p "$work/restored/bucket-photos" "$work/restored/bucket-menus"
printf 'CAFEOS-SYNTHETIC-BYTES-\000\377\r\n' > "$work/source/bucket-photos/object.bin"
printf 'sku,price\nespresso,125\n' > "$work/source/bucket-menus/menu.csv"
photo_size="$(stat -c %s "$work/source/bucket-photos/object.bin")"
menu_size="$(stat -c %s "$work/source/bucket-menus/menu.csv")"
photo_sha="$(sha256sum "$work/source/bucket-photos/object.bin" | cut -d ' ' -f1)"
menu_sha="$(sha256sum "$work/source/bucket-menus/menu.csv" | cut -d ' ' -f1)"

sudo -u postgres psql -Xqw -v ON_ERROR_STOP=1 -d "$source_db" <<SQL
BEGIN;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
 id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL,
 owner_id text, file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects (
 id text PRIMARY KEY, bucket_id text NOT NULL REFERENCES storage.buckets(id),
 name text NOT NULL, owner_id text, version text NOT NULL, metadata jsonb NOT NULL,
 UNIQUE (bucket_id, name)
);
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
INSERT INTO storage.buckets(id,name,public,owner_id,file_size_limit,allowed_mime_types)
 VALUES
 ('bucket-photos','Synthetic Photos',false,'owner-a',4096,ARRAY['application/octet-stream']),
 ('bucket-menus','Synthetic Menus',false,NULL,4096,ARRAY['text/csv']);
INSERT INTO storage.objects(id,bucket_id,name,owner_id,version,metadata)
 VALUES
 ('object-photo','bucket-photos','object.bin','owner-a','synthetic-v1',
  jsonb_build_object('size',$photo_size,'mimetype','application/octet-stream')),
 ('object-menu','bucket-menus','menu.csv',NULL,'synthetic-v2',
  jsonb_build_object('size',$menu_size,'mimetype','text/csv'));
COMMIT;
SQL

# Generate disposable age identity and encrypt the PostgreSQL custom archive
# BEFORE restoring into the other PostgreSQL database. Never save dump plaintext.
age-keygen -o "$work/key.txt" >/dev/null 2>&1
recipient="$(age-keygen -y "$work/key.txt")"
[[ "$recipient" == age1* ]] || { echo STOP_BAD_EPHEMERAL_RECIPIENT >&2; exit 42; }
sudo -u postgres pg_dump -Fc --schema=storage -d "$source_db" |
  age -r "$recipient" -o "$work/storage-schema-and-data.pgcustom.age"
age -d -i "$work/key.txt" "$work/storage-schema-and-data.pgcustom.age" |
  sudo -u postgres pg_restore -w --no-owner --single-transaction --exit-on-error -d "$target_db"

# Object bytes are SEPARATE from PostgreSQL's Storage metadata.
age -r "$recipient" -o "$work/photo.age" "$work/source/bucket-photos/object.bin"
age -r "$recipient" -o "$work/menu.age" "$work/source/bucket-menus/menu.csv"
age -d -i "$work/key.txt" -o "$work/restored/bucket-photos/object.bin" "$work/photo.age"
age -d -i "$work/key.txt" -o "$work/restored/bucket-menus/menu.csv" "$work/menu.age"

snapshot_query="SELECT json_build_object(
 'buckets', COALESCE((SELECT json_agg(row_to_json(b) ORDER BY b.id)
                      FROM storage.buckets b),'[]'::json),
 'objects', COALESCE((SELECT json_agg(row_to_json(o) ORDER BY o.id)
                      FROM storage.objects o),'[]'::json))::text;"
snapshot() {
  local db="$1" filepath="$2"
  sudo -u postgres psql -XqAtw -v ON_ERROR_STOP=1 -d "$db" -c "$snapshot_query" > "$filepath"
  [[ -s "$filepath" ]] || { echo STOP_EMPTY_SQL_METADATA_SNAPSHOT >&2; exit 42; }
}
snapshot "$source_db" "$work/source.json"
snapshot "$target_db" "$work/target.json"
cat > "$work/byte-manifest.json" <<JSON
[
 {"bucket_id":"bucket-photos","name":"object.bin","version":"synthetic-v1","sha256":"$photo_sha"},
 {"bucket_id":"bucket-menus","name":"menu.csv","version":"synthetic-v2","sha256":"$menu_sha"}
]
JSON
verify() {
  CAFEOS_SYNTHETIC_LOCAL=1 node scripts/verify-cafeos-synthetic-storage-recovery.mjs \
    "$work/source.json" "$work/target.json" "$work/byte-manifest.json" "$work/restored"
}
verify

# Negative controls MUST fail for the correct reason after a real SQL mutation
# on the separate synthetic target. No edits to real Supabase managed schemas.
sudo -u postgres psql -Xqw -v ON_ERROR_STOP=1 -d "$target_db" \
  -c "UPDATE storage.objects SET version='synthetic-wrong' WHERE id='object-photo'"
snapshot "$target_db" "$work/target.json"
if verify >"$work/negative.stdout" 2>"$work/negative.stderr"; then
  echo STOP_SQL_TARGET_VERSION_DRIFT_UNDETECTED >&2; exit 42
fi
grep -q 'STOP_STORAGE_OBJECT_ATTRIBUTE_DRIFT' "$work/negative.stderr" || {
  echo STOP_WRONG_VERSION_DRIFT_FAILURE_REASON >&2; exit 42;
}
sudo -u postgres psql -Xqw -v ON_ERROR_STOP=1 -d "$target_db" \
  -c "UPDATE storage.objects SET version='synthetic-v1' WHERE id='object-photo'"

sudo -u postgres psql -Xqw -v ON_ERROR_STOP=1 -d "$target_db" \
  -c "UPDATE storage.buckets SET public=true WHERE id='bucket-menus'"
snapshot "$target_db" "$work/target.json"
if verify >"$work/negative.stdout" 2>"$work/negative.stderr"; then
  echo STOP_SQL_TARGET_PUBLIC_DRIFT_UNDETECTED >&2; exit 42
fi
grep -q 'STOP_STORAGE_BUCKET_ATTRIBUTE_DRIFT' "$work/negative.stderr" || {
  echo STOP_WRONG_PUBLIC_DRIFT_FAILURE_REASON >&2; exit 42;
}
sudo -u postgres psql -Xqw -v ON_ERROR_STOP=1 -d "$target_db" \
  -c "UPDATE storage.buckets SET public=false WHERE id='bucket-menus'"
snapshot "$target_db" "$work/target.json"
verify

# Merely a synthetic PostgreSQL data-restoration test; the actual
# Supabase Storage API and external provider still require separate proof.
success=1
