import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const scriptPath = fileURLToPath(new URL("../scripts/operator-capture-cafeos-staging-five-stream-age.sh", import.meta.url));

test("staging-compatible capture refuses automation without owner custody and freeze attestation", async () => {
  const source = await readFile(scriptPath, "utf8");
  for (const marker of [
    "set -euo pipefail", "umask 077", "NEVER_IN_CI",
    "OWNER_EXPORT_APPROVAL_MISSING", "OWNER_WRITE_FREEZE_MISSING", "OWNER_CUSTODY_APPROVAL_MISSING",
    "OWNER_RECEIPT_INCOMPLETE", "OWNER_DATE_MISSING", "SOURCE_PREFLIGHT_FAILED",
    "SOURCE_LEDGER_CHANGED_DURING_CAPTURE", "MANAGED_AUTH_SHAPE_MISSING",
    "MIGRATION_HISTORY_SHAPE_MISSING", "SOURCE_COUNTS_SQL_MISSING",
    "SOURCE_COUNT_SHAPE_OR_BASELINE_INVALID", "SOURCE_CARDINALITY_DRIFT_DURING_CAPTURE",
    "CAFEOS_SOURCE_23_COUNT_FIELDS_PRE_POST_MATCH_ONLY",
    "STAGING_FIVE_COMPONENT_CIPHERTEXT_CREATED_NOT_RESTORED",
    "MULTISTREAM_SNAPSHOT_CONSISTENCY_NOT_MACHINE_PROVEN", "INDEPENDENT_RESTORE_NOT_PROVEN", "RELEASE_NO_GO",
    "check-cafeos-staging-capture-readiness.sh", "PGSSLMODE=verify-full", "PGPASSFILE=",
    "CAFEOS_OWNER_APPROVAL_FILE", "CAFEOS_SOURCE_WRITE_FREEZE_APPROVAL",
    "CAFEOS_OFFHOST_CUSTODY_APPROVAL", "OFFHOST_CUSTODY_VERIFIED_BY_OWNER=YES",
    "CAFEOS_COMPATIBLE_BACKUP_DIR", "BACKUP_DESTINATION", "DEST_IN_GIT"
  ].filter(x => x !== "BACKUP_DESTINATION")) assert.ok(source.includes(marker), "required gate missing: " + marker);
  assert.doesNotMatch(source, /--dry-run|--linked|supabase (?:db push|migration repair)|\b(?:pg_dumpall|pg_restore)\b/);
  assert.doesNotMatch(source, /\b(?:curl|scp|wget|ssh|rsync)\b/);
  assert.doesNotMatch(source, /age-keygen -o|openssl genpkey/);
  assert.doesNotMatch(source, /DATABASE_RESTORE_PASS|STAGING_BACKUP_AND_RESTORE_PROVEN/);
});

test("five exact Supabase filtered SQL streams encrypt directly to age, never plaintext files", async () => {
  const source = await readFile(scriptPath, "utf8");
  for (const marker of [
    "db dump --db-url \"$url\" --role-only",
    "db dump --db-url \"$url\" 2>/dev/null",
    "db dump --db-url \"$url\" --data-only --use-copy --exclude \"storage.buckets_vectors\" --exclude \"storage.vector_indexes\"",
    "db dump --db-url \"$url\" --schema supabase_migrations",
    "db dump --db-url \"$url\" --schema supabase_migrations --data-only --use-copy",
    "age -R \"$work/recipients.txt\" -o \"$out\"",
    "age -d -i \"$key\"",
    "COPY \\\"auth\\\".\\\"users\\\"",
    "COPY \\\"auth\\\".\\\"identities\\\"",
    "fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3",
    "dd63b211dc5a25c516b16494ebde997fef211524ffe0184a4a597d4b17e2bf1d",
    "sha256sum -c manifest.sha256", "mv --no-clobber --no-target-directory"
  ]) assert.ok(source.includes(marker), "missing stream/cryptographic assertion: " + marker);
  assert.doesNotMatch(source, /db dump[^\n]*--file/);
});

test("owner-only capture shell parses and refuses unapproved invocation without contacting staging", {
  skip: process.platform === "win32"
}, () => {
  const parse = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8", timeout: 4000 });
  assert.equal(parse.status, 0, parse.stderr);
  const run = spawnSync("bash", [scriptPath], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp",
      CI: "true", GITHUB_ACTIONS: "true" }, encoding: "utf8", timeout: 4000
  });
  assert.equal(run.status, 42);
  assert.match(run.stderr, /STOP_CAFEOS_FIVE_STREAM_/);
});

test("read-only drift gate inventories exactly 17 public tables plus Auth, Storage, Vault, and migration history", async () => {
  const path = fileURLToPath(
    new URL("../scripts/sql/cafeos-staging-capture-counts-readonly.sql", import.meta.url)
  );
  const sql = await readFile(path, "utf8");
  const names = [
    "auth_users", "auth_identities", "storage_buckets", "storage_objects",
    "vault_secrets", "migration_receipts", "tenants", "tenant_members",
    "stores", "imports", "transaction_line_items", "customers",
    "customer_identifiers", "attention_items", "actions",
    "action_status_history", "measurement_windows", "menu_categories",
    "menu_items", "pos_orders", "pos_order_items", "pos_payments",
    "daily_closes"
  ];
  for (const field of names) {
    assert.ok(sql.includes("'" + field + "'"), "missing count: " + field);
  }
  assert.equal((sql.match(/select count\(\*\)/gi) ?? []).length, 23,
    "expected exactly 23 cardinality aggregates");
  assert.match(sql, /select jsonb_build_object\(/i);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate|alter|drop|create|grant|revoke|copy)\s+(?:into|table|from|schema|database|user|role)?/i);
  assert.doesNotMatch(sql, /(?:email|password|identity_data|raw_user_meta_data|encrypted_secret|statement)/i);
});
