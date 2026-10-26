import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assert.match(source, /CAFEOS_EXPECTED_RECEIPT_SHA256/);
  assert.match(source, /ledger_hash_before.*CAFEOS_EXPECTED_RECEIPT_SHA256/);
  assert.match(source, /DB credential file cannot be inside a Git working tree/);
  assert.match(source, /receipt_versions/);
  assert.match(source, /ledger_hash_before="\$\(ledger_fingerprint\)"/);
  assert.match(source, /ledger_hash_after="\$\(ledger_fingerprint\)"/);
  assert.match(source, /ledger_hash_after.*ledger_hash_before/);
  assert.match(source, /source-ledger-sha256\.txt/);
  assert.match(source, /cannot be inside a Git working tree/);
  assert.match(source, /age private identity must have file mode 0600 or 0400/);
  assert.match(source, /default_transaction_read_only=on/);
  assert.match(source, /pg_dump -w -Fc --dbname=postgres \| age -R/);
  assert.match(source, /pg_dumpall -w --globals-only --no-role-passwords \| age -R/);
  assert.match(source, /age -d -i.*pg_restore --list/s);
  assert.doesNotMatch(source, /pg_restore --list -/);
  assert.match(source, /sha256sum database\.pgdump\.age globals\.sql\.age source-ledger-sha256\.txt > manifest\.sha256/);
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
      CAFEOS_AGE_IDENTITY: "/tmp/not-used",
      CAFEOS_EXPECTED_RECEIPT_SHA256: "fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3"
    },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(hostile.status, 0, "non-CafeOS host must be refused");
  assert.match(hostile.stderr, /pinned CafeOS staging/i);
});


