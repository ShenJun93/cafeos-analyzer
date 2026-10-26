import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  assert.match(script, /POST_GUARDS_NOT_READY_REVIEW/);
  assert.match(script, /POST_GUARDS_READY_FOR_AUTH_E2E/);
  assert.match(script, /cafeos-staging-post-guards-readonly-gate\.sql/);
  assert.match(script, /cafeos-local-postguards-negative-fixture\.sql/);
  assert.match(script, /POST_GUARDS_NOT_READY_REVIEW/);
  assert.match(script, /POST_GUARDS_READY_FOR_AUTH_E2E/);
  assert.match(script, /CAFEOS_LOCAL_GREENPATH_PASS/);
  assert.match(script, /trap cleanup EXIT/);
  assert.doesNotMatch(script, /--linked|supabase link|wjatnyvdygvblirggdcm|SUPABASE_ACCESS_TOKEN|service_role|sb_secret_/i);
});

test("post-guard acceptance checks canonical ledger, SQL protections and financial invariants without writes", async () => {
  const source = await readFile(
    new URL("../scripts/sql/cafeos-staging-post-guards-readonly-gate.sql", import.meta.url),
    "utf8"
  );
  const sql = source.split("\n").filter(line => !/^\s*--/.test(line)).join("\n");
  assert.match(sql.trimStart(), /^with\s+/i);
  assert.equal((sql.match(/;/g) || []).length, 1);
  assert.doesNotMatch(sql, /\b(?:create\s+(?:or\s+replace\s+)?(?:table|function)|alter\s+table|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+(?:table|function)|grant\s+|revoke\s+|truncate\s+)\b/i);
  for (const key of [
    "POST_GUARDS_READY_FOR_AUTH_E2E",
    "POST_GUARDS_NOT_READY_REVIEW",
    "canonical_present=10",
    "legacy_present=0",
    "COMMERCE_CLOSE_FUTURE_DATE",
    "v_snapshot_items",
    "rls_tables=6",
    "guarded_rpc_grants=3",
    "bad_order_subtotals=0",
    "bad_payment_states=0",
    "bad_daily_closes=0"
  ]) assert.ok(sql.includes(key), "post-guard assertion missing: " + key);
});

test("post-guard negative fixture is transaction-rolled-back and never permitted on live staging", async () => {
  const sql = await readFile(new URL("../scripts/sql/cafeos-local-postguards-negative-fixture.sql", import.meta.url), "utf8");
  assert.match(sql, /^begin;/im);
  assert.match(sql, /\\ir cafeos-staging-post-guards-readonly-gate\.sql/);
  assert.match(sql, /rollback;/im);
  assert.match(sql, /negative-financial-audit/);
  assert.doesNotMatch(sql, /service_role|wjatnyvdygvblirggdcm|migration repair|db push/i);
});


test("portable staging backup candidate never writes plaintext or targets production", async () => {
  const source = await readFile(
    new URL("../scripts/backup-cafeos-staging-age.sh", import.meta.url), "utf8"
  );
  assert.match(source, /set -euo pipefail/);
  assert.match(source, /wjatnyvdygvblirggdcm/);
  assert.match(source, /PGSSLMODE.*verify-full/);
  assert.match(source, /PGPASSFILE/);
  assert.match(source, /PGSSLROOTCERT/);
  assert.match(source, /CAFEOS_AGE_RECIPIENTS/);
  assert.match(source, /CAFEOS_AGE_IDENTITY/);
  assert.match(source, /receipt_versions/);
  assert.match(source, /default_transaction_read_only=on/);
  assert.match(source, /pg_dump -w -Fc --dbname=postgres \| age -R/);
  assert.match(source, /pg_dumpall -w --globals-only --no-role-passwords \| age -R/);
  assert.match(source, /age -d -i.*pg_restore --list/s);
  assert.match(source, /sha256sum database\.pgdump\.age globals\.sql\.age > manifest\.sha256/);
  assert.match(source, /mv --no-clobber --no-target-directory -- "\$work" "\$final"/);
  assert.match(source, /sha256sum -c manifest\.sha256/);
  assert.match(source, /RESTORE_NOT_YET_PROVEN/);
  assert.doesNotMatch(source, /supabase migration repair|supabase db push|--linked|supabase db reset|service_role|sb_secret_/i);
});


test("portable staging backup candidate shell parses and refuses missing/wrong target", async () => {
  const executable = fileURLToPath(new URL("../scripts/backup-cafeos-staging-age.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", executable], { encoding: "utf8", timeout: 6000 });
  assert.equal(syntax.status, 0, "backup shell syntax is invalid: " + syntax.stderr);
  const empty = spawnSync("bash", [executable], {
    env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 6000
  });
  assert.notEqual(empty.status, 0, "missing target details must be refused");
  const hostile = spawnSync("bash", [executable], {
    env: {
      PATH: process.env.PATH, PGHOST: "db.unrelated.supabase.co",
      PGUSER: "postgres", PGDATABASE: "postgres", PGPORT: "5432",
      PGSSLMODE: "verify-full", PGPASSFILE: "/tmp/not-used",
      PGSSLROOTCERT: "/tmp/not-used", CAFEOS_BACKUP_DIR: "/tmp",
      CAFEOS_AGE_RECIPIENTS: "/tmp/not-used",
      CAFEOS_AGE_IDENTITY: "/tmp/not-used"
    },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(hostile.status, 0, "non-CafeOS host must be refused");
  assert.match(hostile.stderr, /pinned CafeOS staging/i);
});


test("encrypted database restore rehearsal is hard-pinned to disposable loopback databases", async () => {
  const script = await readFile(new URL("../scripts/run-local-age-backup-drill.sh", import.meta.url),"utf8");
  const source = fileURLToPath(new URL("../scripts/run-local-age-backup-drill.sh", import.meta.url));
  const syntax = spawnSync("bash",["-n",source],{encoding:"utf8",timeout:6000});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.match(script,/127\.0\.0\.1:54322/);
  assert.match(script,/age-keygen -o "\$tmp\/identity"/);
  assert.match(script,/requires PostgreSQL client major 17/);
  assert.match(script,/pg_dump -w -Fc.*\| age -R/);
  assert.match(script,/pg_dumpall -w --globals-only --no-role-passwords/);
  assert.match(script,/age -d -i.*pg_restore --no-owner/s);
  assert.match(script,/CAFEOS_LOCAL_AGE_BACKUP_RESTORE_PASS/);
  assert.match(script,/trap cleanup EXIT/);
  assert.doesNotMatch(script,/wjatnyvdygvblirggdcm|--linked|supabase link|PGHOST=.*supabase\.co|SUPABASE_ACCESS_TOKEN|service_role|sb_secret_/i);
});
