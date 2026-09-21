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
