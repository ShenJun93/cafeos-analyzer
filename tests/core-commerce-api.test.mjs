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
import { handle as receiptHandle } from "../server/commerce/receipt.mjs";
import { handle as openOrdersHandle } from "../server/commerce/open-orders.mjs";
import { handle as paidOrdersHandle } from "../server/commerce/paid-orders.mjs";
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


test("POS Menu read fails closed on malformed, financial-invalid and truncated catalog data", async () => {
  const category = { id: "cat-1", name: "Coffee", sort_order: 0, active: true };
  const item = { id: ITEM_A, category_id: "cat-1", name: "Latte",
    price: "35000.00", active: true };
  const failures = [
    { categories: { categories: [category] }, items: [item],
      status: 502, code: "COMMERCE_MENU_UPSTREAM_INVALID" },
    { categories: [category], items: null,
      status: 502, code: "COMMERCE_MENU_UPSTREAM_INVALID" },
    { categories: [{ ...category, active: false }], items: [item],
      status: 502, code: "COMMERCE_MENU_UPSTREAM_INVALID" },
    { categories: [category], items: [{ ...item, price: "NaN" }],
      status: 502, code: "COMMERCE_MENU_UPSTREAM_INVALID" },
    { categories: [category], items: [{ ...item, price: "0.001" }],
      status: 502, code: "COMMERCE_MENU_UPSTREAM_INVALID" },
    { categories: [category], items: [{ ...item, price: true }],
      status: 502, code: "COMMERCE_MENU_UPSTREAM_INVALID" },
    { categories: Array.from({ length: 200 }, () => category), items: [item],
      status: 503, code: "COMMERCE_MENU_CATALOG_LIMIT" },
    { categories: [category], items: Array.from({ length: 1000 }, () => item),
      status: 503, code: "COMMERCE_MENU_CATALOG_LIMIT" }
  ];
  for (const { categories, items, status, code } of failures) {
    const reads = [];
    const response = res();
    await menuHandle(req(authHeaders, "GET", "/api/app/commerce-menu"), response, {
      env,
      fetchImpl: authFetch("cashier", async url => {
        reads.push(url.pathname);
        assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT_A);
        if (url.pathname === "/rest/v1/menu_categories") {
          assert.equal(url.searchParams.get("limit"), "200");
          return jsonResponse(categories);
        }
        if (url.pathname === "/rest/v1/menu_items") {
          assert.equal(url.searchParams.get("limit"), "1000");
          return jsonResponse(items);
        }
        return jsonResponse({}, 500);
      })
    });
    assert.equal(response.statusCode, status, "invalid or capped Menu must be rejected");
    assert.equal(parsed(response).error.code, code);
    assert.deepEqual(reads.sort(), ["/rest/v1/menu_categories", "/rest/v1/menu_items"]);
  }

  const healthy = res();
  await menuHandle(req(authHeaders, "GET", "/api/app/commerce-menu"), healthy, {
    env, fetchImpl: authFetch("cashier", async url => jsonResponse(
      url.pathname === "/rest/v1/menu_categories" ? [category] : [
        { ...item, price: "0.29" }, { ...item, price: 0 }
      ]))
  });
  assert.equal(healthy.statusCode, 200, "valid exact-decimal and zero-price Menu remains readable");
  assert.equal(parsed(healthy).items.length, 2);
});

