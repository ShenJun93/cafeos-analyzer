import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULTS = {
  supabaseUrl: "https://wjatnyvdygvblirggdcm.supabase.co",
  email: "cafeos.synthetic.a@example.com",
  allowedTenantId: "11111111-1111-4111-8111-111111111111",
  forbiddenTenantId: "22222222-2222-4222-8222-222222222222",
  teamSlug: "nvhoa1691993-6852s-projects",
  projectId: "prj_HG27M5PTKPJCrHUA0LPUOmsCrYIe",
  cliVersion: "59.20.0"
};

function fail(message) {
  throw new Error(message);
}

function parseProtectedCurl(stdout) {
  const marker = "__CAFEOS_STATUS__";
  const index = stdout.lastIndexOf(marker);
  if (index < 0) fail("Protected preview smoke could not read HTTP status from vercel curl");
  const bodyText = stdout.slice(0, index).trim();
  const statusText = stdout.slice(index + marker.length).trim().split(/\s+/)[0];
  const status = Number(statusText);
  if (!Number.isInteger(status)) fail("Protected preview smoke returned an invalid HTTP status");

  let body = null;
  if (bodyText) {
    try { body = JSON.parse(bodyText); }
    catch { fail("Protected preview smoke did not return JSON from CafeOS"); }
  }
  return { status, body };
}

function redactDiagnostic(text, headers = {}) {
  let redacted = String(text || "");
  for (const value of Object.values(headers)) {
    if (!value) continue;
    redacted = redacted.split(String(value)).join("[REDACTED]");
  }
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]");
  return redacted;
}

function runVercelCurl(path, {
  previewUrl,
  cliVersion,
  headers = {}
}) {
  const command = "npx";
  const useShell = process.platform === "win32";
  const args = [
    "--yes", `vercel@${cliVersion}`,
    "curl", path,
    "--deployment", previewUrl,
    "--",
    "--silent",
    "--show-error",
    "--write-out=__CAFEOS_STATUS__%{http_code}"
  ];

  let headerDir = null;
  try {
    if (Object.keys(headers).length > 0) {
      headerDir = mkdtempSync(join(tmpdir(), "cafeos-vercel-curl-"));
      const headerPath = join(headerDir, "headers.txt");
      const headerText = Object.entries(headers)
        .map(([name, value]) => `${name}: ${value}`)
        .join("\r\n") + "\r\n";
      writeFileSync(headerPath, headerText, { encoding: "utf8", mode: 0o600 });
      args.push("--header", `@${headerPath}`);
    }

    const result = spawnSync(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      shell: useShell
    });

    if (result.error) {
      fail(`Could not start Vercel CLI: ${redactDiagnostic(result.error.message, headers)}`);
    }
    if (result.status !== 0) {
      const diagnostic = redactDiagnostic(result.stderr, headers)
        .trim()
        .split("\n")
        .slice(-4)
        .join("\n");
      fail(`vercel curl failed with exit code ${result.status}${diagnostic ? `: ${diagnostic}` : ""}`);
    }
    return parseProtectedCurl(String(result.stdout || ""));
  }
  finally {
    if (headerDir) {
      rmSync(headerDir, { recursive: true, force: true });
    }
  }
}

async function signInSyntheticUser({ supabaseUrl, publishableKey, email, password, fetchImpl }) {
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch {}

  if (!response.ok || !payload?.access_token) {
    fail(`Synthetic Supabase Auth sign-in failed (HTTP ${response.status})`);
  }
  return payload.access_token;
}

function expect(result, status, code) {
  if (result.status !== status) {
    fail(`Expected HTTP ${status}, got ${result.status}`);
  }
  if (code && result.body?.error?.code !== code) {
    fail(`Expected ${code}, got ${result.body?.error?.code ?? "no error code"}`);
  }
}

export function verifyProtectedUnauthPreview({
  previewUrl,
  curlImpl = runVercelCurl,
  log = console.log
}) {
  if (!previewUrl) fail("Preview URL is required");
  if (new URL(previewUrl).hostname === "cafeos-analyzer.vercel.app") {
    fail("Protected smoke refuses the production alias");
  }

  const result = curlImpl("/api/app/session", {
    previewUrl,
    cliVersion: DEFAULTS.cliVersion
  });
  expect(result, 401, "AUTH_REQUIRED");
  log("PASS unauthenticated session -> 401 AUTH_REQUIRED");
  return { ok: true, previewUrl };
}

