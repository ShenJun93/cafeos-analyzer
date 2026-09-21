import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyControlTowerPreview } from "../scripts/verify-control-tower-preview.mjs";
import {
  verifyProtectedPreview,
  verifyProtectedUnauthPreview
} from "../scripts/verify-control-tower-protected-preview.mjs";

const PREVIEW = "https://cafeos-analyzer-wave26-example.vercel.app";
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";
const USER_A = "a0000000-0000-4000-8000-000000000001";
const STORE_A = "11000000-0000-4000-8000-000000000001";
const TOKEN = "synthetic-user-jwt";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("preview deploy launcher uses Vercel API upsert and keeps preview-only safety", async () => {
  const ps = await readFile(new URL("../scripts/deploy-control-tower-preview.ps1", import.meta.url), "utf8");
  assert.match(ps, /function Invoke-VercelCli/i);
  assert.match(ps, /\$ErrorActionPreference = "Continue"/);
  assert.match(ps, /\$exitCode = \$LASTEXITCODE/);
  assert.match(ps, /\$teamId = "team_kVjgE7Q1dpEiDcANdPZqYEaS"/);
  assert.match(ps, /\$teamSlug = "nvhoa1691993-6852s-projects"/);
  assert.match(ps, /\$projectId = "prj_HG27M5PTKPJCrHUA0LPUOmsCrYIe"/);
  assert.match(ps, /\/v10\/projects\/\$projectId\/env\?teamId=\$teamId&upsert=true/);
  assert.match(ps, /"api", \$endpoint,[\s\S]*"-X", "POST",[\s\S]*"--input", "-",[\s\S]*"--raw"/i);
  assert.match(ps, /target = @\("preview"\)/i);
  assert.match(ps, /type = "encrypted"/i);
  assert.match(ps, /ConvertTo-Json -Compress/i);
  assert.match(ps, /\/v10\/projects\/\$projectId\/env\?teamId=\$teamId&target=preview/);
  assert.match(ps, /"api", \$envEndpoint,[\s\S]*"--raw"/i);
  assert.match(ps, /"deploy", "--yes",[\s\S]*"--scope", \$teamSlug,[\s\S]*"--project", \$projectId/i);
  assert.doesNotMatch(ps, /"env", "add"/i);
  assert.doesNotMatch(ps, /"env", "rm"/i);
  assert.doesNotMatch(ps, /"env", "ls"/i);
  assert.doesNotMatch(ps, /VERCEL_ORG_ID/i);
  assert.doesNotMatch(ps, /VERCEL_PROJECT_ID/i);
  assert.match(ps, /-HasInput/);
  assert.match(ps, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(ps, /Read-Host "Staging SUPABASE_PUBLISHABLE_KEY \(sb_publishable_\.\.\.\)" -AsSecureString/);
  assert.match(ps, /SecureStringToBSTR\(\$securePublishableKey\)/);
  assert.match(ps, /\$publishableKey = \$publishableKey\.Trim\(\)/);
  assert.match(ps, /Substring\(1, \$publishableKey\.Length - 2\)\.Trim\(\)/);
  assert.match(ps, /Invalid publishable key format after normalization \(length=\$enteredLength\)/);
  assert.match(ps, /ZeroFreeBSTR\(\$publishableKeyPtr\)/);
  assert.match(ps, /sb_publishable_/);
  assert.match(ps, /production alias will not be promoted/i);
  assert.match(ps, /verify-control-tower-protected-preview\.mjs \$previewUrl --unauth-only/i);
  assert.match(ps, /cafeos-control-tower-preview-url\.txt/i);
  assert.match(ps, /Required Vercel preview variable is missing after API upsert/i);
  assert.doesNotMatch(ps, /verify-control-tower-preview\.mjs \$previewUrl --unauth-only/i);
  assert.doesNotMatch(ps, /--prod\b/i);
  assert.doesNotMatch(ps, /sb_publishable_[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(ps, /service_role/i);
  assert.doesNotMatch(ps, /SUPABASE_SECRET/i);
});

test("unauthenticated preview smoke requires AUTH_REQUIRED", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ error: { code: "AUTH_REQUIRED", message: "Sign in is required" } }, 401);
  };

  const result = await verifyControlTowerPreview({
    baseUrl: PREVIEW,
    unauthOnly: true,
    fetchImpl,
    log: () => {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "unauth-only");
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/api/app/session");
});

test("authenticated preview smoke proves own-tenant success and cross-tenant denial", async () => {
  const seen = [];
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const auth = options.headers?.authorization;
    const tenant = options.headers?.["x-cafeos-tenant-id"];
    seen.push({ path: u.pathname, auth, tenant });

    if (u.pathname === "/api/app/session" && !auth) {
      return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    }
    if (u.pathname === "/api/app/session" && auth === "Bearer invalid.synthetic.jwt") {
      return jsonResponse({ error: { code: "AUTH_INVALID" } }, 401);
    }
    if (u.pathname === "/api/app/session" && auth === `Bearer ${TOKEN}`) {
      return jsonResponse({
        user: { id: "a0000000-0000-4000-8000-000000000001" },
        memberships: [{ tenantId: TENANT_A, role: "owner", name: "Cafe A" }]
      });
    }
    if (tenant === TENANT_B) {
      return jsonResponse({ error: { code: "TENANT_FORBIDDEN" } }, 403);
    }
    if (tenant === TENANT_A && u.pathname === "/api/app/stores") {
      return jsonResponse({
        tenant: { id: TENANT_A, role: "owner" },
        stores: [{ id: STORE_A, name: "Store A", timezone: "Asia/Ho_Chi_Minh", active: true }]
      });
    }
    if (tenant === TENANT_A && u.pathname === "/api/app/brief") {
      return jsonResponse({
        tenant: { id: TENANT_A, role: "owner" },
        asOfBusinessDate: "2026-09-21",
        coverage: { activeStores: 1, storesRepresented: 1 },
        metrics: { netSales: {}, orders: {}, aov: {} },
        capabilities: { deterministicTopMetrics: true }
      });
    }
    if (tenant === TENANT_A && u.pathname === "/api/app/store-health") {
      return jsonResponse({
        tenant: { id: TENANT_A, role: "owner" },
        store: { id: STORE_A, name: "Store A", timezone: "Asia/Ho_Chi_Minh", active: true },
        asOfBusinessDate: "2026-09-21",
        coverage: { currentHasData: true },
        metrics: { netSales: {}, orders: {}, aov: {} },
        capabilities: { deterministicMetrics: true }
      });
    }
    if (tenant === TENANT_A && u.pathname === "/api/app/attention") {
      return jsonResponse({ tenant: { id: TENANT_A, role: "owner" } });
    }
    return jsonResponse({ error: { code: "UNEXPECTED" } }, 500);
  };

  const result = await verifyControlTowerPreview({
    baseUrl: PREVIEW,
    token: TOKEN,
    tenantId: TENANT_A,
    forbiddenTenantId: TENANT_B,
    fetchImpl,
    log: () => {}
  });

  assert.equal(result.mode, "authenticated");
  assert.equal(seen.some(x => x.path === "/api/app/stores" && x.tenant === TENANT_A), true);
  assert.equal(seen.some(x => x.path === "/api/app/store-health" && x.tenant === TENANT_A), true);
  assert.equal(seen.some(x => x.path === "/api/app/store-health" && x.tenant === TENANT_B), true);
  assert.equal(seen.some(x => x.path === "/api/app/stores" && x.tenant === TENANT_B), true);
  assert.equal(seen.some(x => x.auth === "Bearer invalid.synthetic.jwt"), true);
});

