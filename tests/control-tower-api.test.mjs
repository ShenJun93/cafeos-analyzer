import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AppHttpError,
  appConfig,
  bearerToken,
  requireUser,
  requestedTenantId,
  requireTenant
} from "../api/_app-auth.mjs";
import { handle as sessionHandle } from "../api/app/session.mjs";
import { handle as storesHandle } from "../api/app/stores.mjs";
import { handle as attentionHandle } from "../api/app/attention.mjs";
import { handle as briefHandle } from "../api/app/brief.mjs";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const USER_A = "a0000000-0000-4000-8000-000000000001";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test"
};

function req(headers = {}, method = "GET", url = "/") {
  return { method, headers, url };
}

function res() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(body = "") { this.body = String(body); }
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function parsed(response) {
  return response.body ? JSON.parse(response.body) : null;
}

test("Control Tower app config requires HTTPS staging URL and publishable key", () => {
  assert.deepEqual(appConfig(env), {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test"
  });
  assert.throws(
    () => appConfig({ SUPABASE_URL: "https://example.supabase.co" }),
    error => error instanceof AppHttpError && error.code === "APP_NOT_CONFIGURED"
  );
  assert.throws(
    () => appConfig({ ...env, SUPABASE_URL: "http://example.supabase.co" }),
    error => error instanceof AppHttpError && error.code === "APP_NOT_CONFIGURED"
  );
});

test("Bearer auth and tenant selection fail closed before upstream data access", () => {
  assert.throws(
    () => bearerToken(req({})),
    error => error instanceof AppHttpError && error.status === 401 && error.code === "AUTH_REQUIRED"
  );
  assert.throws(
    () => requestedTenantId(req({})),
    error => error instanceof AppHttpError && error.status === 400 && error.code === "TENANT_REQUIRED"
  );
  assert.throws(
    () => requestedTenantId(req({ "x-cafeos-tenant-id": "not-a-uuid" })),
    error => error instanceof AppHttpError && error.status === 400 && error.code === "TENANT_INVALID"
  );
});

test("authenticated Supabase calls use publishable apikey plus caller JWT", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ id: USER_A });
  };
  const auth = await requireUser(
    req({ authorization: "Bearer user-session-jwt" }),
    { env, fetchImpl }
  );
  assert.equal(auth.user.id, USER_A);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/auth/v1/user");
  assert.equal(calls[0].init.headers.apikey, "sb_publishable_test");
  assert.equal(calls[0].init.headers.authorization, "Bearer user-session-jwt");
});

test("Supabase Auth bad_jwt and unexpected_audience map to AUTH_INVALID, not upstream 502", async () => {
  for (const errorCode of ["bad_jwt", "unexpected_audience"]) {
    const fetchImpl = async () => jsonResponse(
      { code: 403, error_code: errorCode, msg: "invalid token" },
      403
    );

    await assert.rejects(
      requireUser(
        req({ authorization: "Bearer invalid.synthetic.jwt" }),
        { env, fetchImpl }
      ),
      error =>
        error instanceof AppHttpError &&
        error.status === 401 &&
        error.code === "AUTH_INVALID"
    );
  }
});

test("generic Supabase 403 remains an upstream failure", async () => {
  const fetchImpl = async () => jsonResponse(
    { error_code: "feature_forbidden", msg: "forbidden" },
    403
  );

  await assert.rejects(
    requireUser(
      req({ authorization: "Bearer syntactically-valid-token" }),
      { env, fetchImpl }
    ),
    error =>
      error instanceof AppHttpError &&
      error.status === 502 &&
      error.code === "SUPABASE_UPSTREAM"
  );
});

test("tenant membership must resolve through the caller's RLS-scoped JWT", async () => {
  const auth = { token: "jwt", user: { id: USER_A } };
  const acceptedFetch = async (url, init) => {
    const parsedUrl = new URL(url);
    assert.equal(init.headers.authorization, "Bearer jwt");
    assert.equal(parsedUrl.pathname, "/rest/v1/tenant_members");
    assert.equal(parsedUrl.searchParams.get("tenant_id"), `eq.${TENANT_A}`);
    assert.equal(parsedUrl.searchParams.get("user_id"), `eq.${USER_A}`);
    return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
  };
  const tenant = await requireTenant(
    req({ "x-cafeos-tenant-id": TENANT_A }),
    auth,
    { env, fetchImpl: acceptedFetch }
  );
  assert.deepEqual(tenant, { id: TENANT_A, role: "owner" });

  const deniedFetch = async () => jsonResponse([]);
  await assert.rejects(
    requireTenant(
      req({ "x-cafeos-tenant-id": TENANT_A }),
      auth,
      { env, fetchImpl: deniedFetch }
    ),
    error => error instanceof AppHttpError && error.status === 403 && error.code === "TENANT_FORBIDDEN"
  );
});