export async function verifyProtectedPreview({
  previewUrl,
  supabaseUrl = DEFAULTS.supabaseUrl,
  email = DEFAULTS.email,
  allowedTenantId = DEFAULTS.allowedTenantId,
  forbiddenTenantId = DEFAULTS.forbiddenTenantId,
  publishableKey,
  password,
  fetchImpl = globalThis.fetch,
  curlImpl = runVercelCurl,
  log = console.log
}) {
  if (!previewUrl) fail("Preview URL is required");
  if (!publishableKey?.startsWith("sb_publishable_")) fail("SUPABASE_PUBLISHABLE_KEY is required");
  if (!password) fail("Synthetic user password is required");
  if (new URL(previewUrl).hostname === "cafeos-analyzer.vercel.app") {
    fail("Authenticated smoke refuses the production alias");
  }

  const token = await signInSyntheticUser({
    supabaseUrl, publishableKey, email, password, fetchImpl
  });

  const base = {
    previewUrl,
    cliVersion: DEFAULTS.cliVersion
  };

  verifyProtectedUnauthPreview({ previewUrl, curlImpl, log });

  const authHeaders = { authorization: `Bearer ${token}` };
  const session = curlImpl("/api/app/session", { ...base, headers: authHeaders });
  expect(session, 200);
  if (!Array.isArray(session.body?.memberships) ||
      !session.body.memberships.some(x => x.tenantId === allowedTenantId)) {
    fail("Expected Synthetic Tenant A membership was not returned");
  }
  if (session.body.memberships.some(x => x.tenantId === forbiddenTenantId)) {
    fail("Synthetic user unexpectedly has Tenant B membership");
  }
  log("PASS authenticated session -> 200 with Tenant A only");

  for (const path of ["/api/app/stores", "/api/app/attention", "/api/app/brief"]) {
    const result = curlImpl(path, {
      ...base,
      headers: {
        ...authHeaders,
        "x-cafeos-tenant-id": allowedTenantId
      }
    });
    expect(result, 200);
    if (result.body?.tenant?.id !== allowedTenantId) {
      fail(`${path} did not return Tenant A context`);
    }
    if (path === "/api/app/brief") {
      if (result.body?.capabilities?.deterministicTopMetrics !== true) {
        fail("/api/app/brief did not enable deterministicTopMetrics");
      }
      if (!result.body?.metrics || !result.body?.coverage || !Object.hasOwn(result.body, "asOfBusinessDate")) {
        fail("/api/app/brief did not return the deterministic Daily Brief contract");
      }
    }
    log(`PASS Tenant A ${path} -> 200`);
  }

  const forbidden = curlImpl("/api/app/stores", {
    ...base,
    headers: {
      ...authHeaders,
      "x-cafeos-tenant-id": forbiddenTenantId
    }
  });
  expect(forbidden, 403, "TENANT_FORBIDDEN");
  log("PASS Tenant B selection -> 403 TENANT_FORBIDDEN");

  const invalid = curlImpl("/api/app/session", {
    ...base,
    headers: { authorization: "Bearer invalid.synthetic.jwt" }
  });
  expect(invalid, 401, "AUTH_INVALID");
  log("PASS invalid JWT -> 401 AUTH_INVALID");

  return { ok: true, previewUrl, allowedTenantId, forbiddenTenantId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const previewUrl = process.argv[2];
  const unauthOnly = process.argv.includes("--unauth-only");

  if (unauthOnly) {
    const result = verifyProtectedUnauthPreview({ previewUrl });
    console.log(`CONTROL TOWER UNAUTHENTICATED PREVIEW SMOKE PASS ${result.previewUrl}`);
  }
  else {
    const result = await verifyProtectedPreview({
      previewUrl,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      password: process.env.CAFEOS_TEST_USER_PASSWORD
    });
    console.log(`CONTROL TOWER AUTHENTICATED PREVIEW SMOKE PASS ${result.previewUrl}`);
  }
}
