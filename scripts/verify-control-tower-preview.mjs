const PRODUCTION_ALIAS = "cafeos-analyzer.vercel.app";

function fail(message) {
  throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return null; }
}

function normalizedBaseUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { fail("Preview URL is invalid"); }
  if (url.protocol !== "https:") fail("Preview smoke requires HTTPS");
  if (url.hostname === PRODUCTION_ALIAS) {
    fail("Safety stop: authenticated Control Tower smoke must run against a preview URL, not production");
  }
  return url.origin;
}

async function expectJson(fetchImpl, url, options, expectedStatus, expectedCode) {
  const response = await fetchImpl(url, { redirect: "follow", ...options });
  const payload = await readJson(response);
  if (response.status !== expectedStatus) {
    fail(`${options?.method ?? "GET"} ${new URL(url).pathname} expected ${expectedStatus}, got ${response.status}`);
  }
  if (expectedCode && payload?.error?.code !== expectedCode) {
    fail(`${new URL(url).pathname} expected error code ${expectedCode}, got ${payload?.error?.code ?? "none"}`);
  }
  return payload;
}

export async function verifyControlTowerPreview({
  baseUrl,
  token,
  tenantId,
  forbiddenTenantId,
  unauthOnly = false,
  fetchImpl = globalThis.fetch,
  log = console.log
}) {
  if (typeof fetchImpl !== "function") fail("fetch is unavailable");
  const base = normalizedBaseUrl(baseUrl);

  await expectJson(
    fetchImpl,
    `${base}/api/app/session`,
    {},
    401,
    "AUTH_REQUIRED"
  );
  log("PASS unauthenticated /api/app/session -> 401 AUTH_REQUIRED");

  if (unauthOnly) {
    return { ok: true, mode: "unauth-only", baseUrl: base };
  }

  if (!token) fail("Set CAFEOS_TEST_USER_JWT for authenticated smoke");
  if (!tenantId) fail("Set CAFEOS_TEST_TENANT_ID for authenticated smoke");
  if (!forbiddenTenantId) fail("Set CAFEOS_FORBIDDEN_TENANT_ID for cross-tenant smoke");
  if (tenantId === forbiddenTenantId) fail("Allowed and forbidden tenant IDs must differ");

  const authHeaders = { authorization: `Bearer ${token}` };
  const session = await expectJson(
    fetchImpl,
    `${base}/api/app/session`,
    { headers: authHeaders },
    200
  );
  if (!Array.isArray(session?.memberships) || !session.memberships.some(x => x.tenantId === tenantId)) {
    fail("Authenticated session does not expose the expected synthetic tenant membership");
  }
  log("PASS authenticated /api/app/session -> 200 with expected membership");

  for (const path of ["/api/app/stores", "/api/app/attention", "/api/app/brief"]) {
    const payload = await expectJson(
      fetchImpl,
      `${base}${path}`,
      { headers: { ...authHeaders, "x-cafeos-tenant-id": tenantId } },
      200
    );
    if (payload?.tenant?.id !== tenantId) {
      fail(`${path} did not return the selected tenant context`);
    }
    if (path === "/api/app/brief") {
      if (payload?.capabilities?.deterministicTopMetrics !== true) {
        fail("/api/app/brief did not enable deterministicTopMetrics");
      }
      if (!payload?.metrics || !payload?.coverage || !Object.hasOwn(payload, "asOfBusinessDate")) {
        fail("/api/app/brief did not return the deterministic Daily Brief contract");
      }
    }
    log(`PASS own-tenant ${path} -> 200`);
  }

  await expectJson(
    fetchImpl,
    `${base}/api/app/stores`,
    { headers: { ...authHeaders, "x-cafeos-tenant-id": forbiddenTenantId } },
    403,
    "TENANT_FORBIDDEN"
  );
  log("PASS cross-tenant selection -> 403 TENANT_FORBIDDEN");

  await expectJson(
    fetchImpl,
    `${base}/api/app/session`,
    { headers: { authorization: "Bearer invalid.synthetic.jwt" } },
    401,
    "AUTH_INVALID"
  );
  log("PASS invalid JWT -> 401 AUTH_INVALID");

  return { ok: true, mode: "authenticated", baseUrl: base };
}

const isCli = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll("\\", "/"));
if (isCli) {
  const args = process.argv.slice(2);
  const baseUrl = args.find(x => !x.startsWith("--")) ?? process.env.CAFEOS_PREVIEW_URL;
  const unauthOnly = args.includes("--unauth-only");
  if (!baseUrl) fail("Pass the preview URL or set CAFEOS_PREVIEW_URL");

  await verifyControlTowerPreview({
    baseUrl,
    unauthOnly,
    token: process.env.CAFEOS_TEST_USER_JWT,
    tenantId: process.env.CAFEOS_TEST_TENANT_ID,
    forbiddenTenantId: process.env.CAFEOS_FORBIDDEN_TENANT_ID
  });

  console.log(`CONTROL TOWER PREVIEW SMOKE PASS ${baseUrl}`);
}
