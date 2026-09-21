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
import { handle as storeHealthHandle } from "../api/app/store-health.mjs";
import { dispatchWorkflow } from "../api/app/workflow.mjs";
import { handle as actionsHandle } from "../server/app/actions.mjs";
import { handle as actionStatusHandle } from "../server/app/action-status.mjs";
import { handle as measurementWindowHandle } from "../server/app/measurement-window.mjs";
import { handle as actionDetailHandle } from "../server/app/action-detail.mjs";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const USER_A = "a0000000-0000-4000-8000-000000000001";
const STORE_A = "11000000-0000-4000-8000-000000000001";
const STORE_B = "21000000-0000-4000-8000-000000000002";
const ATTENTION_A = "12000000-0000-4000-8000-000000000001";
const ACTION_A = "13000000-0000-4000-8000-000000000001";
const MEASUREMENT_A = "14000000-0000-4000-8000-000000000001";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test"
};

function req(headers = {}, method = "GET", url = "/", body = undefined) {
  return { method, headers, url, body };
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

test("Store Health uses caller-RLS preflight, shared aggregate RPC, and Store-scoped workflow reads", async () => {
  const calls = [];
  const aggregate = {
    tenantId: TENANT_A,
    store: { id: STORE_A, name: "Store A", timezone: "Asia/Ho_Chi_Minh", active: true },
    asOfBusinessDate: "2026-09-21",
    freshness: {
      latestCommittedImportAt: "2026-09-21T00:00:00Z",
      latestObservedTransactionAt: "2026-09-21T01:00:00Z"
    },
    coverage: {
      currentHasData: true,
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
    calls.push({ u, init });
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") {
      return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    }
    if (u.pathname === "/rest/v1/stores") {
      assert.equal(u.searchParams.get("tenant_id"), `eq.${TENANT_A}`);
      assert.equal(u.searchParams.get("id"), `eq.${STORE_A}`);
      assert.equal(u.searchParams.get("active"), "eq.true");
      return jsonResponse([aggregate.store]);
    }
    if (u.pathname === "/rest/v1/rpc/store_health_aggregate") {
      return jsonResponse(aggregate);
    }
    if (u.pathname === "/rest/v1/attention_items") {
      assert.equal(u.searchParams.get("tenant_id"), `eq.${TENANT_A}`);
      assert.equal(u.searchParams.get("scope_type"), "eq.store");
      assert.equal(u.searchParams.get("scope_key"), `eq.${STORE_A}`);
      return jsonResponse([{ id: ATTENTION_A, scope_type: "store", scope_key: STORE_A, status: "open" }]);
    }
    if (u.pathname === "/rest/v1/actions") {
      assert.equal(u.searchParams.get("tenant_id"), `eq.${TENANT_A}`);
      assert.equal(u.searchParams.get("attention_item_id"), `in.(${ATTENTION_A})`);
      return jsonResponse([{ id: "action-1", attention_item_id: ATTENTION_A, status: "open" }]);
    }
    return jsonResponse({ error: "unexpected path" }, 500);
  };

  const response = res();
  await storeHealthHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "GET",
      `/api/app/store-health?storeId=${STORE_A}&asOfBusinessDate=2026-09-21`
    ),
    response,
    { env, fetchImpl }
  );

  const body = parsed(response);
  assert.equal(response.statusCode, 200);
  assert.equal(body.kind, "control-tower-store-health");
  assert.equal(body.store.id, STORE_A);
  assert.equal(body.asOfBusinessDate, "2026-09-21");
  assert.deepEqual(body.metrics, aggregate.metrics);
  assert.equal(body.attention.length, 1);
  assert.equal(body.unresolvedActions.length, 1);
  assert.equal(body.capabilities.deterministicMetrics, true);

  const rpcCall = calls.find(call => call.u.pathname === "/rest/v1/rpc/store_health_aggregate");
  assert.ok(rpcCall);
  assert.equal(rpcCall.init.method, "POST");
  assert.equal(rpcCall.init.headers.apikey, "sb_publishable_test");
  assert.equal(rpcCall.init.headers.authorization, "Bearer jwt");
  assert.deepEqual(JSON.parse(rpcCall.init.body), {
    p_tenant_id: TENANT_A,
    p_store_id: STORE_A,
    p_as_of_business_date: "2026-09-21"
  });
});