test("session endpoint returns only memberships visible to the authenticated user", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push(u);
    assert.equal(init.headers.authorization, "Bearer jwt");
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") {
      assert.equal(u.searchParams.get("user_id"), `eq.${USER_A}`);
      return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    }
    if (u.pathname === "/rest/v1/tenants") {
      return jsonResponse([{ id: TENANT_A, name: "Cafe A" }]);
    }
    return jsonResponse({ error: "unexpected path" }, 500);
  };
  const response = res();
  await sessionHandle(req({ authorization: "Bearer jwt" }), response, { env, fetchImpl });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsed(response), {
    user: { id: USER_A },
    memberships: [{ tenantId: TENANT_A, role: "owner", name: "Cafe A" }]
  });
  assert.equal(calls.length, 3);
});

test("read endpoints scope every business access to the selected tenant", async () => {
  const businessCalls = [];
  const aggregate = {
    tenantId: TENANT_A,
    asOfBusinessDate: "2026-09-21",
    freshness: {
      latestCommittedImportAt: "2026-09-21T00:00:00Z",
      latestObservedTransactionAt: "2026-09-21T01:00:00Z"
    },
    coverage: {
      activeStores: 1,
      storesRepresented: 1,
      stableStoreMappingRate: 1,
      baselineSamples: []
    },
    metrics: {
      netSales: { current: 80, baseline: null, deltaPct: null, baselineType: "same_weekday_4w", baselineDates: [], baselineStatus: "insufficient_history" },
      orders: { current: 2, baseline: null, deltaPct: null, baselineType: "same_weekday_4w", baselineDates: [], baselineStatus: "insufficient_history" },
      aov: { current: 40, baseline: null, deltaPct: null, baselineType: "same_weekday_4w", baselineDates: [], baselineStatus: "insufficient_history" }
    }
  };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") {
      return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    }
    businessCalls.push({ u, init });
    if (u.pathname === "/rest/v1/stores") {
      return jsonResponse([{ id: "store-1", name: "Store A", timezone: "Asia/Ho_Chi_Minh", active: true }]);
    }
    if (u.pathname === "/rest/v1/attention_items") {
      return jsonResponse([{ id: "attention-1", metric: "net_sales", status: "open" }]);
    }
    if (u.pathname === "/rest/v1/actions") {
      return jsonResponse([{ id: "action-1", title: "Investigate", status: "open" }]);
    }
    if (u.pathname === "/rest/v1/rpc/daily_brief_aggregate") {
      return jsonResponse(aggregate);
    }
    return jsonResponse({ error: "unexpected path" }, 500);
  };
  const headers = { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A };

  for (const handler of [storesHandle, attentionHandle, briefHandle]) {
    const response = res();
    await handler(req(headers), response, { env, fetchImpl });
    assert.equal(response.statusCode, 200);
  }

  assert.ok(businessCalls.length >= 5);
  for (const { u, init } of businessCalls) {
    assert.equal(init.headers.authorization, "Bearer jwt");
    assert.equal(init.headers.apikey, "sb_publishable_test");
    if (u.pathname === "/rest/v1/rpc/daily_brief_aggregate") {
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), {
        p_tenant_id: TENANT_A,
        p_as_of_business_date: null
      });
    } else {
      assert.equal(
        u.searchParams.get("tenant_id"),
        `eq.${TENANT_A}`,
        `${u.pathname} must be tenant-filtered`
      );
    }
  }
});

