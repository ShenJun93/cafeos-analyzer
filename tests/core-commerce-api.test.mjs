import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  requireCommerceWriteRole,
  requireCommerceManagerRole
} from "../api/_app-auth.mjs";
import { dispatchWorkflow, WORKFLOW_ROUTES } from "../api/app/workflow.mjs";
import { handle as clientConfigHandle } from "../server/commerce/client-config.mjs";
import { handle as menuHandle } from "../server/commerce/menu.mjs";
import { handle as orderHandle } from "../server/commerce/order.mjs";
import { handle as paymentHandle } from "../server/commerce/payment.mjs";
import { handle as orderStatusHandle } from "../server/commerce/order-status.mjs";
import { handle as openOrdersHandle } from "../server/commerce/open-orders.mjs";
import { handle as dashboardHandle } from "../server/commerce/dashboard.mjs";
import { handle as dailyCloseHandle } from "../server/commerce/daily-close.mjs";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const USER_A = "a0000000-0000-4000-8000-000000000001";
const STORE_A = "11000000-0000-4000-8000-000000000001";
const ITEM_A = "15000000-0000-4000-8000-000000000001";
const ORDER_A = "16000000-0000-4000-8000-000000000001";
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
function authFetch(role = "owner", business = async () => jsonResponse([])) {
  return async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return jsonResponse({ id: USER_A });
    if (u.pathname === "/rest/v1/tenant_members") {
      return jsonResponse([{ tenant_id: TENANT_A, role }]);
    }
    return business(u, init);
  };
}
const authHeaders = {
  authorization: "Bearer jwt",
  "x-cafeos-tenant-id": TENANT_A
};

test("commerce role helpers preserve Control Tower roles and add bounded commerce roles", () => {
  for (const role of ["owner", "admin", "manager", "cashier"]) {
    assert.equal(requireCommerceWriteRole({ tenant: { role } }).tenant.role, role);
  }
  assert.throws(() => requireCommerceWriteRole({ tenant: { role: "analyst" } }), /commerce/i);
  assert.throws(() => requireCommerceWriteRole({ tenant: { role: "viewer" } }), /commerce/i);

  for (const role of ["owner", "admin", "manager"]) {
    assert.equal(requireCommerceManagerRole({ tenant: { role } }).tenant.role, role);
  }
  assert.throws(() => requireCommerceManagerRole({ tenant: { role: "cashier" } }), /manager/i);
});