test("Menu manager writes reject implicit coercion of category, SKU, names and record kind", async () => {
  let insertCalls = 0;
  const deps = {
    env,
    fetchImpl: authFetch("manager", async (url, init) => {
      if (init.method === "POST" && /^\/rest\/v1\/menu_(items|categories)$/.test(url.pathname)) {
        insertCalls++;
        return jsonResponse([{ id: ITEM_A }], 201);
      }
      return jsonResponse({}, 500);
    })
  };
  const invalidCases = [
    ...[true, 9, [], ["Tea"], {}, null].map(name => ({
      body: { kind: "category", name }, code: "MENU_CATEGORY_NAME_INVALID"
    })),
    ...["1", null, true, [], [1], {}].map(sortOrder => ({
      body: { kind: "category", name: "Tea", sortOrder }, code: "MENU_CATEGORY_SORT_INVALID"
    })),
    ...[true, 9, [], ["Coffee"], {}].map(name => ({
      body: { kind: "item", name, price: 35000 }, code: "MENU_ITEM_NAME_INVALID"
    })),
    ...[true, 123, [], ["SKU-1"], {}].map(sku => ({
      body: { kind: "item", name: "Latte", price: 35000, sku }, code: "MENU_ITEM_SKU_INVALID"
    })),
    ...[[ITEM_A], true, 123, {}].map(categoryId => ({
      body: { kind: "item", name: "Latte", price: 35000, categoryId }, code: "MENU_CATEGORY_INVALID"
    })),
    ...[["item"], { value: "item" }, true, 1].map(kind => ({
      body: { kind, name: "Latte", price: 35000 }, code: "MENU_KIND_INVALID"
    }))
  ];
  for (const { body, code } of invalidCases) {
    const response = res();
    await menuHandle(req(authHeaders, "POST", "/api/app/commerce-menu", body), response, deps);
    assert.equal(response.statusCode, 400, "must reject " + JSON.stringify(body));
    assert.equal(parsed(response).error.code, code);
  }
  assert.equal(insertCalls, 0, "malformed Menu records must never reach Supabase INSERT");

  for (const body of [
    { kind: "category", name: "Tea", sortOrder: 0 },
    { kind: "category", name: "Coffee", sortOrder: -2 },
    { kind: "item", name: "Latte", sku: null, categoryId: ITEM_A, price: 35000 },
    { kind: "item", name: "Tea", sku: "TEA-01", categoryId: null, price: "20000.25" }
  ]) {
    const response = res();
    await menuHandle(req(authHeaders, "POST", "/api/app/commerce-menu", body), response, deps);
    assert.equal(response.statusCode, 201, "must preserve well-typed Menu record " + JSON.stringify(body));
  }
  assert.equal(insertCalls, 4);
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

test("POS rejects quantity coercion and excess scale before creating a trusted order", async () => {
  const invalidQuantities = [
    null, undefined, true, false, [], [1], {}, { value: 1 },
    "", " ", "1e2", "0x2", "Infinity", "-1", "+1", "01",
    0, -1, 0.0001, 1.0001, "2.0000", "0.0001", "1000.001", 1000.001,
    1001, Infinity, NaN
  ];
  let rpcCalls = 0;
  const deps = {
    env,
    fetchImpl: authFetch("cashier", async (url) => {
      if (url.pathname === "/rest/v1/rpc/commerce_create_order") {
        rpcCalls += 1;
      }
      return jsonResponse({}, 500);
    })
  };
  for (const quantity of invalidQuantities) {
    const response = res();
    await orderHandle(req(authHeaders, "POST", "/api/app/commerce-order", {
      storeId: STORE_A, clientOrderKey: "invalid-quantity", channel: "counter",
      items: [{ menuItemId: ITEM_A, quantity }]
    }), response, deps);
    assert.equal(response.statusCode, 400, "must reject quantity " + String(quantity));
    assert.equal(parsed(response).error.code, "COMMERCE_ITEMS_INVALID");
  }
  assert.equal(rpcCalls, 0, "invalid quantities must never reach trusted order RPC");

  for (const [quantity, expected] of [
    [1, 1], [0.001, 0.001], ["0.001", 0.001], [2.555, 2.555],
    ["2.550", 2.55], [1000, 1000], ["1000.000", 1000]
  ]) {
    let captured;
    const response = res();
    await orderHandle(req(authHeaders, "POST", "/api/app/commerce-order", {
      storeId: STORE_A, clientOrderKey: "valid-quantity", channel: "counter",
      items: [{ menuItemId: ITEM_A, quantity }]
    }), response, {
      env, fetchImpl: authFetch("cashier", async (url, init) => {
        assert.equal(url.pathname, "/rest/v1/rpc/commerce_create_order");
        captured = JSON.parse(init.body).p_items[0].quantity;
        return jsonResponse({ order: { id: ORDER_A, total: 50000 }, items: [] });
      })
    });
    assert.equal(response.statusCode, 201, "must accept quantity " + String(quantity));
    assert.equal(captured, expected);
  }
});

test("POS order identifiers and settlement references reject implicit string coercion", async () => {
  let businessRpcCalls = 0;
  const deps = {
    env,
    fetchImpl: authFetch("cashier", async (url) => {
      if (url.pathname.startsWith("/rest/v1/rpc/commerce_")) businessRpcCalls++;
      return jsonResponse({}, 500);
    })
  };
  for (const clientOrderKey of [null, true, 7, [], ["intent-7"], { key: "intent-7" }]) {
    const response = res();
    await orderHandle(req(authHeaders, "POST", "/api/app/commerce-order", {
      storeId: STORE_A, clientOrderKey, channel: "counter",
      items: [{ menuItemId: ITEM_A, quantity: 1 }]
    }), response, deps);
    assert.equal(response.statusCode, 400);
    assert.equal(parsed(response).error.code, "COMMERCE_CLIENT_ORDER_KEY_INVALID");
  }
  for (const menuItemId of [[ITEM_A], { value: ITEM_A }, true, 1]) {
    const response = res();
    await orderHandle(req(authHeaders, "POST", "/api/app/commerce-order", {
      storeId: STORE_A, clientOrderKey: "intent-7", channel: "counter",
      items: [{ menuItemId, quantity: 1 }]
    }), response, deps);
    assert.equal(response.statusCode, 400);
    assert.equal(parsed(response).error.code, "COMMERCE_ITEMS_INVALID");
  }
  for (const method of [["cash"], { value: "cash" }, true]) {
    const response = res();
    await paymentHandle(req(authHeaders, "POST", "/api/app/commerce-payment", {
      orderId: ORDER_A, method, amount: 50000, reference: null
    }), response, deps);
    assert.equal(response.statusCode, 400);
    assert.equal(parsed(response).error.code, "COMMERCE_PAYMENT_METHOD_INVALID");
  }
  for (const reference of [true, false, 123, [], ["BANK-01"], { text: "BANK-01" }]) {
    const response = res();
    await paymentHandle(req(authHeaders, "POST", "/api/app/commerce-payment", {
      orderId: ORDER_A, method: "bank_transfer", amount: 50000, reference
    }), response, deps);
    assert.equal(response.statusCode, 400);
    assert.equal(parsed(response).error.code, "COMMERCE_PAYMENT_REFERENCE_INVALID");
  }
  assert.equal(businessRpcCalls, 0, "malformed intent must not reach business writes");

  for (const reference of ["  BANK-01  ", "", null]) {
    let observed;
    const response = res();
    await paymentHandle(req(authHeaders, "POST", "/api/app/commerce-payment", {
      orderId: ORDER_A, method: "bank_transfer", amount: 50000, reference
    }), response, {
      env, fetchImpl: authFetch("cashier", async (url, init) => {
        assert.equal(url.pathname, "/rest/v1/rpc/commerce_capture_payment");
        observed = JSON.parse(init.body).p_reference;
        return jsonResponse({ orderId: ORDER_A, status: "paid", payment: { method: "bank_transfer", status: "captured", amount: 50000 } });
      })
    });
    assert.equal(response.statusCode, 201);
    assert.equal(observed, reference?.trim() || null);
  }
});

test("payment, dashboard, and close handlers call only the fixed commerce RPCs", async () => {
  const seen = [];
  const fetchImpl = authFetch("manager", async (u, init) => {
    seen.push({ path: u.pathname, init });
    if (u.pathname === "/rest/v1/rpc/commerce_capture_payment") {
      return jsonResponse({ orderId: ORDER_A, status: "paid", payment: { method: "cash", status: "captured", amount: 100000 } });
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
    "commerce-receipt",
    "commerce-open-orders",
    "commerce-paid-orders",
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
    ["/api/app/commerce-receipt", "/api/app/workflow?route=commerce-receipt"],
    ["/api/app/commerce-open-orders", "/api/app/workflow?route=commerce-open-orders"],
    ["/api/app/commerce-paid-orders", "/api/app/workflow?route=commerce-paid-orders"],
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

test("ambiguous checkout recovery rejects malformed order status and settlement totals", async () => {
  const route = "/api/app/commerce-order-status?orderId=" + ORDER_A;
  const good = { id: ORDER_A, store_id: STORE_A, status: "open", total: "35000.00" };
  for (const rows of [
    { rows: [good] },
    [{ ...good }, { ...good }],
    [{ ...good, id: STORE_A }],
    [{ ...good, store_id: "bad-store-id" }],
    [{ ...good, status: "pending" }],
    [{ ...good, total: null }],
    [{ ...good, total: "NaN" }],
    [{ ...good, total: "0.001" }],
    [{ ...good, total: 0 }],
    [{ ...good, total: -100 }],
    [{ ...good, total: true }],
    [{ ...good, total: 1000000000000.01 }]
  ]) {
    const response = res();
    await orderStatusHandle(req(authHeaders, "GET", route), response, {
      env, fetchImpl: authFetch("cashier", async () => jsonResponse(rows))
    });
    assert.equal(response.statusCode, 502, "untrusted status/total must not enable checkout");
    assert.equal(parsed(response).error.code, "SUPABASE_UPSTREAM");
  }
  const valid = res();
  await orderStatusHandle(req(authHeaders, "GET", route), valid, {
    env, fetchImpl: authFetch("cashier", async () => jsonResponse([good]))
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(parsed(valid).order.total, "35000.00");
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
      return jsonResponse({ orderId: ORDER_A, status: "paid", payment: { method: "cash", status: "captured", amount: transmitted } });
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


test("Payment confirmation refuses mismatched capture evidence without retry or a second write", async () => {
  const request = {
    orderId: ORDER_A, method: "cash", amount: "35000.29", reference: "terminal-1"
  };
  const accepted = {
    orderId: ORDER_A, status: "paid",
    payment: { method: "cash", status: "captured", amount: "35000.29" }
  };
  const invalid = [
    { ...accepted, orderId: STORE_A },
    { ...accepted, orderId: null },
    { ...accepted, status: "open" },
    { ...accepted, payment: null },
    { ...accepted, payment: [] },
    { ...accepted, payment: { ...accepted.payment, method: "wallet" } },
    { ...accepted, payment: { ...accepted.payment, status: "pending" } },
    { ...accepted, payment: { ...accepted.payment, amount: "35000.28" } },
    { ...accepted, payment: { ...accepted.payment, amount: "35000.290" } },
    { ...accepted, payment: { ...accepted.payment, amount: "NaN" } },
    { ...accepted, payment: { ...accepted.payment, amount: true } },
    { ...accepted, payment: { ...accepted.payment, amount: 0 } }
  ];
  for (const payload of invalid) {
    let rpcWrites = 0;
    const response = res();
    await paymentHandle(req(authHeaders, "POST", "/api/app/commerce-payment", request),
      response, { env, fetchImpl: authFetch("cashier", async (url, init) => {
        assert.equal(url.pathname, "/rest/v1/rpc/commerce_capture_payment");
        assert.equal(init.method, "POST");
        rpcWrites++;
        return jsonResponse(payload);
      }) });
    assert.equal(response.statusCode, 502, "inconsistent capture must not be acknowledged as paid");
    assert.equal(parsed(response).error.code, "SUPABASE_UPSTREAM");
    assert.equal(rpcWrites, 1, "never make a second capture attempt");
  }

  const valid = res();
  await paymentHandle(req(authHeaders, "POST", "/api/app/commerce-payment", request),
    valid, { env, fetchImpl: authFetch("cashier", async () => jsonResponse({
      ...accepted, payment: { ...accepted.payment, amount: 35000.29 }
    })) });
  assert.equal(valid.statusCode, 201, "valid Postgres numeric-to-JSON decimal remains confirmed");
  assert.equal(parsed(valid).payment.amount, 35000.29);
});

test("paid receipt reads Store/Tenant-scoped immutable items and payment without any writes", async () => {
  const calls = [];
  const paidAt = "2026-10-27T09:30:00Z";
  const business = async (url, init) => {
    calls.push({ url, method: init.method ?? "GET" });
    assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT_A);
    if (url.pathname === "/rest/v1/pos_orders") {
      assert.equal(url.searchParams.get("id"), "eq." + ORDER_A);
      assert.equal(url.searchParams.get("store_id"), "eq." + STORE_A);
      return jsonResponse([{ id: ORDER_A, store_id: STORE_A, order_number: "C-0042",
        channel: "counter", business_date: "2026-10-27", status: "paid",
        subtotal: "70000.00", discount_total: "0.00", tax_total: "0.00",
        total: "70000.00", paid_at: paidAt }]);
    }
    if (url.pathname === "/rest/v1/pos_order_items") {
      assert.equal(url.searchParams.get("order_id"), "eq." + ORDER_A);
      return jsonResponse([{ id: "line-1", order_id: ORDER_A,
        item_name: "Cà phê sữa & <script>unsafe</script>", unit_price: "35000.00",
        quantity: "2.000", line_total: "70000.00" }]);
    }
    if (url.pathname === "/rest/v1/pos_payments") {
      assert.equal(url.searchParams.get("order_id"), "eq." + ORDER_A);
      assert.equal(url.searchParams.get("status"), "eq.captured");
      return jsonResponse([{ order_id: ORDER_A, method: "cash",
        amount: "70000.00", status: "captured", paid_at: paidAt }]);
    }
    if (url.pathname === "/rest/v1/stores") {
      assert.equal(url.searchParams.get("id"), "eq." + STORE_A);
      return jsonResponse([{ id: STORE_A, name: "CafeOS Test Store" }]);
    }
    throw new Error("Unexpected receipt read " + url.pathname);
  };
  const response = res();
  await receiptHandle(req(authHeaders, "GET",
    "/api/app/commerce-receipt?orderId=" + ORDER_A + "&storeId=" + STORE_A),
  response, { env, fetchImpl: authFetch("cashier", business) });
  assert.equal(response.statusCode, 200);
  const receipt = parsed(response).receipt;
  assert.equal(receipt.status, "paid");
  assert.equal(receipt.orderNumber, "C-0042");
  assert.equal(receipt.total, "70000.00");
  assert.equal(receipt.items[0].name, "Cà phê sữa & <script>unsafe</script>");
  assert.equal(receipt.items[0].unitPrice, "35000.00");
  assert.deepEqual(receipt.payment, { method: "cash", amount: "70000.00", paidAt });
  assert.deepEqual(calls.map(x => x.url.pathname).sort(), [
    "/rest/v1/pos_order_items", "/rest/v1/pos_orders",
    "/rest/v1/pos_payments", "/rest/v1/stores"
  ]);
  assert.ok(calls.every(x => x.method === "GET"), "receipt must not write a commerce record");
});

test("paid receipt refuses role misuse, cross-store, unpaid, missing and partial evidence", async () => {
  const route = "/api/app/commerce-receipt?orderId=" + ORDER_A + "&storeId=" + STORE_A;
  let calls = 0;
  const order = {
    id: ORDER_A, store_id: STORE_A, order_number: "C-0042",
    channel: "counter", business_date: "2026-10-27", status: "paid",
    subtotal: "70000.00", discount_total: "0.00", tax_total: "0.00",
    total: "70000.00", paid_at: "2026-10-27T09:30:00Z"
  };
  const payments = [{ order_id: ORDER_A, method: "cash", amount: "70000.00",
    status: "captured", paid_at: order.paid_at }];
  const lines = [{ id: "line-1", order_id: ORDER_A, item_name: "Latte",
    unit_price: "35000.00", quantity: 2, line_total: "70000.00" }];
  const fake = (orderRows, itemRows = lines, payRows = payments) => authFetch("cashier", async url => {
    calls++;
    if (url.pathname === "/rest/v1/pos_orders") return jsonResponse(orderRows);
    if (url.pathname === "/rest/v1/pos_order_items") return jsonResponse(itemRows);
    if (url.pathname === "/rest/v1/pos_payments") return jsonResponse(payRows);
    if (url.pathname === "/rest/v1/stores") return jsonResponse([{ id: STORE_A, name: "Store A" }]);
    return jsonResponse({}, 500);
  });
  for (const [url, code] of [
    ["/api/app/commerce-receipt?storeId=" + STORE_A + "&orderId=nope", "COMMERCE_ORDER_INVALID"],
    ["/api/app/commerce-receipt?orderId=" + ORDER_A + "&storeId=nope", "COMMERCE_STORE_INVALID"]
  ]) {
    const response = res();
    await receiptHandle(req(authHeaders, "GET", url), response, { env, fetchImpl: fake([order]) });
    assert.equal(response.statusCode, 400);
    assert.equal(parsed(response).error.code, code);
  }
  assert.equal(calls, 0, "invalid identifiers must be rejected before DB reads");

  const viewer = res();
  await receiptHandle(req(authHeaders, "GET", route), viewer,
    { env, fetchImpl: authFetch("viewer") });
  assert.equal(viewer.statusCode, 403);
  const anonymous = res();
  await receiptHandle(req({}, "GET", route), anonymous,
    { env, fetchImpl: fake([order]) });
  assert.equal(anonymous.statusCode, 401);
  const method = res();
  await receiptHandle(req(authHeaders, "POST", route, {}), method,
    { env, fetchImpl: fake([order]) });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, "GET");

  for (const [orderRows, itemRows, payRows, status, code] of [
    [[], lines, payments, 404, "COMMERCE_ORDER_NOT_FOUND"],
    [[{ ...order, status: "open" }], lines, payments, 409, "COMMERCE_RECEIPT_NOT_PAID"],
    [[order], [], payments, 502, "COMMERCE_RECEIPT_INCOMPLETE"],
    [[order], lines, [], 502, "COMMERCE_RECEIPT_INCOMPLETE"],
    [[order], lines, [...payments, ...payments], 502, "COMMERCE_RECEIPT_INCOMPLETE"],
    [[order], lines, [{ ...payments[0], paid_at: "2026-10-27T09:30:01Z" }],
      502, "COMMERCE_RECEIPT_INCOMPLETE"],
    [[order], [{ ...lines[0], order_id: STORE_A }], payments, 502, "COMMERCE_RECEIPT_INCOMPLETE"]
  ]) {
    const response = res();
    await receiptHandle(req(authHeaders, "GET", route), response,
      { env, fetchImpl: fake(orderRows, itemRows, payRows) });
    assert.equal(response.statusCode, status);
    assert.equal(parsed(response).error.code, code);
  }
});

test("paid receipt reconciles items, discounts, tax, and captured payment in exact cents", async () => {
  const route = "/api/app/commerce-receipt?orderId=" + ORDER_A + "&storeId=" + STORE_A;
  const base = {
    id: ORDER_A, store_id: STORE_A, order_number: "C-0042",
    channel: "counter", business_date: "2026-10-27", status: "paid",
    subtotal: "70000.00", discount_total: "0.00", tax_total: "0.00",
    total: "70000.00", paid_at: "2026-10-27T09:30:00Z"
  };
  const item = {
    id: "line-1", order_id: ORDER_A, item_name: "Latte",
    unit_price: "35000.00", quantity: "2.000", line_total: "70000.00"
  };
  async function probe(order, items = [item], paidAmount = "70000.00") {
    const response = res();
    await receiptHandle(req(authHeaders, "GET", route), response, {
      env, fetchImpl: authFetch("cashier", async url => {
        if (url.pathname === "/rest/v1/pos_orders") return jsonResponse([order]);
        if (url.pathname === "/rest/v1/pos_order_items") return jsonResponse(items);
        if (url.pathname === "/rest/v1/pos_payments") return jsonResponse([{
          order_id: ORDER_A, method: "cash", amount: paidAmount,
          status: "captured", paid_at: order.paid_at
        }]);
        if (url.pathname === "/rest/v1/stores") return jsonResponse([{ id: STORE_A, name: "Store A" }]);
        return jsonResponse({}, 500);
      })
    });
    return response;
  }
  const adjusted = await probe({
    ...base, discount_total: "5000.07", tax_total: "2000.29", total: "67000.22"
  }, [item], "67000.22");
  assert.equal(adjusted.statusCode, 200, "legitimate discounts and taxes remain printable");
  assert.equal(parsed(adjusted).receipt.discountTotal, "5000.07");
  assert.equal(parsed(adjusted).receipt.taxTotal, "2000.29");

  // PostgreSQL generates numeric(18,2) line_total from numeric(18,2) price
  // multiplied by numeric(12,3) quantity: positive half-cent ties round up.
  const fractional = await probe({ ...base, subtotal: "70000.01", total: "70000.01" }, [
    item,
    { ...item, id: "line-half-cent", unit_price: "0.01",
      quantity: "0.500", line_total: "0.01" },
    { ...item, id: "line-below-half", unit_price: "0.01",
      quantity: "0.499", line_total: "0.00" }
  ], "70000.01");
  assert.equal(fractional.statusCode, 200,
    "valid PostgreSQL numeric(18,2) rounding remains printable");
  assert.equal(parsed(fractional).receipt.items.length, 3);

  for (const [order, items, amount] of [
    [{ ...base, total: "69999.99" }, [item], "69999.99"],
    [{ ...base, subtotal: "69999.99" }, [item], "70000.00"],
    [base, [ { ...item, line_total: "69999.99" } ], "70000.00"],
    [base, [item], "69999.99"],
    [{ ...base, total: "NaN" }, [item], "70000.00"],
    [base, [ { ...item, unit_price: "malformed" } ], "70000.00"],
    [base, [ { ...item, unit_price: "35001.00" } ], "70000.00"],
    [base, [ { ...item, quantity: "1.999" } ], "70000.00"],
    [base, [ { ...item, quantity: "2.0001" } ], "70000.00"],
    [base, [ { ...item, quantity: "0.000" } ], "70000.00"],
    [base, [ { ...item, quantity: true } ], "70000.00"]
  ]) {
    const response = await probe(order, items, amount);
    assert.equal(response.statusCode, 502);
    assert.equal(parsed(response).error.code, "COMMERCE_RECEIPT_TOTAL_MISMATCH");
  }
});

test("paid-order receipt browse is tenant/store scoped, limited, and read-only", async () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({
    id: "16000000-0000-4000-8000-" + String(i+1).padStart(12, "0"),
    store_id: STORE_A, order_number: "C-" + i, status: "paid",
    total: "35000.00", paid_at: "2026-10-27T09:00:00Z",
    business_date: "2026-10-27"
  }));
  let reads = 0;
  const deps = {
    env,
    fetchImpl: authFetch("cashier", async (url, init) => {
      reads++;
      assert.equal(init.method ?? "GET", "GET");
      assert.equal(url.pathname, "/rest/v1/pos_orders");
      assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT_A);
      assert.equal(url.searchParams.get("store_id"), "eq." + STORE_A);
      assert.equal(url.searchParams.get("status"), "eq.paid");
      assert.equal(url.searchParams.get("order"), "paid_at.desc,id.desc");
      assert.equal(url.searchParams.get("limit"), "21");
      assert.equal(url.searchParams.get("select"),
        "id,order_number,store_id,status,total,paid_at,business_date");
      return jsonResponse(rows);
    })
  };
  const uri = "/api/app/commerce-paid-orders?storeId=" + STORE_A;
  const first = res();
  await paidOrdersHandle(req(authHeaders, "GET", uri), first, deps);
  assert.equal(first.statusCode, 200);
  assert.equal(parsed(first).orders.length, 20);
  assert.equal(parsed(first).nextOffset, 20);
  assert.equal(parsed(first).orders[0].orderNumber, "C-0");
  const next = res();
  await paidOrdersHandle(req(authHeaders, "GET", uri + "&offset=20"), next, deps);
  assert.equal(next.statusCode, 200);
  assert.equal(parsed(next).nextOffset, 40);
  assert.equal(reads, 2, "exactly one scoped read per page");

  for (const offset of ["-1", "10001", "1.5", "foo", "001"]) {
    const invalid = res();
    await paidOrdersHandle(req(authHeaders, "GET", uri + "&offset=" + offset), invalid, deps);
    assert.equal(invalid.statusCode, 400);
    assert.equal(parsed(invalid).error.code, "COMMERCE_PAID_ORDERS_OFFSET_INVALID");
  }
  for (const [path, code] of [
    ["/api/app/commerce-paid-orders?storeId=not-uuid", "COMMERCE_STORE_INVALID"]
  ]) {
    const invalid = res();
    await paidOrdersHandle(req(authHeaders, "GET", path), invalid, deps);
    assert.equal(invalid.statusCode, 400);
    assert.equal(parsed(invalid).error.code, code);
  }
  assert.equal(reads, 2, "invalid queries must not reach paid-order data");
});

test("paid-order browsing denies unauthorized callers and fails closed on malformed upstream rows", async () => {
  const uri = "/api/app/commerce-paid-orders?storeId=" + STORE_A;
  for (const [headers, role, expected] of [
    [authHeaders, "viewer", 403],
    [{}, "cashier", 401]
  ]) {
    const response = res();
    await paidOrdersHandle(req(headers, "GET", uri), response,
      { env, fetchImpl: authFetch(role) });
    assert.equal(response.statusCode, expected);
  }
  const notGet = res();
  await paidOrdersHandle(req(authHeaders, "POST", uri, {}), notGet,
    { env, fetchImpl: authFetch("cashier") });
  assert.equal(notGet.statusCode, 405);
  const expected = {
    id: ORDER_A, store_id: STORE_A, order_number: "C-1",
    total: "35000.00", status: "paid",
    business_date: "2026-10-27", paid_at: "2026-10-27T08:30:00Z"
  };
  const responses = [
    [{ ...expected, store_id: TENANT_A }],
    [{ ...expected, status: "open" }],
    [{ ...expected, paid_at: null }],
    [{ ...expected, order_number: "" }],
    Array.from({ length: 22 }, () => expected),
    { orders: [expected] }
  ];
  for (const payload of responses) {
    const response = res();
    await paidOrdersHandle(req(authHeaders, "GET", uri), response, {
      env, fetchImpl: authFetch("cashier", async () => jsonResponse(payload))
    });
    assert.equal(response.statusCode, 502, "untrusted paid list must fail closed");
    assert.equal(parsed(response).error.code, "SUPABASE_UPSTREAM");
  }
});