test("authenticated preview smoke rejects the legacy brief shell", async () => {
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const auth = options.headers?.authorization;
    const tenant = options.headers?.["x-cafeos-tenant-id"];
    if (u.pathname === "/api/app/session" && !auth) return jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (u.pathname === "/api/app/session" && auth === `Bearer ${TOKEN}`) {
      return jsonResponse({
        user: { id: USER_A },
        memberships: [{ tenantId: TENANT_A, role: "owner", name: "Cafe A" }]
      });
    }
    if (tenant === TENANT_A && u.pathname === "/api/app/stores") {
      return jsonResponse({
        tenant: { id: TENANT_A, role: "owner" },
        stores: [{ id: STORE_A, name: "Store A", timezone: "Asia/Ho_Chi_Minh", active: true }]
      });
    }
    if (tenant === TENANT_A && u.pathname === "/api/app/brief") {
      return jsonResponse({
        tenant: { id: TENANT_A, role: "owner" },
        capabilities: { deterministicTopMetrics: false }
      });
    }
    if (tenant === TENANT_A) return jsonResponse({ tenant: { id: TENANT_A, role: "owner" } });
    return jsonResponse({ error: { code: "TENANT_FORBIDDEN" } }, 403);
  };

  await assert.rejects(
    verifyControlTowerPreview({
      baseUrl: PREVIEW,
      token: TOKEN,
      tenantId: TENANT_A,
      forbiddenTenantId: TENANT_B,
      fetchImpl,
      log: () => {}
    }),
    /deterministicTopMetrics/
  );
});