test("client config exposes only public Supabase browser configuration", async () => {
  const response = res();
  await clientConfigHandle(req({}, "GET"), response, { env });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsed(response), {
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test"
  });

  const source = await readFile(new URL("../server/commerce/client-config.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /SERVICE_ROLE|SUPABASE_SECRET|secret[_-]?key/i);
});

test("menu GET is tenant scoped and menu POST is manager bounded with strict bodies", async () => {
  const getResponse = res();
  await menuHandle(
    req(authHeaders, "GET", "/api/app/commerce-menu"),
    getResponse,
    {
      env,
      fetchImpl: authFetch("cashier", async (u) => {
        if (u.pathname === "/rest/v1/menu_categories") {
          assert.equal(u.searchParams.get("tenant_id"), "eq." + TENANT_A);
          return jsonResponse([{ id: "cat-1", name: "Coffee", sort_order: 0, active: true }]);
        }
        if (u.pathname === "/rest/v1/menu_items") {
          assert.equal(u.searchParams.get("tenant_id"), "eq." + TENANT_A);
          return jsonResponse([{ id: ITEM_A, category_id: "cat-1", name: "Latte", price: 50000, active: true }]);
        }
        return jsonResponse({}, 500);
      })
    }
  );
  assert.equal(getResponse.statusCode, 200);
  assert.equal(parsed(getResponse).items[0].id, ITEM_A);

  const cashierResponse = res();
  await menuHandle(
    req(authHeaders, "POST", "/api/app/commerce-menu", { kind: "category", name: "Tea" }),
    cashierResponse,
    { env, fetchImpl: authFetch("cashier") }
  );
  assert.equal(cashierResponse.statusCode, 403);

  const unknownResponse = res();
  await menuHandle(
    req(authHeaders, "POST", "/api/app/commerce-menu", { kind: "category", name: "Tea", trusted: true }),
    unknownResponse,
    { env, fetchImpl: authFetch("manager") }
  );
  assert.equal(unknownResponse.statusCode, 400);
  assert.equal(parsed(unknownResponse).error.code, "BODY_FIELD_FORBIDDEN");
});

test("order handler accepts only bounded intent fields and delegates trusted totals to fixed RPC", async () => {
  const calls = [];
  const response = res();
  await orderHandle(
    req(authHeaders, "POST", "/api/app/commerce-order", {
      storeId: STORE_A,
      clientOrderKey: "terminal-1-0001",
      channel: "counter",
      items: [{ menuItemId: ITEM_A, quantity: 2 }]
    }),
    response,
    {
      env,
      fetchImpl: authFetch("cashier", async (u, init) => {
        calls.push({ u, init });
        if (u.pathname === "/rest/v1/rpc/commerce_create_order") {
          return jsonResponse({ order: { id: ORDER_A, total: 100000 }, items: [] });
        }
        return jsonResponse({}, 500);
      })
    }
  );
  assert.equal(response.statusCode, 201);
  const rpc = calls.find(x => x.u.pathname === "/rest/v1/rpc/commerce_create_order");
  assert.ok(rpc);
  assert.deepEqual(JSON.parse(rpc.init.body), {
    p_tenant_id: TENANT_A,
    p_store_id: STORE_A,
    p_client_order_key: "terminal-1-0001",
    p_channel: "counter",
    p_items: [{ menuItemId: ITEM_A, quantity: 2 }]
  });

  const forbidden = res();
  await orderHandle(
    req(authHeaders, "POST", "/api/app/commerce-order", {
      storeId: STORE_A,
      clientOrderKey: "x",
      channel: "counter",
      items: [{ menuItemId: ITEM_A, quantity: 1 }],
      total: 1
    }),
    forbidden,
    { env, fetchImpl: authFetch("cashier") }
  );
  assert.equal(forbidden.statusCode, 400);
  assert.equal(parsed(forbidden).error.code, "BODY_FIELD_FORBIDDEN");
});

test("payment, dashboard, and close handlers call only the fixed commerce RPCs", async () => {
  const seen = [];
  const fetchImpl = authFetch("manager", async (u, init) => {
    seen.push({ path: u.pathname, init });
    if (u.pathname === "/rest/v1/rpc/commerce_capture_payment") {
      return jsonResponse({ orderId: ORDER_A, status: "paid", payment: { amount: 100000 } });
    }
    if (u.pathname === "/rest/v1/rpc/commerce_daily_dashboard") {
      return jsonResponse({ storeId: STORE_A, businessDate: "2026-10-25", source: "cafeos_pos" });
    }
    if (u.pathname === "/rest/v1/rpc/commerce_close_day") {
      return jsonResponse({ id: "close-1", storeId: STORE_A, businessDate: "2026-10-25" });
    }
    return jsonResponse({}, 500);
  });

  const pay = res();
  await paymentHandle(
    req(authHeaders, "POST", "/api/app/commerce-payment", {
      orderId: ORDER_A,
      method: "cash",
      amount: 100000,
      reference: null
    }),
    pay,
    { env, fetchImpl }
  );
  assert.equal(pay.statusCode, 201);

  const dashboard = res();
  await dashboardHandle(
    req(authHeaders, "GET", "/api/app/commerce-dashboard?storeId=" + STORE_A + "&businessDate=2026-10-25"),
    dashboard,
    { env, fetchImpl }
  );
  assert.equal(dashboard.statusCode, 200);

  const close = res();
  await dailyCloseHandle(
    req(authHeaders, "POST", "/api/app/commerce-daily-close", {
      storeId: STORE_A,
      businessDate: "2026-10-25"
    }),
    close,
    { env, fetchImpl }
  );
  assert.equal(close.statusCode, 201);

  assert.deepEqual(
    seen.map(x => x.path),
    [
      "/rest/v1/rpc/commerce_capture_payment",
      "/rest/v1/rpc/commerce_daily_dashboard",
      "/rest/v1/rpc/commerce_close_day"
    ]
  );
});

test("workflow dispatcher maps commerce routes without adding another Vercel API source", async () => {
  for (const route of [
    "client-config",
    "commerce-menu",
    "commerce-order",
    "commerce-payment",
    "commerce-order-status",
    "commerce-open-orders",
    "commerce-dashboard",
    "commerce-daily-close"
  ]) {
    assert.equal(typeof WORKFLOW_ROUTES[route], "function", "missing workflow route " + route);
  }

  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const expected = new Map([
    ["/api/app/client-config", "/api/app/workflow?route=client-config"],
    ["/api/app/commerce-menu", "/api/app/workflow?route=commerce-menu"],
    ["/api/app/commerce-order", "/api/app/workflow?route=commerce-order"],
    ["/api/app/commerce-payment", "/api/app/workflow?route=commerce-payment"],
    ["/api/app/commerce-order-status", "/api/app/workflow?route=commerce-order-status"],
    ["/api/app/commerce-open-orders", "/api/app/workflow?route=commerce-open-orders"],
    ["/api/app/commerce-dashboard", "/api/app/workflow?route=commerce-dashboard"],
    ["/api/app/commerce-daily-close", "/api/app/workflow?route=commerce-daily-close"]
  ]);
  for (const [source, destination] of expected) {
    assert.equal(
      config.rewrites.some(x => x.source === source && x.destination === destination),
      true,
      "missing rewrite " + source
    );
  }

  async function countApi(dir = new URL("../api/", import.meta.url)) {
    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) count += await countApi(child);
      else if (/\.(?:mjs|cjs|js|ts)$/.test(entry.name)) count += 1;
    }
    return count;
  }
  assert.ok(await countApi() <= 12);
});

