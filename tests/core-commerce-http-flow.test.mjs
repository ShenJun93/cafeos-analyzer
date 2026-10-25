import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createVercelShapePreviewServer } from "../scripts/serve-vercel-preview.mjs";

// Contract-level HTTP journey through the actual local Vercel-shaped router.
// The Supabase transport is synthetic, in memory, and intentionally has NO
// permission to access a real Supabase project or production payment account.
const TENANT = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const STORE = "11000000-0000-4000-8000-000000000001";
const ITEM = "15000000-0000-4000-8000-000000000001";
const ORDER = "16000000-0000-4000-8000-000000000001";
const CATEGORY = "17000000-0000-4000-8000-000000000001";
const CASHIER = "a0000000-0000-4000-8000-000000000001";
const MANAGER = "a0000000-0000-4000-8000-000000000002";
const VIEWER = "a0000000-0000-4000-8000-000000000003";
const DATE = "2026-10-25";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json" }
  });
}

test("full CafeOS HTTP pipeline: tenant roles, menu, POS, retry, payment, close and imported-brief boundary", async () => {
  const users = new Map([
    ["cashier-token", { id: CASHIER, role: "cashier" }],
    ["manager-token", { id: MANAGER, role: "manager" }],
    ["viewer-token", { id: VIEWER, role: "viewer" }]
  ]);
  let category = null;
  let item = null;
  let order = null;
  let payment = null;
  let closed = null;
  const upstreamCalls = [];

  const fakeSupabase = async (resource, options = {}) => {
    const url = new URL(resource);
    const path = url.pathname;
    const token = String(options.headers?.authorization ?? "").replace(/^Bearer /i, "");
    const identity = users.get(token);
    upstreamCalls.push({
      path, method: options.method || "GET",
      tenantFilter: url.searchParams.get("tenant_id"),
      storeFilter: url.searchParams.get("store_id")
    });
    const body = options.body ? JSON.parse(options.body) : null;

    if (path === "/auth/v1/user") {
      return identity ? json({ id: identity.id }) : json({ code: "bad_jwt" }, 401);
    }
    if (!identity) return json({ code: "bad_jwt" }, 401);
    if (path === "/rest/v1/tenant_members") {
      return json(url.searchParams.get("tenant_id") === "eq." + OTHER
        ? []
        : [{ tenant_id: TENANT, user_id: identity.id, role: identity.role }]);
    }
    if (path === "/rest/v1/tenants") return json([{ id: TENANT, name: "CafeOS Test" }]);
    if (path === "/rest/v1/stores") {
      assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT);
      return json([{ id: STORE, name: "Test Store", timezone: "Asia/Ho_Chi_Minh", active: true }]);
    }
    if (path === "/rest/v1/menu_categories") {
      if (options.method === "POST") {
        category = { id: CATEGORY, ...body };
        return json([category], 201);
      }
      return json(category ? [category] : []);
    }
    if (path === "/rest/v1/menu_items") {
      if (options.method === "POST") {
        item = { id: ITEM, ...body };
        return json([item], 201);
      }
      return json(item ? [item] : []);
    }
    if (path === "/rest/v1/rpc/commerce_create_order") {
      assert.equal(body.p_tenant_id, TENANT);
      assert.equal(body.p_store_id, STORE);
      assert.equal(body.p_items[0].menuItemId, ITEM);
      assert.equal(Object.hasOwn(body, "total"), false);
      if (order && body.p_client_order_key !== "kiosk-key-1") {
        return json({ message: "COMMERCE_IDEMPOTENCY_CONFLICT" }, 409);
      }
      if (!order) {
        order = {
          id: ORDER, tenantId: TENANT, storeId: STORE,
          clientOrderKey: body.p_client_order_key,
          orderNumber: "C-0001", status: "open", total: item.price * body.p_items[0].quantity
        };
      }
      return json({ order, items: [{ menuItemId: ITEM, unitPrice: item.price, quantity: 2 }] });
    }
    if (path === "/rest/v1/pos_orders") {
      assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT);
      if (url.searchParams.get("id")) {
        return json(order && url.searchParams.get("id") === "eq." + ORDER
          ? [{ id: order.id, store_id: STORE, status: order.status, total: order.total }]
          : []);
      }
      assert.equal(url.searchParams.get("status"), "eq.open");
      assert.equal(url.searchParams.get("store_id"), "eq." + STORE);
      return json(order?.status === "open"
        ? [{
          id: ORDER, store_id: STORE, order_number: "C-0001", channel: "counter",
          status: "open", total: order.total, created_at: DATE + "T07:00:00Z"
        }]
        : []);
    }
    if (path === "/rest/v1/rpc/commerce_capture_payment") {
      assert.equal(body.p_tenant_id, TENANT);
      if (order?.status !== "open") return json({ message: "COMMERCE_ORDER_NOT_OPEN" }, 409);
      if (body.p_amount !== order.total) return json({ message: "COMMERCE_PAYMENT_AMOUNT_MISMATCH" }, 400);
      payment = {
        id: "18000000-0000-4000-8000-000000000001",
        amount: body.p_amount, method: body.p_method, status: "captured"
      };
      order.status = "paid";
      return json({ orderId: ORDER, status: "paid", payment });
    }
    if (path === "/rest/v1/rpc/commerce_daily_dashboard") {
      const paid = Number(order?.status === "paid");
      return json({
        source: "cafeos_pos", tenantId: TENANT, storeId: STORE, businessDate: DATE,
        salesTotal: paid ? order.total : 0, orderCount: paid,
        openOrderCount: Number(order?.status === "open"),
        aov: paid ? order.total : null,
        closed: Boolean(closed), paymentMix: payment ? { [payment.method]: payment.amount } : {}
      });
    }
    if (path === "/rest/v1/rpc/commerce_close_day") {
      assert.equal(body.p_tenant_id, TENANT);
      if (order?.status === "open") return json({ message: "COMMERCE_CLOSE_OPEN_ORDERS" }, 409);
      closed ??= {
        id: "19000000-0000-4000-8000-000000000001", storeId: STORE,
        businessDate: DATE, salesTotal: order?.total || 0, orderCount: Number(Boolean(order))
      };
      return json(closed);
    }
    if (path === "/rest/v1/rpc/daily_brief_aggregate") {
      // Imported transaction facts are intentionally not POS sales in v1.
      return json({
        asOfBusinessDate: DATE, freshness: { status: "no_data" },
        coverage: { source: "imported" }, metrics: { netSales: { current: 0 } }
      });
    }
    if (path === "/rest/v1/attention_items" || path === "/rest/v1/actions") return json([]);
    throw new Error("Unexpected synthetic Supabase operation: " + path);
  };

  const server = createVercelShapePreviewServer({
    root: new URL("..", import.meta.url).pathname,
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic"
    },
    fetchImpl: fakeSupabase
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  async function call(path, token = "cashier-token", method = "GET", payload, tenant = TENANT) {
    const response = await fetch(base + path, {
      method,
      headers: {
        authorization: "Bearer " + token,
        "x-cafeos-tenant-id": tenant,
        ...(payload === undefined ? {} : { "content-type": "application/json" })
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
    const content = await response.json();
    return { status: response.status, body: content };
  }

  try {
    const shell = await fetch(base + "/app");
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /cafeos-app-shell/);

    const unauthorized = await fetch(base + "/api/app/commerce-open-orders?storeId=" + STORE);
    assert.equal(unauthorized.status, 401);
    const cross = await call("/api/app/commerce-menu", "cashier-token", "GET", undefined, OTHER);
    assert.equal(cross.status, 403);
    assert.equal(cross.body.error.code, "TENANT_FORBIDDEN");

    const denied = await call("/api/app/commerce-menu", "cashier-token", "POST",
      { kind: "category", name: "Cafe" });
    assert.equal(denied.status, 403);

    const createdCategory = await call("/api/app/commerce-menu", "manager-token", "POST",
      { kind: "category", name: "Coffee", sortOrder: 0 });
    assert.equal(createdCategory.status, 201);
    const createdItem = await call("/api/app/commerce-menu", "manager-token", "POST",
      { kind: "item", name: "Latte", categoryId: CATEGORY, sku: "LAT-1", price: 35000 });
    assert.equal(createdItem.status, 201);

    const menu = await call("/api/app/commerce-menu");
    assert.equal(menu.status, 200);
    assert.equal(menu.body.items[0].price, 35000);

    const intent = {
      storeId: STORE, clientOrderKey: "kiosk-key-1", channel: "counter",
      items: [{ menuItemId: ITEM, quantity: 2 }]
    };
    const tamper = await call("/api/app/commerce-order", "cashier-token", "POST",
      { ...intent, total: 1 });
    assert.equal(tamper.status, 400);
    assert.equal(tamper.body.error.code, "BODY_FIELD_FORBIDDEN");

    const firstOrder = await call("/api/app/commerce-order", "cashier-token", "POST", intent);
    assert.equal(firstOrder.status, 201);
    assert.equal(firstOrder.body.order.total, 70000);
    const retry = await call("/api/app/commerce-order", "cashier-token", "POST", intent);
    assert.equal(retry.status, 201);
    assert.equal(retry.body.order.id, firstOrder.body.order.id);

    const open = await call("/api/app/commerce-open-orders?storeId=" + STORE);
    assert.equal(open.status, 200);
    assert.deepEqual(open.body.orders.map(x => x.id), [ORDER]);
    const viewDenied = await call("/api/app/commerce-open-orders?storeId=" + STORE, "viewer-token");
    assert.equal(viewDenied.status, 403);

    const closeTooSoon = await call("/api/app/commerce-daily-close", "manager-token", "POST",
      { storeId: STORE, businessDate: DATE });
    assert.equal(closeTooSoon.status, 409);
    assert.equal(closeTooSoon.body.error.code, "COMMERCE_CLOSE_OPEN_ORDERS");

    const wrongPayment = await call("/api/app/commerce-payment", "cashier-token", "POST",
      { orderId: ORDER, method: "cash", amount: 1 });
    assert.equal(wrongPayment.status, 400);
    assert.equal(wrongPayment.body.error.code, "COMMERCE_PAYMENT_AMOUNT_MISMATCH");

    const capture = await call("/api/app/commerce-payment", "cashier-token", "POST",
      { orderId: ORDER, method: "cash", amount: 70000 });
    assert.equal(capture.status, 201);
    assert.equal(capture.body.status, "paid");

    const status = await call("/api/app/commerce-order-status?orderId=" + ORDER);
    assert.equal(status.status, 200);
    assert.equal(status.body.order.status, "paid");
    const second = await call("/api/app/commerce-payment", "cashier-token", "POST",
      { orderId: ORDER, method: "cash", amount: 70000 });
    assert.equal(second.status, 409);

    const after = await call("/api/app/commerce-open-orders?storeId=" + STORE);
    assert.equal(after.status, 200);
    assert.deepEqual(after.body.orders, []);

    const dashboard = await call("/api/app/commerce-dashboard?storeId=" + STORE);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.dashboard.salesTotal, 70000);
    assert.equal(dashboard.body.dashboard.source, "cafeos_pos");

    const cashierClose = await call("/api/app/commerce-daily-close", "cashier-token", "POST",
      { storeId: STORE, businessDate: DATE });
    assert.equal(cashierClose.status, 403);
    const close = await call("/api/app/commerce-daily-close", "manager-token", "POST",
      { storeId: STORE, businessDate: DATE });
    assert.equal(close.status, 201);
    const closeRetry = await call("/api/app/commerce-daily-close", "manager-token", "POST",
      { storeId: STORE, businessDate: DATE });
    assert.equal(closeRetry.status, 201);
    assert.equal(closeRetry.body.close.id, close.body.close.id);

    const brief = await call("/api/app/brief", "manager-token");
    assert.equal(brief.status, 200);
    assert.equal(brief.body.kind, "control-tower-daily-brief");
    assert.equal(brief.body.metrics.netSales.current, 0);
    assert.ok(upstreamCalls.every(x => !/secret|service_role/.test(x.path)));
  } finally {
    server.close();
    await once(server, "close");
  }
});