test("Store Health rejects invalid Store ids before Store data access", async () => {
  let storeDataCalled = false;
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    storeDataCalled = true;
    return jsonResponse([]);
  };

  const response = res();
  await storeHealthHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "GET",
      "/api/app/store-health?storeId=not-a-uuid"
    ),
    response,
    { env, fetchImpl }
  );

  const body = parsed(response);
  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, "STORE_INVALID");
  assert.equal(storeDataCalled, false);
});

test("Store Health hides a Store outside the selected tenant before RPC", async () => {
  let rpcCalled = false;
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    if (u.pathname === "/rest/v1/stores") return jsonResponse([]);
    if (u.pathname === "/rest/v1/rpc/store_health_aggregate") rpcCalled = true;
    return jsonResponse([]);
  };

  const response = res();
  await storeHealthHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "GET",
      `/api/app/store-health?storeId=${STORE_B}`
    ),
    response,
    { env, fetchImpl }
  );

  const body = parsed(response);
  assert.equal(response.statusCode, 404);
  assert.equal(body.error.code, "STORE_NOT_FOUND");
  assert.equal(rpcCalled, false);
});

test("Store Health fails closed on malformed aggregate payload", async () => {
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    if (u.pathname === "/rest/v1/stores") {
      return jsonResponse([{ id: STORE_A, name: "Store A", timezone: "Asia/Ho_Chi_Minh", active: true }]);
    }
    if (u.pathname === "/rest/v1/rpc/store_health_aggregate") return jsonResponse({ store: { id: STORE_A } });
    if (u.pathname === "/rest/v1/attention_items") return jsonResponse([]);
    return jsonResponse([]);
  };

  const response = res();
  await storeHealthHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "GET",
      `/api/app/store-health?storeId=${STORE_A}`
    ),
    response,
    { env, fetchImpl }
  );

  const body = parsed(response);
  assert.equal(response.statusCode, 502);
  assert.equal(body.error.code, "SUPABASE_UPSTREAM");
});

test("operator can create one bounded Action from an open Store Attention item", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ u, init });
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") {
      return jsonResponse([{ tenant_id: TENANT_A, user_id: USER_A, role: "owner" }]);
    }
    if (u.pathname === "/rest/v1/attention_items") {
      return jsonResponse([{
        id: ATTENTION_A,
        metric: "net_sales",
        scope_type: "store",
        scope_key: STORE_A,
        status: "open"
      }]);
    }
    if (u.pathname === "/rest/v1/actions" && (init.method ?? "GET") === "GET") {
      return jsonResponse([]);
    }
    if (u.pathname === "/rest/v1/actions" && init.method === "POST") {
      return jsonResponse([{
        id: ACTION_A,
        tenant_id: TENANT_A,
        attention_item_id: ATTENTION_A,
        owner_user_id: USER_A,
        action_type: "investigate",
        title: "Investigate net sales",
        expected_metric: "net_sales",
        expected_direction: "investigate",
        status: "open"
      }], 201);
    }
    return jsonResponse({ error: "unexpected" }, 500);
  };

  const response = res();
  await actionsHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "POST",
      "/api/app/actions",
      { attentionItemId: ATTENTION_A }
    ),
    response,
    { env, fetchImpl }
  );

  assert.equal(response.statusCode, 201);
  assert.equal(parsed(response).action.id, ACTION_A);
  const insert = calls.find(call => call.u.pathname === "/rest/v1/actions" && call.init.method === "POST");
  assert.ok(insert);
  assert.equal(insert.init.headers.authorization, "Bearer jwt");
  assert.equal(insert.init.headers.apikey, "sb_publishable_test");
  const body = JSON.parse(insert.init.body);
  assert.deepEqual(body, {
    tenant_id: TENANT_A,
    attention_item_id: ATTENTION_A,
    owner_user_id: USER_A,
    action_type: "investigate",
    title: "Investigate net_sales",
    expected_metric: "net_sales",
    expected_direction: "investigate",
    status: "open",
    due_at: null
  });
});