test("authenticated smoke refuses the production alias", async () => {
  await assert.rejects(
    verifyControlTowerPreview({
      baseUrl: "https://cafeos-analyzer.vercel.app",
      unauthOnly: true,
      fetchImpl: async () => jsonResponse({}, 500),
      log: () => {}
    }),
    /must run against a preview URL/
  );
});

test("full smoke fails closed when synthetic auth inputs are missing", async () => {
  const fetchImpl = async () => jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401);
  await assert.rejects(
    verifyControlTowerPreview({
      baseUrl: PREVIEW,
      fetchImpl,
      log: () => {}
    }),
    /CAFEOS_TEST_USER_JWT/
  );
});

test("protected authenticated verifier obtains a user token without logging secrets and proves tenant isolation", async () => {
  const allowedTenantId = "11111111-1111-4111-8111-111111111111";
  const forbiddenTenantId = "22222222-2222-4222-8222-222222222222";
  const secretPassword = "synthetic-password-never-log";
  const issuedToken = "issued-synthetic-jwt-never-log";
  const logs = [];
  const curlCalls = [];

  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).pathname, "/auth/v1/token");
    assert.equal(new URL(url).searchParams.get("grant_type"), "password");
    assert.equal(options.headers.apikey, "sb_publishable_test");
    const body = JSON.parse(options.body);
    assert.equal(body.email, "cafeos.synthetic.a@example.com");
    assert.equal(body.password, secretPassword);
    return jsonResponse({ access_token: issuedToken }, 200);
  };

  const curlImpl = (path, options) => {
    curlCalls.push({ path, options });
    const auth = options.headers?.authorization;
    const tenant = options.headers?.["x-cafeos-tenant-id"];

    if (path === "/api/app/session" && !auth) {
      return { status: 401, body: { error: { code: "AUTH_REQUIRED" } } };
    }
    if (path === "/api/app/session" && auth === "Bearer invalid.synthetic.jwt") {
      return { status: 401, body: { error: { code: "AUTH_INVALID" } } };
    }
    if (path === "/api/app/session" && auth === `Bearer ${issuedToken}`) {
      return {
        status: 200,
        body: {
          user: { id: "987c2476-ea27-4485-a75b-f382bcf04dc7" },
          memberships: [{ tenantId: allowedTenantId, role: "owner", name: "CafeOS Synthetic A" }]
        }
      };
    }
    if (tenant === forbiddenTenantId) {
      return { status: 403, body: { error: { code: "TENANT_FORBIDDEN" } } };
    }
    if (tenant === allowedTenantId && path === "/api/app/stores") {
      return {
        status: 200,
        body: {
          tenant: { id: allowedTenantId, role: "owner" },
          stores: [{ id: STORE_A, name: "Store A", timezone: "Asia/Ho_Chi_Minh", active: true }]
        }
      };
    }
    if (tenant === allowedTenantId && path === "/api/app/brief") {
      return {
        status: 200,
        body: {
          tenant: { id: allowedTenantId, role: "owner" },
          asOfBusinessDate: "2026-09-21",
          coverage: { activeStores: 1, storesRepresented: 1 },
          metrics: { netSales: {}, orders: {}, aov: {} },
          capabilities: { deterministicTopMetrics: true }
        }
      };
    }
    if (tenant === allowedTenantId && path.startsWith("/api/app/store-health?")) {
      return {
        status: 200,
        body: {
          tenant: { id: allowedTenantId, role: "owner" },
          store: { id: STORE_A, name: "Store A", timezone: "Asia/Ho_Chi_Minh", active: true },
          asOfBusinessDate: "2026-09-21",
          coverage: { currentHasData: true },
          metrics: { netSales: {}, orders: {}, aov: {} },
          capabilities: { deterministicMetrics: true }
        }
      };
    }
    if (tenant === allowedTenantId) {
      return { status: 200, body: { tenant: { id: allowedTenantId, role: "owner" } } };
    }
    return { status: 500, body: { error: { code: "UNEXPECTED" } } };
  };

  const result = await verifyProtectedPreview({
    previewUrl: PREVIEW,
    publishableKey: "sb_publishable_test",
    password: secretPassword,
    allowedTenantId,
    forbiddenTenantId,
    fetchImpl,
    curlImpl,
    log: message => logs.push(message)
  });

  assert.equal(result.ok, true);
  assert.equal(curlCalls.some(x => x.options.headers?.authorization === `Bearer ${issuedToken}`), true);
  assert.equal(curlCalls.some(x => x.options.headers?.["x-cafeos-tenant-id"] === forbiddenTenantId), true);
  const logText = logs.join("\n");
  assert.doesNotMatch(logText, new RegExp(secretPassword));
  assert.doesNotMatch(logText, new RegExp(issuedToken));
});

