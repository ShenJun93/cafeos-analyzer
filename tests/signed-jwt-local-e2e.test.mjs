import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const runnerPath = fileURLToPath(new URL("../scripts/run-local-cafeos-signed-jwt-e2e.sh", import.meta.url));
const pythonPath = fileURLToPath(new URL("../scripts/run-local-cafeos-signed-jwt-e2e.py", import.meta.url));

test("GoTrue E2E operates only on dedicated local synthetic containers, not staging", async () => {
  const script = await readFile(pythonPath, "utf8");
  for (const marker of [
    "http://127.0.0.1:55321",
    "supabase_db_cafeos-e2e-isolated-20261030",
    "supabase_kong_cafeos-e2e-isolated-20261030",
    "auth/v1/signup",
    "/auth/v1/user",
    "GOTRUE_AUTHENTICATED_JWT_",
    "RLS_TENANT_VISIBILITY_",
    "RLS_STORE_VISIBILITY_",
    "SIGNED_CASHIER_CREATE_ORDER_EXACT_CENTS",
    "SIGNED_CASHIER_CAPTURE_PAYMENT",
    "SIGNED_OWNER_CLOSE_EXACT_TOTALS",
    "SIGNED_REVOKED_VIEWER_JWT_NO_RLS_ACCESS",
    "ZERO_SNAPSHOT",
    "POST_CLEANUP_COUNTS=",
    "SYNTHETIC_FIXTURE_RESIDUE",
    "finally:"
  ]) assert.ok(script.includes(marker), "missing E2E safety/acceptance marker: " + marker);
  assert.doesNotMatch(script, /wjatnyvdygvblirggdcm|supabase\.co|supabase db push|migration repair|--linked|PGPASSWORD|\bshell=True\b/i);
  assert.doesNotMatch(script, /print\([^\n]*(?:access_token|password|service_role)/);
});

test("signed JWT E2E wrapper requires explicit opt-in, exact local stack and guaranteed Docker cleanup", async () => {
  const script = await readFile(runnerPath, "utf8");
  for (const marker of [
    "set -euo pipefail",
    "CAFEOS_LOCAL_E2E_ACK",
    "ONLY_SYNTHETIC",
    "CAFEOS_LOCAL_E2E_WILDCARD_PORT_ACK",
    "cafeos-e2e-isolated-20261030",
    "another local E2E test owns this lock",
    "Docker project identity unexpected",
    "refusing to take ownership",
    "docker stop --time 8",
    "trap cleanup EXIT",
    "python3",
    "STAGING_NOT_ACCESSED"
  ]) assert.ok(script.includes(marker), "missing synthetic runner guard: " + marker);
  assert.doesNotMatch(script, /wjatnyvdygvblirggdcm|supabase\.co|supabase db (?:dump|push)|migration repair|docker (?:rm|volume rm|system prune)/i);
});

test("local GoTrue E2E sources parse without running any fixtures or contacting Docker", { skip: process.platform === "win32" }, () => {
  const bash = spawnSync("bash", ["-n", runnerPath], { encoding: "utf8", timeout: 5000 });
  assert.equal(bash.status, 0, bash.stderr);
  const python = spawnSync("python3", [
    "-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())", pythonPath
  ], { encoding: "utf8", timeout: 5000 });
  assert.equal(python.status, 0, python.stderr);
});