test("workflow dispatch can call a commerce handler through the single application function", async () => {
  const response = res();
  const seen = [];
  await dispatchWorkflow(
    req({}, "GET", "/api/app/workflow?route=commerce-dashboard"),
    response,
    {},
    { "commerce-dashboard": async () => { seen.push("commerce-dashboard"); } }
  );
  assert.deepEqual(seen, ["commerce-dashboard"]);
});

test("order status endpoint is authenticated, GET-only, tenant-scoped and read-only", async () => {
  const calls = [];
  const response = res();
  await orderStatusHandle(req(authHeaders, "GET", "/api/app/commerce-order-status?orderId=" + ORDER_A),
    response, { env, fetchImpl: authFetch("cashier", async (url) => {
      calls.push(url);
      return jsonResponse([{ id: ORDER_A, store_id: STORE_A, status: "paid", total: 100000 }]);
    }) });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsed(response).order, {
    id: ORDER_A, storeId: STORE_A, status: "paid", total: 100000
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, "/rest/v1/pos_orders");
  assert.equal(calls[0].searchParams.get("tenant_id"), "eq." + TENANT_A);
  assert.equal(calls[0].searchParams.get("id"), "eq." + ORDER_A);
  assert.equal(calls[0].searchParams.get("select"), "id,store_id,status,total");

  const absent = res();
  await orderStatusHandle(req(authHeaders, "GET", "/api/app/commerce-order-status?orderId=" + ORDER_A),
    absent, { env, fetchImpl: authFetch("cashier") });
  assert.equal(absent.statusCode, 404);

  const noAuth = res();
  await orderStatusHandle(req({}, "GET", "/api/app/commerce-order-status?orderId=" + ORDER_A),
    noAuth, { env, fetchImpl: authFetch("cashier") });
  assert.equal(noAuth.statusCode, 401);

  const post = res();
  await orderStatusHandle(req(authHeaders, "POST", "/api/app/commerce-order-status?orderId=" + ORDER_A),
    post, { env, fetchImpl: authFetch("cashier") });
  assert.equal(post.statusCode, 405);
});