test("viewer is denied bounded workflow writes before business mutation", async () => {
  let businessWrite = false;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") {
      return jsonResponse([{ tenant_id: TENANT_A, role: "viewer" }]);
    }
    if (["POST", "PATCH"].includes(init.method)) businessWrite = true;
    return jsonResponse([]);
  };

  const response = res();
  await actionsHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "POST",
      "/api/app/actions",
      { attentionItemId: ATTENTION_A }
    ),
    response,
    { env, fetchImpl }
  );

  assert.equal(response.statusCode, 403);
  assert.equal(parsed(response).error.code, "ROLE_FORBIDDEN");
  assert.equal(businessWrite, false);
});

test("Action status API only patches bounded lifecycle fields", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ u, init });
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "analyst" }]);
    if (u.pathname === "/rest/v1/actions" && (init.method ?? "GET") === "GET") {
      return jsonResponse([{ id: ACTION_A, status: "open", resolution_note: null, resolved_at: null }]);
    }
    if (u.pathname === "/rest/v1/actions" && init.method === "PATCH") {
      const patch = JSON.parse(init.body);
      return jsonResponse([{ id: ACTION_A, tenant_id: TENANT_A, status: patch.status, resolution_note: patch.resolution_note }]);
    }
    return jsonResponse({ error: "unexpected" }, 500);
  };

  const response = res();
  await actionStatusHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "PATCH",
      "/api/app/action-status",
      { actionId: ACTION_A, status: "in_progress" }
    ),
    response,
    { env, fetchImpl }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(parsed(response).action.status, "in_progress");
  const patchCall = calls.find(call => call.u.pathname === "/rest/v1/actions" && call.init.method === "PATCH");
  assert.ok(patchCall);
  const body = JSON.parse(patchCall.init.body);
  assert.equal(body.status, "in_progress");
  assert.equal(body.resolution_note, null);
  assert.equal(body.resolved_at, null);
  assert.equal(typeof body.updated_at, "string");
  assert.deepEqual(Object.keys(body).sort(), ["resolution_note","resolved_at","status","updated_at"].sort());
});

test("terminal Action status requires a resolution note", async () => {
  let patched = false;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    if (u.pathname === "/rest/v1/actions" && (init.method ?? "GET") === "GET") {
      return jsonResponse([{ id: ACTION_A, status: "in_progress" }]);
    }
    if (init.method === "PATCH") patched = true;
    return jsonResponse([]);
  };

  const response = res();
  await actionStatusHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "PATCH",
      "/api/app/action-status",
      { actionId: ACTION_A, status: "resolved" }
    ),
    response,
    { env, fetchImpl }
  );

  assert.equal(response.statusCode, 400);
  assert.equal(parsed(response).error.code, "RESOLUTION_NOTE_REQUIRED");
  assert.equal(patched, false);
});

test("Measurement Window API derives metric and scope and never accepts trusted values", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ u, init });
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    if (u.pathname === "/rest/v1/actions") {
      return jsonResponse([{ id: ACTION_A, attention_item_id: ATTENTION_A, expected_metric: "net_sales", status: "in_progress" }]);
    }
    if (u.pathname === "/rest/v1/attention_items") {
      return jsonResponse([{ id: ATTENTION_A, metric: "net_sales", scope_type: "store", scope_key: STORE_A }]);
    }
    if (u.pathname === "/rest/v1/measurement_windows" && init.method === "POST") {
      return jsonResponse([{
        id: MEASUREMENT_A,
        tenant_id: TENANT_A,
        action_id: ACTION_A,
        metric: "net_sales",
        scope_type: "store",
        scope_key: STORE_A,
        status: "pending"
      }], 201);
    }
    return jsonResponse({ error: "unexpected" }, 500);
  };

  const response = res();
  await measurementWindowHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "POST",
      "/api/app/measurement-window",
      {
        actionId: ACTION_A,
        baselineStart: "2026-09-01T00:00:00Z",
        baselineEnd: "2026-09-02T00:00:00Z",
        measurementStart: "2026-09-08T00:00:00Z",
        measurementEnd: "2026-09-09T00:00:00Z"
      }
    ),
    response,
    { env, fetchImpl }
  );

  assert.equal(response.statusCode, 201);
  assert.equal(parsed(response).interpretation, "before_after_not_causal");
  const insert = calls.find(call => call.u.pathname === "/rest/v1/measurement_windows" && call.init.method === "POST");
  assert.ok(insert);
  const body = JSON.parse(insert.init.body);
  assert.equal(body.metric, "net_sales");
  assert.equal(body.scope_type, "store");
  assert.equal(body.scope_key, STORE_A);
  assert.equal(Object.hasOwn(body, "baseline_value"), false);
  assert.equal(Object.hasOwn(body, "measured_value"), false);
  assert.equal(Object.hasOwn(body, "delta_value"), false);
  assert.equal(Object.hasOwn(body, "status"), false);
});

