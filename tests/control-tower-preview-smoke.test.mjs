import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyControlTowerPreview } from "../scripts/verify-control-tower-preview.mjs";

const PREVIEW = "https://cafeos-analyzer-wave26-example.vercel.app";
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";
const TOKEN = "synthetic-user-jwt";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("preview deploy launcher is preview-only and never embeds Supabase credentials", async () => {
  const ps = await readFile(new URL("../scripts/deploy-control-tower-preview.ps1", import.meta.url), "utf8");
  assert.match(ps, /env rm \$Name preview/i);
  assert.match(ps, /env add \$Name preview/i);
  assert.match(ps, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(ps, /sb_publishable_/);
  assert.match(ps, /production alias will not be promoted/i);
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
    if (tenant === TENANT_A && ["/api/app/stores", "/api/app/attention", "/api/app/brief"].includes(u.pathname)) {
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
  assert.equal(seen.some(x => x.path === "/api/app/stores" && x.tenant === TENANT_B), true);
  assert.equal(seen.some(x => x.auth === "Bearer invalid.synthetic.jwt"), true);
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