test("brief returns deterministic aggregate metrics through caller-RLS RPC", async () => {
  const rpcCalls = [];
  const aggregate = {
    tenantId: TENANT_A,
    asOfBusinessDate: "2026-09-21",
    freshness: {
      latestCommittedImportAt: "2026-09-21T00:00:00Z",
      latestObservedTransactionAt: "2026-09-21T01:00:00Z"
    },
    coverage: {
      activeStores: 1,
      storesRepresented: 1,
      stableStoreMappingRate: 1,
      baselineSamples: []
    },
    metrics: {
      netSales: { current: 80, baseline: 100, deltaPct: -0.2, baselineType: "same_weekday_4w", baselineDates: ["2026-08-24","2026-08-31","2026-09-07","2026-09-14"], baselineStatus: "ready" },
      orders: { current: 2, baseline: 2, deltaPct: 0, baselineType: "same_weekday_4w", baselineDates: ["2026-08-24","2026-08-31","2026-09-07","2026-09-14"], baselineStatus: "ready" },
      aov: { current: 40, baseline: 50, deltaPct: -0.2, baselineType: "same_weekday_4w", baselineDates: ["2026-08-24","2026-08-31","2026-09-07","2026-09-14"], baselineStatus: "ready" }
    }
  };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "analyst" }]);
    if (u.pathname === "/rest/v1/rpc/daily_brief_aggregate") {
      rpcCalls.push({ u, init });
      return jsonResponse(aggregate);
    }
    if (u.pathname === "/rest/v1/attention_items") return jsonResponse([{ id: "attention-1", status: "open" }]);
    if (u.pathname === "/rest/v1/actions") return jsonResponse([{ id: "action-1", status: "open" }]);
    return jsonResponse({}, 500);
  };
  const response = res();
  await briefHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "GET",
      "/api/app/brief?asOfBusinessDate=2026-09-21"
    ),
    response,
    { env, fetchImpl }
  );
  const body = parsed(response);
  assert.equal(response.statusCode, 200);
  assert.equal(body.kind, "control-tower-daily-brief");
  assert.equal(body.tenant.role, "analyst");
  assert.equal(body.asOfBusinessDate, "2026-09-21");
  assert.deepEqual(body.metrics, aggregate.metrics);
  assert.deepEqual(body.coverage, aggregate.coverage);
  assert.equal(body.attention.length, 1);
  assert.equal(body.unresolvedActions.length, 1);
  assert.equal(body.capabilities.deterministicTopMetrics, true);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].init.method, "POST");
  assert.equal(rpcCalls[0].init.headers.apikey, "sb_publishable_test");
  assert.equal(rpcCalls[0].init.headers.authorization, "Bearer jwt");
  assert.deepEqual(JSON.parse(rpcCalls[0].init.body), {
    p_tenant_id: TENANT_A,
    p_as_of_business_date: "2026-09-21"
  });
});

test("brief rejects an invalid as-of calendar date before aggregate access", async () => {
  let rpcCalled = false;
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    if (u.pathname === "/rest/v1/rpc/daily_brief_aggregate") rpcCalled = true;
    return jsonResponse([], 200);
  };
  const response = res();
  await briefHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "GET",
      "/api/app/brief?asOfBusinessDate=2026-02-30"
    ),
    response,
    { env, fetchImpl }
  );
  const body = parsed(response);
  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, "AS_OF_DATE_INVALID");
  assert.equal(rpcCalled, false);
});

test("brief fails closed when aggregate RPC returns a malformed payload", async () => {
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    if (u.pathname === "/rest/v1/rpc/daily_brief_aggregate") return jsonResponse(null);
    if (u.pathname === "/rest/v1/attention_items") return jsonResponse([]);
    if (u.pathname === "/rest/v1/actions") return jsonResponse([]);
    return jsonResponse({}, 500);
  };
  const response = res();
  await briefHandle(
    req({ authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A }),
    response,
    { env, fetchImpl }
  );
  const body = parsed(response);
  assert.equal(response.statusCode, 502);
  assert.equal(body.error.code, "SUPABASE_UPSTREAM");
});

test("Control Tower server boundary never references secret or service-role credentials", async () => {
  const source = await readFile(new URL("../api/_app-auth.mjs", import.meta.url), "utf8");
  const endpoints = await Promise.all([
    "session.mjs",
    "stores.mjs",
    "attention.mjs",
    "brief.mjs"
  ].map(name => readFile(new URL(`../api/app/${name}`, import.meta.url), "utf8")));
  const combined = [source, ...endpoints].join("\n");
  assert.doesNotMatch(combined, /SUPABASE_SECRET/i);
  assert.doesNotMatch(combined, /SERVICE_ROLE/i);
  assert.match(combined, /SUPABASE_PUBLISHABLE_KEY/);
});

test("Control Tower client boundary stays GET-only while brief uses fixed internal RPC", async () => {
  const files = await Promise.all([
    "../api/app/session.mjs",
    "../api/app/stores.mjs",
    "../api/app/attention.mjs",
    "../api/app/brief.mjs"
  ].map(path => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of files) assert.match(source, /onlyGet/);
  const briefSource = files.at(-1);
  assert.match(briefSource, /\/rest\/v1\/rpc\/daily_brief_aggregate/);
  assert.doesNotMatch(briefSource, /\/rest\/v1\/transaction_line_items/);
});