test("Measurement Window API rejects client-supplied trusted fields before business access", async () => {
  let businessCalled = false;
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    businessCalled = true;
    return jsonResponse([]);
  };

  const response = res();
  await measurementWindowHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "POST",
      "/api/app/measurement-window",
      {
        actionId: ACTION_A,
        baselineStart: "2026-09-01T00:00:00Z",
        baselineEnd: "2026-09-02T00:00:00Z",
        measurementStart: "2026-09-08T00:00:00Z",
        measurementEnd: "2026-09-09T00:00:00Z",
        measuredValue: 999
      }
    ),
    response,
    { env, fetchImpl }
  );

  assert.equal(response.statusCode, 400);
  assert.equal(parsed(response).error.code, "BODY_FIELD_FORBIDDEN");
  assert.equal(businessCalled, false);
});

test("Action detail returns audit history and deterministic non-causal Measurement results", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ u, init });
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "viewer" }]);
    if (u.pathname === "/rest/v1/actions") {
      return jsonResponse([{
        id: ACTION_A,
        tenant_id: TENANT_A,
        attention_item_id: ATTENTION_A,
        title: "Investigate",
        expected_metric: "net_sales",
        status: "in_progress"
      }]);
    }
    if (u.pathname === "/rest/v1/attention_items") {
      return jsonResponse([{ id: ATTENTION_A, metric: "net_sales", scope_type: "store", scope_key: STORE_A, status: "acted" }]);
    }
    if (u.pathname === "/rest/v1/action_status_history") {
      return jsonResponse([{ id: "history-1", action_id: ACTION_A, from_status: "open", to_status: "in_progress" }]);
    }
    if (u.pathname === "/rest/v1/measurement_windows") {
      return jsonResponse([{
        id: MEASUREMENT_A,
        action_id: ACTION_A,
        metric: "net_sales",
        scope_type: "store",
        scope_key: STORE_A,
        status: "pending"
      }]);
    }
    if (u.pathname === "/rest/v1/rpc/measurement_window_result") {
      return jsonResponse({
        tenantId: TENANT_A,
        measurementWindowId: MEASUREMENT_A,
        actionId: ACTION_A,
        metric: "net_sales",
        result: {
          status: "measured",
          deltaValue: 50,
          deltaPct: 0.333333,
          interpretation: "before_after_not_causal"
        }
      });
    }
    return jsonResponse({ error: "unexpected" }, 500);
  };

  const response = res();
  await actionDetailHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "GET",
      `/api/app/action-detail?actionId=${ACTION_A}`
    ),
    response,
    { env, fetchImpl }
  );

  const body = parsed(response);
  assert.equal(response.statusCode, 200);
  assert.equal(body.kind, "control-tower-action-detail");
  assert.equal(body.action.id, ACTION_A);
  assert.equal(body.attention.id, ATTENTION_A);
  assert.equal(body.history.length, 1);
  assert.equal(body.measurementWindows.length, 1);
  assert.equal(body.measurementWindows[0].deterministicResult.result.interpretation, "before_after_not_causal");
  assert.equal(body.capabilities.causalAttribution, false);

  const rpc = calls.find(call => call.u.pathname === "/rest/v1/rpc/measurement_window_result");
  assert.ok(rpc);
  assert.equal(rpc.init.method, "POST");
  assert.equal(rpc.init.headers.authorization, "Bearer jwt");
  assert.equal(rpc.init.headers.apikey, "sb_publishable_test");
  assert.deepEqual(JSON.parse(rpc.init.body), {
    p_tenant_id: TENANT_A,
    p_measurement_window_id: MEASUREMENT_A
  });
});