test("portable backup rejects missing or invalid independent receipt SHA-256 without DB access", () => {
  const executable = fileURLToPath(new URL("../scripts/backup-cafeos-staging-age.sh", import.meta.url));
  const base = {
    PATH: process.env.PATH, PGHOST: "db.wjatnyvdygvblirggdcm.supabase.co",
    PGUSER: "postgres", PGDATABASE: "postgres", PGPORT: "5432",
    PGSSLMODE: "verify-full", PGPASSFILE: "/path/not-used",
    PGSSLROOTCERT: "/path/not-used", CAFEOS_BACKUP_DIR: "/path/not-used",
    CAFEOS_AGE_RECIPIENTS: "/path/not-used", CAFEOS_AGE_IDENTITY: "/path/not-used"
  };
  for (const invalid of ["invalid", "f".repeat(63), "F".repeat(64)]) {
    const result = spawnSync("bash", [executable], {
      env: { ...base, CAFEOS_EXPECTED_RECEIPT_SHA256: invalid },
      encoding: "utf8", timeout: 6000
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /STOP: invalid independently attested receipt SHA-256/);
  }
  const missing = spawnSync("bash", [executable], {
    env: base, encoding: "utf8", timeout: 6000
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /CAFEOS_EXPECTED_RECEIPT_SHA256/);
});

test("portable staging backup rejects a pre-existing receipt SQL drift before dump", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cafeos-ledger-attestation-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const bin = join(root, "bin");
  const output = join(root, "out");
  await mkdir(bin);
  await mkdir(output, { mode: 0o700 });
  await chmod(output, 0o700);
  for (const name of ["pg_dump", "pg_dumpall", "pg_restore", "age"]) {
    const file = join(bin, name);
    await writeFile(file, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'PostgreSQL 18.6'; exit 0; fi\nexit 99\n");
    await chmod(file, 0o700);
  }
  const psql = join(bin, "psql");
  await writeFile(psql, "#!/bin/sh\necho '" + "b".repeat(64) + "'\n");
  await chmod(psql, 0o700);
  for (const name of ["pgpass", "ca.pem", "recipient", "identity"]) {
    const file = join(root, name);
    await writeFile(file, "synthetic-test-only\\n", { mode: 0o600 });
    await chmod(file, 0o600);
  }
  const script = fileURLToPath(new URL("../scripts/backup-cafeos-staging-age.sh", import.meta.url));
  const result = spawnSync("bash", [script], {
    env: {
      PATH: bin + ":" + process.env.PATH, PGHOST: "db.wjatnyvdygvblirggdcm.supabase.co",
      PGUSER: "postgres", PGDATABASE: "postgres", PGPORT: "5432",
      PGSSLMODE: "verify-full", PGPASSFILE: join(root, "pgpass"),
      PGSSLROOTCERT: join(root, "ca.pem"), CAFEOS_BACKUP_DIR: output,
      CAFEOS_AGE_RECIPIENTS: join(root, "recipient"),
      CAFEOS_AGE_IDENTITY: join(root, "identity"),
      CAFEOS_EXPECTED_RECEIPT_SHA256: "a".repeat(64)
    },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /STOP: live original receipt SQL differs from the independent attestation/);
  assert.deepEqual(await import("node:fs/promises").then(({ readdir }) => readdir(output)), []);
});

test("portable staging backup refuses a pgpass file from any Git working tree before connecting", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cafeos-pgpass-git-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const gitDir = join(root, "credential-repo");
  const backupDir = join(root, "encrypted-out");
  await mkdir(gitDir);
  await mkdir(backupDir, { mode: 0o700 });
  await chmod(backupDir, 0o700);
  const gitInit = spawnSync("git", ["init", "-q", gitDir], { encoding: "utf8" });
  assert.equal(gitInit.status, 0, gitInit.stderr);
  const passfile = join(gitDir, "pgpass");
  const identity = join(root, "identity");
  const ca = join(root, "root-ca.pem");
  const recipient = join(root, "recipient");
  for (const p of [passfile, identity, ca, recipient]) {
    await writeFile(p, "synthetic-test-only\\n", { mode: 0o600 });
    await chmod(p, 0o600);
  }
  const script = fileURLToPath(new URL("../scripts/backup-cafeos-staging-age.sh", import.meta.url));
  const result = spawnSync("bash", [script], {
    env: {
      PATH: process.env.PATH,
      PGHOST: "db.wjatnyvdygvblirggdcm.supabase.co",
      PGUSER: "postgres", PGDATABASE: "postgres", PGPORT: "5432",
      PGSSLMODE: "verify-full", PGPASSFILE: passfile,
      PGSSLROOTCERT: ca, CAFEOS_BACKUP_DIR: backupDir,
      CAFEOS_AGE_RECIPIENTS: recipient, CAFEOS_AGE_IDENTITY: identity,
      CAFEOS_EXPECTED_RECEIPT_SHA256: "fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3"
    },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DB credential file cannot be inside a Git working tree/);
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
  assert.doesNotMatch(script,/pg_restore --no-owner --no-acl --exit-on-error --dbname="\$restore_url" -/);
  assert.match(script,/trap cleanup EXIT/);
  assert.doesNotMatch(script,/wjatnyvdygvblirggdcm|--linked|supabase link|PGHOST=.*supabase\.co|SUPABASE_ACCESS_TOKEN|service_role|sb_secret_/i);
});


test("migration ledger checksum SQL remains read-only and used in local mutation negative control", async () => {
  const sql = await readFile(new URL("../scripts/sql/cafeos-staging-receipt-fingerprint.sql", import.meta.url),"utf8");
  assert.match(sql.replace(/^\s*--.*$/gm,"").trimStart(), /^select\s+encode\(/i);
  assert.equal((sql.match(/;/g)||[]).length,1);
  assert.match(sql,/sha256\(convert_to/);
  assert.match(sql,/version \|\| chr\(31\)/);
  assert.match(sql,/coalesce\(name/);
  assert.match(sql,/array_to_string\(statements/);
  assert.doesNotMatch(sql,/\b(?:insert|update|delete|drop|create|alter|grant|revoke|truncate)\s+(?:table|function|into|from|schema|on|set)?\b/i);
  const drill = await readFile(new URL("../scripts/run-local-age-backup-drill.sh", import.meta.url),"utf8");
  assert.match(drill,/changed_fp.*baseline_fp/);
  assert.match(drill,/tampered synthetic SQL/);
  assert.match(drill,/baseline_fp/);
});
