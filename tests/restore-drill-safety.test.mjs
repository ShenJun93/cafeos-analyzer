import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("restore drill is pinned to the ephemeral local Supabase database", async () => {
  const script = await readFile(
    new URL("../scripts/run-supabase-restore-drill.sh", import.meta.url),
    "utf8"
  );

  assert.match(script, /127\.0\.0\.1:54322\/postgres/);
  assert.match(script, /supabase db dump --db-url "\$DB_URL"/);
  assert.match(script, /supabase db reset/);
  assert.match(script, /--single-transaction/);
  assert.match(script, /ON_ERROR_STOP/);
  assert.match(script, /trap cleanup EXIT/);

  assert.doesNotMatch(script, /wjatnyvdygvblirggdcm/);
  assert.doesNotMatch(script, /SUPABASE_ACCESS_TOKEN/);
  assert.doesNotMatch(script, /service_role/i);
  assert.doesNotMatch(script, /sb_secret_/i);
});

test("restore drill never uploads or preserves the logical dump bundle", async () => {
  const script = await readFile(
    new URL("../scripts/run-supabase-restore-drill.sh", import.meta.url),
    "utf8"
  );

  assert.match(script, /bundle_dir="\$\(mktemp -d\)"/);
  assert.match(script, /rm -rf "\$bundle_dir"/);
  assert.doesNotMatch(script, /upload-artifact/i);
});


test("history-repair drill is isolated to local synthetic Supabase and checks no schema/data change", async () => {
  const script = await readFile(
    new URL("../scripts/run-local-ledger-reconciliation-drill.sh", import.meta.url), "utf8"
  );
  assert.match(script, /readonly DB_URL="postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres"/);
  assert.match(script, /pg_isready -h 127\.0\.0\.1 -p 54322/);
  assert.match(script, /current_database\(\) \|\| ':' \|\| current_user/);
  assert.match(script, /\[\[ "\$DB_URL" == "postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres" \]\]/);
  assert.match(script, /supabase migration repair --db-url "\$DB_URL" --status reverted/);
  assert.match(script, /supabase migration repair --db-url "\$DB_URL" --status applied/);
  assert.match(script, /CAFEOS_LOCAL_LEDGER_REPAIR_DRILL_PASS/);
  assert.match(script, /STOP_REVIEW_REQUIRED/);
  assert.match(script, /_synthetic_local_receipt\.sql/);
  assert.match(script, /trap cleanup EXIT/);
  assert.match(script, /Refusing to overwrite a real migration/);
  assert.match(script, /rm -f -- "\$path"/);
  assert.match(script, /before_schema/);
  assert.match(script, /before_data/);
  assert.doesNotMatch(script, /--linked|supabase link|wjatnyvdygvblirggdcm|SUPABASE_ACCESS_TOKEN|service_role|sb_secret_/i);
  assert.doesNotMatch(script, /db push|supabase db reset|rm -rf|curl|https?:\/\/(?!(?:127\.0\.0\.1|localhost))/i);
});


test("greenpath reconciliation acceptance never targets staging or production", async () => {
  const script = await readFile(
    new URL("../scripts/run-local-greenpath-ledger-drill.sh", import.meta.url), "utf8"
  );
  assert.match(script, /readonly DB_URL="postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres"/);
  assert.match(script, /supabase db reset --local --no-seed --version/);
  assert.match(script, /supabase migration repair --db-url "\$DB_URL" --status reverted/);
  assert.match(script, /supabase migration repair --db-url "\$DB_URL" --status applied/);
  assert.match(script, /supabase migration up --db-url "\$DB_URL"/);
  assert.match(script, /HISTORY_READY_GUARDS_PENDING_OWNER_APPROVAL/);
  assert.match(script, /PRE_REPAIR_NO_GO/);
  assert.match(script, /STOP_REVIEW_REQUIRED/);
  assert.match(script, /CAFEOS_LOCAL_GREENPATH_PASS/);
  assert.match(script, /trap cleanup EXIT/);
  assert.doesNotMatch(script, /--linked|supabase link|wjatnyvdygvblirggdcm|SUPABASE_ACCESS_TOKEN|service_role|sb_secret_/i);
});
