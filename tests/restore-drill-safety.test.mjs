import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// These integration checks execute Bash scripts using POSIX paths, chmod and Unix
// temporary files. On Windows, 'bash' may resolve to WSL and cannot consume the
// Win32 paths passed by Node. Linux CI runs every one of these tests unskipped.
const posixShellOnly = process.platform === "win32"
  ? { skip: "POSIX Bash/filesystem integration runs on Linux CI; Windows paths are incompatible" }
  : {};

test("Commerce concurrency drill is pinned to disposable localhost and exercises four true SQL sessions", async () => {
  const source = await readFile(new URL("../scripts/run-local-commerce-concurrency-drill.sh", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/supabase-db.yml", import.meta.url), "utf8");
  assert.match(source, /readonly DB_URL="postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres"/);
  assert.match(source, /pg_isready -h 127\.0\.0\.1 -p 54322/);
  assert.match(source, /current_database\(\)\|\|':'\|\|current_user/);
  assert.match(source, /set local role authenticated/);
  assert.match(source, /set local request\.jwt\.claim\.sub/);
  assert.match(source, /CAFEOS_LOCK_HELD/);
  for (const marker of [
    "CAFEOS_RACE_SAME_KEY_SINGLE_ORDER_PASS",
    "CAFEOS_RACE_DOUBLE_CAPTURE_DENIED_PASS",
    "CAFEOS_RACE_OPEN_ORDER_BLOCKS_CLOSE_PASS",
    "CAFEOS_RACE_CLOSE_BLOCKS_NEW_ORDER_PASS",
    "CAFEOS_LOCAL_COMMERCE_CONCURRENCY_PASS"
  ]) assert.ok(source.includes(marker), marker);
  assert.match(workflow, /run: bash scripts\/run-local-commerce-concurrency-drill\.sh/);
  assert.match(source, /trap cleanup EXIT/);
  assert.doesNotMatch(source, /wjatnyvdygvblirggdcm|supabase\.co|--linked|supabase link|migration repair|db push|SUPABASE_ACCESS_TOKEN|service_role|sb_secret_/i);
});

test("Commerce concurrent SQL sessions are syntactically valid and refuse execution without localhost", posixShellOnly, () => {
  const path = fileURLToPath(new URL("../scripts/run-local-commerce-concurrency-drill.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8", timeout: 6000 });
  assert.equal(syntax.status, 0, syntax.stderr);
  const attempt = spawnSync("bash", [path], {
    env: { PATH: process.env.PATH },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(attempt.status, 0, "must fail without an isolated local Supabase target");
});

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
  assert.match(source, /RAW_PG_DUMP_NOT_SUPABASE_RESTORE_CERTIFIED/);
  assert.match(source, /ledger_hash_before.*CAFEOS_EXPECTED_RECEIPT_SHA256/);
  assert.match(source, /DB credential file cannot be inside a Git working tree/);
  assert.match(source, /receipt_versions/);
  assert.match(source, /ledger_hash_before="\$\(ledger_fingerprint\)"/);
  assert.match(source, /ledger_hash_after="\$\(ledger_fingerprint\)"/);
  assert.match(source, /ledger_hash_after.*ledger_hash_before/);
  assert.match(source, /source-ledger-sha256\.txt/);
  assert.match(source, /cannot be inside a Git working tree/);
  assert.match(source, /age private identity must have file mode 0600 or 0400/);
  // Session Pooler does not reliably apply PGOPTIONS default_transaction_read_only.
  // Every ledger check must issue an explicit read-only transaction instead.
  assert.ok(source.includes("printf 'BEGIN TRANSACTION READ ONLY;\\n'"),
    "ledger fingerprint must BEGIN an explicit read-only transaction");
  assert.ok(source.includes('"BEGIN TRANSACTION READ ONLY; select string_agg'),
    "receipt version scan must BEGIN its own read-only transaction");
  assert.match(source, /psql -XqAtw/);
  assert.doesNotMatch(source, /export PGOPTIONS=.*default_transaction_read_only/);

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


test("portable staging backup candidate shell parses and refuses missing/wrong target", posixShellOnly, async () => {
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


test("portable backup rejects missing or invalid independent receipt SHA-256 without DB access", posixShellOnly, () => {
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

test("portable staging backup rejects a pre-existing receipt SQL drift before dump", posixShellOnly, async (t) => {
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
  await writeFile(psql, "#!/bin/sh\n# Consume piped read-only transaction SQL so the pipeline does not SIGPIPE.\ncat >/dev/null\necho '" + "b".repeat(64) + "'\n");
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

test("portable staging backup refuses a pgpass file from any Git working tree before connecting", posixShellOnly, async (t) => {
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

test("offline encrypted archive verifier requires independently pinned manifest and receipt hashes", posixShellOnly, async () => {
  const source = fileURLToPath(new URL("../scripts/verify-cafeos-staging-age-archive.sh", import.meta.url));
  const script = await readFile(source,"utf8");
  assert.match(script,/CAFEOS_EXPECTED_MANIFEST_SHA256/);
  assert.match(script,/CAFEOS_EXPECTED_RECEIPT_SHA256/);
  assert.match(script,/sha256sum database\.pgdump\.age globals\.sql\.age source-ledger-sha256\.txt/);
  assert.match(script,/age -d -i.*pg_restore --list/s);
  assert.match(script,/REAL_STAGING_DATABASE_RESTORE_NOT_PROVEN/);
  assert.doesNotMatch(script,/\b(?:pg_dump|pg_dumpall|createdb|dropdb)\b|supabase\s+(?:migration|db push)/i);
  const syntax = spawnSync("bash",["-n",source],{encoding:"utf8",timeout:6000});
  assert.equal(syntax.status,0,syntax.stderr);
  const noTrust = spawnSync("bash",[source],{env:{PATH:process.env.PATH},encoding:"utf8",timeout:6000});
  assert.notEqual(noTrust.status,0);
});

test("encrypted database restore rehearsal is hard-pinned to disposable loopback databases", posixShellOnly, async () => {
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
  assert.match(script,/verify-cafeos-staging-age-archive\.sh/);
  assert.match(script,/synthetic-tamper/);
  assert.match(script,/CAFEOS_SYNTHETIC_WRONG_MANIFEST_REJECTED/);
  assert.match(script,/CAFEOS_SYNTHETIC_WRONG_AGE_IDENTITY_REJECTED/);
  assert.match(script,/wrong-identity/);
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



test("legacy age passphrase escrow is disabled to prevent autogenerated secret disclosure", posixShellOnly, async () => {
  const old = new URL("../scripts/prepare-cafeos-age-recovery-escrow.sh", import.meta.url);
  const source = await readFile(old, "utf8");
  assert.match(source, /legacy age passphrase escrow DISABLED/);
  assert.match(source, /prepare-cafeos-age-recovery-recipient\.sh/);
  assert.doesNotMatch(source, /"\$age"\s+-p/);
  const path = fileURLToPath(old);
  const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8", timeout: 6000 });
  assert.equal(syntax.status, 0, syntax.stderr);
  const attempt = spawnSync("bash", [path], { input: "", encoding: "utf8", timeout: 6000 });
  assert.equal(attempt.status, 12);
  assert.match(attempt.stderr, /DISABLED/);
});

test("independent-recipient age recovery escrow requires external public key and never prompts", posixShellOnly, async () => {
  const file = new URL("../scripts/prepare-cafeos-age-recovery-recipient.sh", import.meta.url);
  const source = await readFile(file, "utf8");
  assert.match(source, /-t 0 && -t 1/);
  assert.match(source, /id -u/);
  assert.match(source, /"\$age" -R "\$offhost_file" -o "\$work\/identity-recovery\.age" "\$identity"/);
  assert.match(source, /"\$offhost_public" != "\$source_public"/);
  assert.match(source, /sha256sum identity-recovery\.age expected-recipient\.txt recovery-recipient\.txt/);
  assert.match(source, /OFF_HOST_RECOVERY_NOT_PROVEN/);
  assert.match(source, /age -d -i \/secure\/path\/to\/second-device-recovery-identity\.txt/);
  assert.match(source, /trusted independent/);
  assert.match(source, /rm -f -- "\$work\/identity-recovery\.age" "\$work\/expected-recipient\.txt"/);
  assert.doesNotMatch(source, /"\$age"\s+-p\b|autogenerated passphrase|curl |wget |service_role|supabase db push/i);
  const executable = fileURLToPath(file);
  const syntax = spawnSync("bash", ["-n", executable], { encoding: "utf8", timeout: 6000 });
  assert.equal(syntax.status, 0, syntax.stderr);
  const attempt = spawnSync("bash", [executable, "/tmp/synthetic-public-key-do-not-use"], {
    encoding: "utf8", input: "", timeout: 6000
  });
  assert.equal(attempt.status, 12, "must refuse noninteractive agent execution");
  assert.match(attempt.stderr, /interactive nonroot owner WSL terminal/);
});


test("independent age recovery verifier rejects escrow-only trust and never materializes decrypted key", async () => {
  const verify = await readFile(
    new URL("../scripts/verify-cafeos-age-recovery-offhost.sh", import.meta.url), "utf8"
  );
  const drill = await readFile(
    new URL("../scripts/run-local-age-offhost-recovery-drill.sh", import.meta.url), "utf8"
  );
  const producer = await readFile(
    new URL("../scripts/prepare-cafeos-age-recovery-recipient.sh", import.meta.url), "utf8"
  );
  assert.match(verify, /set -euo pipefail/);
  assert.match(verify, /run as nonroot owner/);
  assert.match(verify, /TRUSTED_SOURCE_PUBLIC_FILE TRUSTED_MANIFEST_SHA256_FILE/);
  assert.match(verify, /trust anchors\/private key cannot come from escrow/);
  assert.match(verify, /cannot be in Git/);
  assert.match(verify, /sha256sum identity-recovery\.age expected-recipient\.txt recovery-recipient\.txt RECOVER\.txt/);
  assert.match(verify, /cmp -s - "\$escrow\/manifest\.sha256"/);
  assert.match(verify, /age -d -i "\$recovery" "\$escrow\/identity-recovery\.age" \| age-keygen -y/);
  assert.match(verify, /CAFEOS_AGE_RECOVERY_CRYPTOGRAPHIC_READBACK_PASS/);
  assert.match(verify, /INDEPENDENT_DEVICE_CUSTODY_REQUIRES_OWNER_ATTESTATION/);
  assert.match(verify, /ACTUAL_STAGING_BACKUP_AND_DATABASE_RESTORE_NOT_PROVEN/);
  assert.doesNotMatch(verify, /\b(?:curl|wget|scp|ssh|nc|supabase|pg_dump|psql)\s/);
  assert.doesNotMatch(verify, /age -p|service_role|sb_secret_|SUPABASE_ACCESS_TOKEN/i);
  assert.match(producer, /CAFEOS_ESCROW_MANIFEST_SHA256=/);
  assert.match(producer, /verify-cafeos-age-recovery-offhost\.sh/);
  assert.match(drill, /age-keygen -o "\$root\/source-identity"/);
  assert.match(drill, /age-keygen -o "\$root\/recovery-identity"/);
  assert.match(drill, /wrong recipient private key/);
  assert.match(drill, /wrong independent source recipient/);
  assert.match(drill, /wrong independent manifest digest/);
  assert.match(drill, /trust anchor symlink/);
  assert.match(drill, /tampered encrypted identity/);
  assert.match(drill, /forged self-consistent manifest without external approval/);
  assert.match(drill, /CAFEOS_SYNTHETIC_OFFHOST_RECOVERY_DRILL_PASS/);
  assert.doesNotMatch(drill, /wjatnyvdygvblirggdcm|PGHOST=|SUPABASE_ACCESS_TOKEN|service_role/i);
});

// Recovery scope probe may read aggregate counts/catalog names ONLY; it is not
// a database dump, Auth export or a substitute for an actual isolated restore.
test("staging recovery scope is a single non-secret SELECT-only inventory with a permanent NO-GO label", async () => {
  const source = await readFile(
    new URL("../scripts/sql/cafeos-staging-recovery-scope-readonly.sql", import.meta.url),
    "utf8"
  );
  const sql = source.split("\n").filter(line => !/^\s*--/.test(line)).join("\n").trim();
  assert.match(sql, /^with\s+/i);
  assert.equal((sql.match(/;/g) || []).length, 1);
  assert.match(sql, /SCOPE_INVENTORY_ONLY_BACKUP_AND_RESTORE_NOT_PROVEN/);
  for (const path of [
    "auth.users", "auth.identities", "storage.buckets", "storage.objects",
    "vault.secrets", "supabase_migrations.schema_migrations",
    "public.tenants", "public.tenant_members", "public.stores",
    "public.imports", "public.transaction_line_items",
    "public.customers", "public.customer_identifiers",
    "public.attention_items", "public.actions", "public.action_status_history",
    "public.measurement_windows", "public.menu_categories", "public.menu_items",
    "public.pos_orders", "public.pos_order_items", "public.pos_payments",
    "public.daily_closes", "pg_extension", "pg_trigger", "pg_policies"
  ]) assert.ok(sql.includes(path), "missing aggregate scope: " + path);

  // Reject silent omission of currently persistent public tables from a backup
  // scope report. A newly deployed public table must force an inventory review.
  assert.match(sql, /public_table_catalog/);
  assert.match(sql, /public_table_count/);
  assert.match(sql, /public_scope_complete/);
  assert.match(sql, /array_agg\(c\.relname::text order by c\.relname\)/);
  const expectedTables = [
    "action_status_history", "actions", "attention_items", "customer_identifiers",
    "customers", "daily_closes", "imports", "measurement_windows",
    "menu_categories", "menu_items", "pos_order_items", "pos_orders",
    "pos_payments", "stores", "tenant_members", "tenants",
    "transaction_line_items"
  ];
  const guard = sql.match(/public_table_catalog\.names\s*=\s*array\[([\s\S]*?)\]::text\[\]/i);
  assert.ok(guard, "missing exact public catalog coverage guard");
  const catalogNames = [...guard[1].matchAll(/'([a-z_]+)'/g)].map(match => match[1]);
  assert.deepEqual(catalogNames, expectedTables, "inventory guard must pin all 17 public table names");

  assert.doesNotMatch(sql, /\b(?:insert|update|delete|create|alter|drop|truncate|grant|revoke|call|execute|copy)\b/i);
  assert.doesNotMatch(sql, /(?:pg_read_file|pg_ls_dir|lo_import|dblink|http_post|net\.http)/i);
  assert.doesNotMatch(sql, /\b(?:password|secret_key|service_role|access_token|refresh_token|raw_user_meta_data)\b/i);
  assert.doesNotMatch(sql, /\bselect\s+\*\s+from\s+(?:auth|storage|vault|public)\./i);
  assert.doesNotMatch(sql, /\b(?:current_setting\(['"]request\.jwt|auth\.jwt\(\)|auth\.uid\(\))/i);
});


test("staging source VERIFYFULL gate uses explicit READ ONLY and refuses credentials/receipt drift", async () => {
  const source = await readFile(
    new URL("../scripts/check-cafeos-staging-readonly-verifyfull.sh", import.meta.url),
    "utf8"
  );
  assert.match(source, /set -euo pipefail/);
  assert.match(source, /wjatnyvdygvblirggdcm/);
  assert.match(source, /PGSSLMODE=verify-full/);
  assert.match(source, /PGSSLROOTCERT/);
  assert.match(source, /PGPASSFILE/);
  assert.match(source, /PGCONNECT_TIMEOUT=8/);
  assert.match(source, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(source, /unset PGOPTIONS PGPASSWORD/);
  assert.match(source, /cafeos-staging-receipt-fingerprint\.sql/);
  assert.match(source, /fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3/);
  assert.match(source, /CAFEOS_STAGING_SEVEN_ORIGINAL_RECEIPTS_PASS/);
  assert.match(source, /EXPORT_AND_RESTORE_NOT_AUTHORIZED/);
  assert.doesNotMatch(source, /(?:pg_dump|pg_dumpall|supabase db dump|supabase db push|supabase migration|migration repair|\bpg_restore\b|service_role|sb_secret_)/i);
  assert.doesNotMatch(source, /(?:\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bDROP\s+TABLE\b)/i);
});

test("staging source VERIFYFULL gate parses and fails closed without protected owner files", posixShellOnly, () => {
  const script = fileURLToPath(new URL("../scripts/check-cafeos-staging-readonly-verifyfull.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", script], { encoding: "utf8", timeout: 6000 });
  assert.equal(syntax.status, 0, syntax.stderr);
  const attempt = spawnSync("bash", [script], {
    env: { PATH: process.env.PATH, HOME: "/nonexistent-cafeos-owner-fixture" },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(attempt.status, 0, "must refuse to run without protected real owner files");
  assert.match(attempt.stdout + attempt.stderr, /STOP_STAGING_CONFIG_DIRECTORY/);
});


test("synthetic Auth/history age restore refuses any remote source and preserves plaintext-free pipes", async () => {
  const source = await readFile(
    new URL("../scripts/run-local-auth-history-age-restore-drill.sh", import.meta.url),
    "utf8"
  );
  const workflow = await readFile(new URL("../.github/workflows/supabase-db.yml", import.meta.url), "utf8");
  for (const key of [
    "GITHUB_ACTIONS", "CI", "127.0.0.1:54322",
    "cafeos_ci_auth_hist_src", "cafeos_ci_auth_hist_dst",
    "auth.users", "auth.identities", "supabase_migrations.schema_migrations",
    "--no-owner --no-acl", "age -R", "age -d -i",
    "SET LOCAL session_replication_role=replica",
    "dropdb --maintenance-db=", "trap cleanup EXIT",
    "CAFEOS_SYNTHETIC_DISTINCT_DB_AUTH_HISTORY_AGE_RESTORE_PASS",
    "SAME_LOCAL_POSTGRES_SERVER_NOT_REAL_SUPABASE_RESTORE_NOT_OFFHOST"
  ]) assert.ok(source.includes(key), key);
  assert.match(workflow, /run: bash scripts\/run-local-auth-history-age-restore-drill\.sh/);
  assert.doesNotMatch(source, /wjatnyvdygvblirggdcm|supabase\.co|--linked|supabase link|supabase db push|supabase migration repair|PGPASSFILE|PGSSLROOTCERT|service_role|sb_secret_/i);
  assert.doesNotMatch(source, /supabase db reset|supabase stop|rm -rf.*\/mnt\/e/i);
});

test("synthetic Auth/history age restore is CI-only and shell-parses", posixShellOnly, () => {
  const path = fileURLToPath(new URL("../scripts/run-local-auth-history-age-restore-drill.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8", timeout: 6000 });
  assert.equal(syntax.status, 0, syntax.stderr);
  const attempt = spawnSync("bash", [path], {
    env: { PATH: process.env.PATH, CI: "", GITHUB_ACTIONS: "" },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(attempt.status, 0);
  assert.match(attempt.stderr, /STOP: disposable GitHub Actions environment required/);
});


test("real TLS Supabase CLI fixture proves correct CA acceptance and wrong CA rejection without staging", async () => {
  const source = await readFile(
    new URL("../scripts/check-cafeos-cli-dump-tls-negative-local.sh", import.meta.url), "utf8"
  );
  const research = await readFile(
    new URL("../docs/research/2026-10-29-cafeos-cli-dump-tls-no-go.md", import.meta.url), "utf8"
  );
  for (const marker of [
    "set -euo pipefail", "127.0.0.1", "55433", "cafeos-cleanroom-20261029",
    "cafeos-tls-fixture-20261029", "POSTGRES_DB=postgres",
    "hostnossl all all 0.0.0.0/0 reject", "show ssl",
    "pg_stat_ssl", "PGPASSFILE=", "PGSSLMODE=verify-full",
    "sslmode=verify-full", "sslrootcert=",
    "CAFEOS_PSQL_GOOD_CA_VERIFYFULL_PASS", "CAFEOS_PSQL_BAD_CA_REJECTED",
    "CAFEOS_CLI_GOOD_CA_ACCEPTED", "CAFEOS_CLI_BAD_CA_REJECTED_ON_TLS_SERVER",
    "STOP_CAFEOS_CLI_BAD_CA_ACCEPTED_ON_TLS_SERVER", "exit 42",
    "CAFEOS_LOCAL_TLS_CERT_TEST_PASS_ONLY_SYNTHETIC", "NO_STAGING_SOURCE_ACCESSED",
  ]) assert.ok(source.includes(marker), "missing local TLS marker: " + marker);
  assert.doesNotMatch(source, /wjatnyvdygvblirggdcm|aws-0-ap-southeast-1\.pooler|supabase db push|--linked|supabase link|migration repair|sb_secret_/i);
  assert.match(research, /TLS-ENABLED CA POSITIVE\/NEGATIVE TEST = \*\*PASS\*\*/);
  assert.match(research, /SSL-OFF \*\*REMOTE-ROUTE\*\* REQUIRED-TLS REJECTION = \*\*PASS\*\*/);
  assert.match(research, /STAGING BACKUP = \*\*NOT AUTHORIZED \/ NOT RUN\*\*/);
  assert.match(research, /RELEASE NO-GO/);
});

test("real TLS Supabase CLI fixture parses and fails closed if local cleanroom absent", posixShellOnly, () => {
  const path = fileURLToPath(new URL("../scripts/check-cafeos-cli-dump-tls-negative-local.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8", timeout: 6000 });
  assert.equal(syntax.status, 0, syntax.stderr);
  const attempt = spawnSync("bash", [path], {
    env: { PATH: process.env.PATH, HOME: "/nonexistent-cafeos-local-cli-fixture" },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(attempt.status, 0);
  assert.match(attempt.stdout + attempt.stderr, /STOP: pinned CLI absent/);
});


test("explicit SSL-off downgrade negative gate rejects strict TLS fallback and never reaches staging", async () => {
  const script = await readFile(
    new URL("../scripts/check-cafeos-cli-ssl-downgrade-local.sh", import.meta.url), "utf8"
  );
  for (const marker of [
    "set -euo pipefail", "127.0.0.1:54322", "cafeos-cleanroom-20261029",
    "supabase_db_cafeos-cleanroom-20261029", "show ssl",
    "require verify-ca verify-full", "PGPASSFILE",
    "STOP_CAFEOS_CLI_SSL_OFF_DOWNGRADE_", "STOP_CAFEOS_CLI_TLS_DOWNGRADE_GATE_FAILED",
    "CAFEOS_CLI_TLS_NO_DOWNGRADE_LOCAL_GATE_PASS", "exit 42",
    "SYNTHETIC_LOCAL_ONLY_STAGING_NOT_AUTHORIZED",
  ]) assert.ok(script.includes(marker), "missing anti-downgrade guard: " + marker);
  assert.doesNotMatch(script, /wjatnyvdygvblirggdcm|aws-0-ap-southeast-1\.pooler|--linked|supabase db push|migration repair|PGPASSWORD=/i);
});

test("explicit SSL-off downgrade negative gate shell-parses and refuses missing cleanroom", posixShellOnly, () => {
  const path = fileURLToPath(new URL("../scripts/check-cafeos-cli-ssl-downgrade-local.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8", timeout: 6000 });
  assert.equal(syntax.status, 0, syntax.stderr);
  const attempt = spawnSync("bash", [path], {
    env: { PATH: process.env.PATH, HOME: "/nonexistent-cafeos-fixture" },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(attempt.status, 0);
  assert.match(attempt.stdout + attempt.stderr, /STOP_PINNED_LOCAL_CLI_MISSING/);
});


test("CLI route-discrimination regression protects exact local versus remote SSL-off matrix", async () => {
  const script = await readFile(
    new URL("../scripts/check-cafeos-cli-db-url-routing-local.sh", import.meta.url), "utf8"
  );
  const ciScript = await readFile(
    new URL("../scripts/run-ci-cafeos-cli-tls-routing.sh", import.meta.url), "utf8"
  );
  const workflow = await readFile(
    new URL("../.github/workflows/cafeos-cli-tls-routing.yml", import.meta.url), "utf8"
  );
  for (const marker of [
    "set -euo pipefail", "127.0.0.1", "localhost",
    "54322", "show ssl", "auth.users", "PGPASSFILE=",
    "check '127.0.0.1' 'verify-full'",
    "check 'localhost' 'disable'",
    "check 'localhost' 'require'",
    "check 'localhost' 'verify-ca'",
    "check 'localhost' 'verify-full'",
    "STOP_REMOTE_PATH_FAILED_TO_REQUIRE_TLS_",
    "CAFEOS_CLI_2_122_0_LOCAL_REMOTE_TLS_ROUTE_PASS",
  ]) assert.ok(script.includes(marker), "missing local CLI route marker: " + marker);
  for (const marker of [
    "GITHUB_ACTIONS", "CI", "127.0.0.1", "localhost",
    "supabase --version", "2.122.0", "PGPASSFILE=",
    "STOP_REMOTE_TLS_DOWNGRADE_", "STOP_NOT_REMOTE_ROUTE_",
    "CAFEOS_CLI_2_122_0_ROUTE_TLS_CI_PASS",
    "LOCAL_DISPOSABLE_ONLY_STAGING_NOT_ACCESSED",
  ]) assert.ok(ciScript.includes(marker), "missing CI CLI route marker: " + marker);
  assert.match(workflow, /version: 2\.122\.0/);
  assert.match(workflow, /run: bash scripts\/run-ci-cafeos-cli-tls-routing\.sh/);
  assert.match(workflow, /supabase stop --no-backup/);
  assert.doesNotMatch(script + ciScript + workflow, /wjatnyvdygvblirggdcm|aws-0-ap-southeast-1\.pooler|supabase link|supabase db push|migration repair|sb_secret_/i);
});

test("CLI route-discrimination scripts parse and deny execution outside their authorized fixture", posixShellOnly, () => {
  for (const script of [
    "../scripts/check-cafeos-cli-db-url-routing-local.sh",
    "../scripts/run-ci-cafeos-cli-tls-routing.sh",
  ]) {
    const path = fileURLToPath(new URL(script, import.meta.url));
    const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8", timeout: 6000 });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  const path = fileURLToPath(new URL("../scripts/run-ci-cafeos-cli-tls-routing.sh", import.meta.url));
  const denied = spawnSync("bash", [path], {
    env: { PATH: process.env.PATH, GITHUB_ACTIONS: "", CI: "" },
    encoding: "utf8", timeout: 6000
  });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /STOP_GITHUB_ACTIONS_ONLY/);
});
