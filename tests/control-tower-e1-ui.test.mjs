import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createVercelShapePreviewServer } from "../scripts/serve-vercel-preview.mjs";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const USER_A = "a0000000-0000-4000-8000-000000000001";
const ATTENTION_A = "12000000-0000-4000-8000-000000000001";
const ACTION_A = "13000000-0000-4000-8000-000000000001";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function withServer(fetchImpl, fn) {
  const server = createVercelShapePreviewServer({
    env,
    fetchImpl,
    root: process.cwd()
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("E1 local server exposes browser-safe synthetic config and static UI only locally", async () => {
  await withServer(async () => jsonResponse({}, 500), async baseUrl => {
    const configResponse = await fetch(baseUrl + "/api/app/client-config");
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.deepEqual(config, {
      environment: "synthetic_staging",
      evidenceProvenance: "operator_synthetic_assisted",
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "sb_publishable_test"
    });

    const uiResponse = await fetch(baseUrl + "/control-tower-e1");
    assert.equal(uiResponse.status, 200);
    const html = await uiResponse.text();
    assert.match(html, /DEMO \/ SYNTHETIC CONTROL TOWER DATA — NOT YOUR STORE DATA/);

    const methodResponse = await fetch(baseUrl + "/api/app/client-config", { method: "POST" });
    assert.equal(methodResponse.status, 405);
  });
});

test("E1 local server reuses session handler and fails unauthenticated requests closed", async () => {
  let upstreamCalls = 0;
  await withServer(async () => {
    upstreamCalls += 1;
    return jsonResponse({}, 500);
  }, async baseUrl => {
    const response = await fetch(baseUrl + "/api/app/session");
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "AUTH_REQUIRED");
  });
  assert.equal(upstreamCalls, 0);
});

test("E1 local session returns only memberships visible to caller JWT", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ u, init });
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") {
      assert.equal(init.headers.authorization, "Bearer synthetic-jwt");
      assert.equal(u.searchParams.get("user_id"), `eq.${USER_A}`);
      return jsonResponse([{ tenant_id: TENANT_A, role: "owner" }]);
    }
    if (u.pathname === "/rest/v1/tenants") {
      return jsonResponse([{ id: TENANT_A, name: "Synthetic Cafe A" }]);
    }
    return jsonResponse({ error: "unexpected" }, 500);
  };

  await withServer(fetchImpl, async baseUrl => {
    const response = await fetch(baseUrl + "/api/app/session", {
      headers: { authorization: "Bearer synthetic-jwt" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.memberships, [{
      tenantId: TENANT_A,
      role: "owner",
      name: "Synthetic Cafe A"
    }]);
  });

  assert.equal(calls.length, 3);
});

test("E1 local workflow parses JSON and reuses bounded Action handler", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ u, init });
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") {
      return jsonResponse([{ tenant_id: TENANT_A, role: "owner", user_id: USER_A }]);
    }
    if (u.pathname === "/rest/v1/attention_items") {
      return jsonResponse([{
        id: ATTENTION_A,
        metric: "net_sales",
        scope_type: "store",
        scope_key: "11000000-0000-4000-8000-000000000001",
        status: "open"
      }]);
    }
    if (u.pathname === "/rest/v1/actions" && (init.method ?? "GET") === "GET") {
      return jsonResponse([]);
    }
    if (u.pathname === "/rest/v1/actions" && init.method === "POST") {
      const payload = JSON.parse(init.body);
      assert.deepEqual(Object.keys(payload).sort(), [
        "action_type",
        "attention_item_id",
        "due_at",
        "expected_direction",
        "expected_metric",
        "owner_user_id",
        "status",
        "tenant_id",
        "title"
      ].sort());
      return jsonResponse([{
        id: ACTION_A,
        tenant_id: TENANT_A,
        attention_item_id: ATTENTION_A,
        owner_user_id: USER_A,
        action_type: "investigate",
        title: "Investigate net_sales",
        expected_metric: "net_sales",
        expected_direction: "investigate",
        status: "open"
      }], 201);
    }
    return jsonResponse({ error: "unexpected" }, 500);
  };

  await withServer(fetchImpl, async baseUrl => {
    const response = await fetch(baseUrl + "/api/app/actions", {
      method: "POST",
      headers: {
        authorization: "Bearer synthetic-jwt",
        "x-cafeos-tenant-id": TENANT_A,
        "content-type": "application/json"
      },
      body: JSON.stringify({ attentionItemId: ATTENTION_A })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.action.id, ACTION_A);
    assert.equal(body.action.action_type, "investigate");
  });

  assert.equal(calls.some(call => call.u.pathname === "/rest/v1/actions" && call.init.method === "POST"), true);
});

test("E1 UI locks synthetic provenance, memory-only auth and bounded workflow surface", async () => {
  const html = await readFile(new URL("../web/control-tower-e1.html", import.meta.url), "utf8");

  assert.match(html, /DEMO \/ SYNTHETIC CONTROL TOWER DATA — NOT YOUR STORE DATA/);
  assert.match(html, /operator_synthetic_assisted/);
  assert.match(html, /let accessToken=null/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.doesNotMatch(html, /SUPABASE_SECRET|SERVICE_ROLE|sb_secret_/i);
  assert.match(html, /\/api\/app\/session/);
  assert.match(html, /\/api\/app\/stores/);
  assert.match(html, /\/api\/app\/brief/);
  assert.match(html, /\/api\/app\/attention/);
  assert.match(html, /\/api\/app\/store-health/);
  assert.match(html, /\/api\/app\/actions/);
  assert.match(html, /\/api\/app\/action-status/);
  assert.match(html, /\/api\/app\/measurement-window/);
  assert.match(html, /\/api\/app\/action-detail/);
  assert.match(html, /before\/after measured change — not causal attribution/);

  assert.doesNotMatch(html, /transaction_line_items|raw transaction|customer 360|campaign delivery/i);
  assert.doesNotMatch(html, /chart builder|generic task|AI chat|payroll|accounting/i);
});

test("E1 local server routes existing app handlers without adding Vercel functions", async () => {
  const serverSource = await readFile(
    new URL("../scripts/serve-vercel-preview.mjs", import.meta.url),
    "utf8"
  );
  const vercel = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8")
  );

  assert.match(serverSource, /sessionHandle/);
  assert.match(serverSource, /storesHandle/);
  assert.match(serverSource, /attentionHandle/);
  assert.match(serverSource, /briefHandle/);
  assert.match(serverSource, /storeHealthHandle/);
  assert.match(serverSource, /dispatchWorkflow/);
  assert.match(serverSource, /control-tower-e1\.html/);
  assert.equal(vercel.git?.deploymentEnabled, false);
  assert.equal(
    vercel.rewrites.some(rule => rule.source === "/control-tower-e1"),
    false,
    "E1 UI should remain local-only"
  );
});
