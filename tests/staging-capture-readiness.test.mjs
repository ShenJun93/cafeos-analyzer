import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../scripts/check-cafeos-staging-capture-readiness.sh", import.meta.url));

test("staging capture readiness is inspection-only and fails closed without owner approval", async () => {
  const source = await readFile(path, "utf8");
  for (const marker of [
    "set -euo pipefail", "umask 077",
    "SOURCE_READONLY_ONLY", "NOT_FOR_CI", "OWNER_ACK_REQUIRED",
    "check-cafeos-staging-readonly-verifyfull.sh",
    "PRIVATE_DIRECTORY_INSIDE_GIT", "PRIVATE_FILE_MODE",
    "identity-recovery.age", "expected-recipient.txt", "recovery-recipient.txt",
    "ESCROW_MANIFEST_PIN_DRIFT", "ESCROW_MEMBER_DIGEST_DRIFT",
    "SOURCE_KEY_RECIPIENT_MISMATCH", "INDEPENDENT_RECIPIENT_INVALID",
    "STAGING_CA_PIN_DRIFT", "CLI_VERSION_DRIFT",
    "CAFEOS_LOCAL_SOURCE_CRYPTO_AND_ESCROW_PREFLIGHT_PASS",
    "CAFEOS_OWNER_INDEPENDENT_PHYSICAL_CUSTODY_ATTESTATION_PENDING",
    "CAFEOS_REAL_SUPABASE_COMPATIBLE_BACKUP_NOT_AUTHORIZED_OR_EXECUTED",
    "CAFEOS_INDEPENDENT_DATABASE_RESTORE_NOT_PROVEN", "CAFEOS_RELEASE_NO_GO"
  ]) assert.ok(source.includes(marker), "missing fail-closed gate: " + marker);
  // A preflight is forbidden from exporting, restoring, mutating, rekeying,
  // creating synthetic claims of off-host custody or writing to DB.
  assert.doesNotMatch(source, /\b(?:pg_dump|pg_dumpall|pg_restore|supabase db dump|supabase db push|migration repair|psql -c (?:insert|update|delete))\b/i);
  assert.doesNotMatch(source, /\b(?:curl|wget|scp|ssh|rsync|base64)\b/);
  assert.doesNotMatch(source, /\b(?:rm -rf|docker stop|docker rm|create role|create database)\b/i);
});

test("staging capture readiness syntax and CI refusal require no real source or private key", {
  skip: process.platform === "win32"
}, () => {
  const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8", timeout: 5000 });
  assert.equal(syntax.status, 0, syntax.stderr);

  const attempt = spawnSync("bash", [path], {
    env: { ...process.env, GITHUB_ACTIONS: "true", CI: "true",
      CAFEOS_STAGING_READONLY_PREFLIGHT_ACK: "SOURCE_READONLY_ONLY" },
    encoding: "utf8", timeout: 5000
  });
  assert.equal(attempt.status, 12);
  assert.match(attempt.stdout + attempt.stderr, /STOP_CAFEOS_CAPTURE_PREFLIGHT_NOT_FOR_CI/);
});