test("cashier can list bounded open orders for own tenant/store; viewer, wrong status and anon denied", async () => {
  const calls = [];
  const response = res();
  await openOrdersHandle(
    req(authHeaders, "GET", "/api/app/commerce-open-orders?storeId=" + STORE_A),
    response,
    { env, fetchImpl: authFetch("cashier", async (url) => {
      calls.push(url);
      return jsonResponse([{
        id: ORDER_A, order_number: "C-101", store_id: STORE_A,
        status: "open", total: 35000, created_at: "2026-10-25T08:00:00Z", channel: "counter"
      }]);
    }) }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(parsed(response).orders[0].id, ORDER_A);
  assert.equal(parsed(response).orders[0].status, "open");
  assert.equal(calls[0].pathname, "/rest/v1/pos_orders");
  assert.equal(calls[0].searchParams.get("tenant_id"), "eq." + TENANT_A);
  assert.equal(calls[0].searchParams.get("store_id"), "eq." + STORE_A);
  assert.equal(calls[0].searchParams.get("status"), "eq.open");
  assert.equal(calls[0].searchParams.get("limit"), "21");
  assert.equal(calls[0].searchParams.get("order"), "created_at.desc,id.desc");
  assert.equal(calls[0].searchParams.get("offset"), "0");
  assert.equal(parsed(response).nextOffset, null);

  const viewer = res();
  await openOrdersHandle(req(authHeaders, "GET",
    "/api/app/commerce-open-orders?storeId=" + STORE_A), viewer,
    { env, fetchImpl: authFetch("viewer") });
  assert.equal(viewer.statusCode, 403);

  const invalid = res();
  await openOrdersHandle(req(authHeaders, "GET",
    "/api/app/commerce-open-orders?storeId=nope"), invalid,
    { env, fetchImpl: authFetch("cashier") });
  assert.equal(invalid.statusCode, 400);

  const malformed = res();
  await openOrdersHandle(req(authHeaders, "GET",
    "/api/app/commerce-open-orders?storeId=" + STORE_A), malformed,
    { env, fetchImpl: authFetch("cashier", async () => jsonResponse([
      { id: ORDER_A, store_id: STORE_A, status: "paid", total: 35000 }
    ])) });
  assert.equal(malformed.statusCode, 502);

  const anonymous = res();
  await openOrdersHandle(req({}, "GET",
    "/api/app/commerce-open-orders?storeId=" + STORE_A), anonymous,
    { env, fetchImpl: authFetch("cashier") });
  assert.equal(anonymous.statusCode, 401);
});

// Recovery pagination is server-bounded: one extra row is fetched to detect more pages.
test("open-order recovery paginates older orders without unbounded reads", async () => {
  const offsets = [];
  const sample = Array.from({ length: 21 }, (_, i) => ({
    id: `16000000-0000-4000-8000-${String(i+1).padStart(12, "0")}`,
    store_id: STORE_A, order_number: "C-" + i, status: "open", total: 1000
  }));
  const deps = {
    env,
    fetchImpl: authFetch("cashier", async (url) => {
      if (url.pathname !== "/rest/v1/pos_orders") return jsonResponse({}, 500);
      offsets.push(url.searchParams.get("offset"));
      assert.equal(url.searchParams.get("limit"), "21");
      assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
      return jsonResponse(sample);
    })
  };
  const first = res();
  await openOrdersHandle(req(authHeaders, "GET",
    "/api/app/commerce-open-orders?storeId=" + STORE_A), first, deps);
  assert.equal(first.statusCode, 200);
  assert.equal(parsed(first).orders.length, 20);
  assert.equal(parsed(first).nextOffset, 20);

  const second = res();
  await openOrdersHandle(req(authHeaders, "GET",
    "/api/app/commerce-open-orders?storeId=" + STORE_A + "&offset=20"), second, deps);
  assert.equal(second.statusCode, 200);
  assert.equal(parsed(second).nextOffset, 40);
  assert.deepEqual(offsets, ["0", "20"]);

  for (const invalidOffset of ["-1", "10001", "0.5", "foo", "0003"]) {
    const failed = res();
    await openOrdersHandle(req(authHeaders, "GET",
      "/api/app/commerce-open-orders?storeId=" + STORE_A + "&offset=" + invalidOffset),
      failed, deps);
    assert.equal(failed.statusCode, 400);
    assert.equal(parsed(failed).error.code, "COMMERCE_OPEN_ORDERS_OFFSET_INVALID");
  }
});

test("Menu accepts exact two-decimal prices rejected by binary-float multiplication", async () => {
  const accepted = [0.07, 0.29, 2.55, 19999.99, "0.29", 0, 35000];
  for (const price of accepted) {
    let transmitted;
    const response = res();
    await menuHandle(req(authHeaders, "POST", "/api/app/commerce-menu", {
      kind: "item", name: "Decimal menu regression", price
    }), response, {
      env,
      fetchImpl: authFetch("manager", async (url, init) => {
        assert.equal(url.pathname, "/rest/v1/menu_items");
        transmitted = JSON.parse(init.body).price;
        return jsonResponse([{ id: ITEM_A, price: transmitted }], 201);
      })
    });
    assert.equal(response.statusCode, 201, "Menu should accept: " + price);
    assert.equal(transmitted, Number(price));
  }
  for (const price of [null, true, [1], -1, 0.001, 2.555, "0.290", "1e3", 1000000000.01]) {
    const response = res();
    await menuHandle(req(authHeaders, "POST", "/api/app/commerce-menu", {
      kind: "item", name: "Invalid precision", price
    }), response, { env, fetchImpl: authFetch("manager") });
    assert.equal(response.statusCode, 400, "Menu must reject: " + String(price));
    assert.equal(parsed(response).error.code, "MENU_ITEM_PRICE_INVALID");
  }
});

test("Payment amount rejects invalid scale/types but accepts common floating-decimal cent values", async () => {
  for (const amount of [0.07, 0.29, 2.55, 19999.99, "2.55", 35000]) {
    let transmitted;
    const response = res();
    await paymentHandle(req(authHeaders, "POST", "/api/app/commerce-payment", {
      orderId: ORDER_A, method: "cash", amount
    }), response, { env, fetchImpl: authFetch("cashier", async (url, init) => {
      assert.equal(url.pathname, "/rest/v1/rpc/commerce_capture_payment");
      transmitted = JSON.parse(init.body).p_amount;
      return jsonResponse({ orderId: ORDER_A, status: "paid", payment: { amount: transmitted } });
    }) });
    assert.equal(response.statusCode, 201, "Payment should accept: " + amount);
    assert.equal(transmitted, Number(amount));
  }
  for (const amount of [null, true, [], [1], -1, 0, 0.001, 2.555, "0.290", "1e3", 1000000000000.01]) {
    const response = res();
    await paymentHandle(req(authHeaders, "POST", "/api/app/commerce-payment", {
      orderId: ORDER_A, method: "cash", amount
    }), response, { env, fetchImpl: authFetch("cashier") });
    assert.equal(response.statusCode, 400, "Payment must reject: " + String(amount));
    assert.equal(parsed(response).error.code, "COMMERCE_PAYMENT_AMOUNT_INVALID");
  }
});