test("Action detail hides cross-tenant Action ids before Measurement RPC", async () => {
  let rpcCalled = false;
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    if (u.pathname === "/rest/v1/actions") return jsonResponse([]);
    if (u.pathname === "/rest/v1/rpc/measurement_window_result") rpcCalled = true;
    return jsonResponse([]);
  };

  const response = res();
  await actionDetailHandle(
    req(
      { authorization: "Bearer jwt", "x-cafeos-tenant-id": TENANT_A },
      "GET",
      `/api/app/action-detail?actionId=${ACTION_A}`
    ),
    response,
    { env, fetchImpl }
  );

  assert.equal(response.statusCode, 404);
  assert.equal(parsed(response).error.code, "ACTION_NOT_FOUND");
  assert.equal(rpcCalled, false);
});

test("workflow dispatcher routes the four bounded public operations without business duplication", async () => {
  const seen = [];
  const routes = {
    actions: async () => { seen.push("actions"); },
    "action-status": async () => { seen.push("action-status"); },
    "measurement-window": async () => { seen.push("measurement-window"); },
    "action-detail": async () => { seen.push("action-detail"); }
  };

  for (const route of Object.keys(routes)) {
    const response = res();
    await dispatchWorkflow(
      req({}, "GET", `/api/app/workflow?route=${route}`),
      response,
      {},
      routes
    );
  }

  assert.deepEqual(seen, ["actions", "action-status", "measurement-window", "action-detail"]);
});

test("workflow dispatcher fails closed for an unmapped route", async () => {
  const response = res();
  await dispatchWorkflow(
    req({}, "GET", "/api/app/workflow?route=unknown"),
    response,
    {},
    {}
  );
  assert.equal(response.statusCode, 404);
  assert.equal(parsed(response).error.code, "ROUTE_NOT_FOUND");
});

test("vercel rewrites preserve the four bounded workflow public URLs through one function", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const expected = new Map([
    ["/api/app/actions", "/api/app/workflow?route=actions"],
    ["/api/app/action-status", "/api/app/workflow?route=action-status"],
    ["/api/app/measurement-window", "/api/app/workflow?route=measurement-window"],
    ["/api/app/action-detail", "/api/app/workflow?route=action-detail"]
  ]);
  for (const [source, destination] of expected) {
    assert.equal(
      config.rewrites.some(rule => rule.source === source && rule.destination === destination),
      true,
      `missing workflow rewrite ${source}`
    );
  }
});

test("Control Tower server boundary never references secret or service-role credentials", async () => {
  const source = await readFile(new URL("../api/_app-auth.mjs", import.meta.url), "utf8");
  const endpoints = await Promise.all([
    "../api/app/session.mjs",
    "../api/app/stores.mjs",
    "../api/app/attention.mjs",
    "../api/app/brief.mjs",
    "../api/app/store-health.mjs",
    "../api/app/workflow.mjs",
    "../server/app/actions.mjs",
    "../server/app/action-status.mjs",
    "../server/app/measurement-window.mjs",
    "../server/app/action-detail.mjs"
  ].map(path => readFile(new URL(path, import.meta.url), "utf8")));
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
    "../api/app/brief.mjs",
    "../api/app/store-health.mjs"
  ].map(path => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of files) assert.match(source, /onlyGet/);
  const briefSource = files.at(-2);
  const storeHealthSource = files.at(-1);
  assert.match(briefSource, /\/rest\/v1\/rpc\/daily_brief_aggregate/);
  assert.match(storeHealthSource, /\/rest\/v1\/rpc\/store_health_aggregate/);
  assert.doesNotMatch(briefSource, /\/rest\/v1\/transaction_line_items/);
  assert.doesNotMatch(storeHealthSource, /\/rest\/v1\/transaction_line_items/);
});