test("protected authenticated verifier refuses production alias and missing credentials", async () => {
  await assert.rejects(
    verifyProtectedPreview({
      previewUrl: "https://cafeos-analyzer.vercel.app",
      publishableKey: "sb_publishable_test",
      password: "x",
      fetchImpl: async () => jsonResponse({ access_token: "x" }),
      curlImpl: () => ({ status: 500, body: {} }),
      log: () => {}
    }),
    /production alias/
  );

  await assert.rejects(
    verifyProtectedPreview({
      previewUrl: PREVIEW,
      publishableKey: "",
      password: "x",
      fetchImpl: async () => jsonResponse({ access_token: "x" }),
      curlImpl: () => ({ status: 500, body: {} }),
      log: () => {}
    }),
    /SUPABASE_PUBLISHABLE_KEY/
  );
});
test("protected verifier uses the Windows shell for npx instead of spawning npx.cmd directly", async () => {
  const source = await readFile(
    new URL("../scripts/verify-control-tower-protected-preview.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /const command = "npx"/);
  assert.match(source, /const useShell = process\.platform === "win32"/);
  assert.match(source, /shell: useShell/);
  assert.doesNotMatch(source, /npx\.cmd/);
});
test("protected verifier uses deployment URL without forwarding project flags to native curl", async () => {
  const source = await readFile(
    new URL("../scripts/verify-control-tower-protected-preview.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /"curl", path,[\s\S]*"--deployment", previewUrl,[\s\S]*"--"/);
  assert.doesNotMatch(source, /"curl", path,[\s\S]*"--scope"/);
  assert.doesNotMatch(source, /"curl", path,[\s\S]*"--project"/);
});
test("protected verifier keeps curl write-out marker shell-safe", async () => {
  const source = await readFile(
    new URL("../scripts/verify-control-tower-protected-preview.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /"--write-out=__CAFEOS_STATUS__%\{http_code\}"/);
  assert.doesNotMatch(source, /"--write-out",\s*"\\n__CAFEOS_STATUS__/);
});

test("protected verifier keeps authorization headers off process arguments and cleans temporary files", async () => {
  const source = await readFile(
    new URL("../scripts/verify-control-tower-protected-preview.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /mkdtempSync\(join\(tmpdir\(\), "cafeos-vercel-curl-"\)\)/);
  assert.match(source, /writeFileSync\(headerPath, headerText, \{ encoding: "utf8", mode: 0o600 \}\)/);
  assert.match(source, /args\.push\("--header", `@\$\{headerPath\}`\)/);
  assert.match(source, /finally \{[\s\S]*rmSync\(headerDir, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(source, /args\.push\("--header", `\$\{name\}: \$\{value\}`\)/);
  assert.match(source, /Bearer \[REDACTED\]/);
});


test("protected unauth verifier accepts only app-level AUTH_REQUIRED on a preview URL", () => {
  const logs = [];
  const result = verifyProtectedUnauthPreview({
    previewUrl: PREVIEW,
    curlImpl: (path, options) => {
      assert.equal(path, "/api/app/session");
      assert.equal(options.previewUrl, PREVIEW);
      return { status: 401, body: { error: { code: "AUTH_REQUIRED" } } };
    },
    log: message => logs.push(message)
  });

  assert.equal(result.ok, true);
  assert.match(logs.join("\n"), /401 AUTH_REQUIRED/);
});

test("auth smoke securely prompts for publishable key when a new shell has no env var", async () => {
  const wrapper = await readFile(
    new URL("../scripts/run-control-tower-auth-smoke.ps1", import.meta.url),
    "utf8"
  );

  assert.match(wrapper, /Read-Host "Staging SUPABASE_PUBLISHABLE_KEY \(sb_publishable_\.\.\.\)" -AsSecureString/);
  assert.match(wrapper, /SecureStringToBSTR\(\$securePublishableKey\)/);
  assert.match(wrapper, /\$env:SUPABASE_PUBLISHABLE_KEY = \[Runtime\.InteropServices\.Marshal\]::PtrToStringBSTR\(\$publishableKeyPtr\)/);
  assert.match(wrapper, /\$normalizedPublishableKey = \$env:SUPABASE_PUBLISHABLE_KEY\.Trim\(\)/);
  assert.match(wrapper, /Substring\(1, \$normalizedPublishableKey\.Length - 2\)\.Trim\(\)/);
  assert.match(wrapper, /Invalid publishable key format after normalization \(length=\$enteredLength\)/);
  assert.match(wrapper, /Remove-Item Env:SUPABASE_PUBLISHABLE_KEY/);
  assert.match(wrapper, /ZeroFreeBSTR\(\$publishableKeyPtr\)/);
  assert.doesNotMatch(wrapper, /SUPABASE_PUBLISHABLE_KEY is not set in this PowerShell session/);
});

test("auth smoke reads the fresh preview URL from ignored Vercel state and contains no stale deployment URL", async () => {
  const wrapper = await readFile(
    new URL("../scripts/run-control-tower-auth-smoke.ps1", import.meta.url),
    "utf8"
  );
  const verifier = await readFile(
    new URL("../scripts/verify-control-tower-protected-preview.mjs", import.meta.url),
    "utf8"
  );

  assert.match(wrapper, /cafeos-control-tower-preview-url\.txt/);
  assert.match(wrapper, /Run npm run deploy:control-tower-preview first/);
  assert.doesNotMatch(wrapper, /cafeos-analyzer-nzb1i2njx/);
  assert.doesNotMatch(verifier, /cafeos-analyzer-nzb1i2njx/);
});
