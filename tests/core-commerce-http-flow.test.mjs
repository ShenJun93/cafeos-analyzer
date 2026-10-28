import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
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
      return json([{ id: STORE, tenant_id: TENANT, name: "Test Store", timezone: "Asia/Ho_Chi_Minh", active: true }]);
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
          clientOrderKey: body.p_client_order_key, channel: body.p_channel,
          orderNumber: "C-0001", status: "open",
          subtotal: Number((item.price * body.p_items[0].quantity).toFixed(2)),
          discountTotal: 0, taxTotal: 0,
          total: Number((item.price * body.p_items[0].quantity).toFixed(2))
        };
      }
      return json({ order, items: [{ id: "18000000-0000-4000-8000-000000000001",
        menuItemId: ITEM, name: item.name, unitPrice: item.price, quantity: 2,
        lineTotal: order.subtotal }] });
    }
    if (path === "/rest/v1/pos_orders") {
      assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT);
      if (url.searchParams.get("id")) {
        if (!order || url.searchParams.get("id") !== "eq." + ORDER
            || (url.searchParams.get("store_id") && url.searchParams.get("store_id") !== "eq." + STORE)) {
          return json([]);
        }
        const receiptRead = url.searchParams.get("select")?.includes("order_number");
        return json(receiptRead
          ? [{ id: order.id, tenant_id: TENANT, store_id: STORE, order_number: order.orderNumber,
            channel: "counter", business_date: DATE, status: order.status,
            subtotal: order.total, discount_total: 0, tax_total: 0,
             total: order.total, paid_at: order.status === "paid" ? DATE + "T08:30:00Z" : null }]
          : [{ id: order.id, tenant_id: TENANT, store_id: STORE, status: order.status, total: order.total }]);
      }
      assert.equal(url.searchParams.get("store_id"), "eq." + STORE);
      const filter = url.searchParams.get("status");
      assert.ok(["eq.open", "eq.paid"].includes(filter), "only read open or paid orders");
      const expectedStatus = filter.slice(3);
      return json(order?.status === expectedStatus && url.searchParams.get("offset") !== "20"
        ? [{
          id: ORDER, tenant_id: TENANT, store_id: STORE, order_number: "C-0001", channel: "counter",
          status: expectedStatus, total: order.total, created_at: DATE + "T07:00:00Z",
          paid_at: expectedStatus === "paid" ? DATE + "T08:30:00Z" : null,
          business_date: DATE
        }]
        : []);
    }
    if (path === "/rest/v1/pos_order_items") {
      assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT);
      assert.equal(url.searchParams.get("order_id"), "eq." + ORDER);
      return json([{ id: "line-1", tenant_id: TENANT, order_id: ORDER,
        item_name: "Latte", unit_price: "35000.00", quantity: "2.000",
        line_total: "70000.00" }]);
    }
    if (path === "/rest/v1/pos_payments") {
      assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT);
      assert.equal(url.searchParams.get("order_id"), "eq." + ORDER);
      return json(payment ? [{
        tenant_id: TENANT, order_id: ORDER, amount: payment.amount, method: payment.method,
        status: "captured", paid_at: DATE + "T08:30:00Z",
        reference: payment.reference ?? null
      }] : []);
    }
    if (path === "/rest/v1/rpc/commerce_capture_payment") {
      assert.equal(body.p_tenant_id, TENANT);
      if (order?.status !== "open") return json({ message: "COMMERCE_ORDER_NOT_OPEN" }, 409);
      if (body.p_amount !== order.total) return json({ message: "COMMERCE_PAYMENT_AMOUNT_MISMATCH" }, 400);
      payment = {
        id: "18000000-0000-4000-8000-000000000001",
        amount: body.p_amount, method: body.p_method, status: "captured",
        reference: body.p_reference ?? null
      };
      order.status = "paid";
      return json({ orderId: ORDER, status: "paid", paidAt: DATE + "T08:30:00Z", payment });
    }
    if (path === "/rest/v1/rpc/commerce_daily_dashboard") {
      const paid = Number(order?.status === "paid");
      return json({
        source: "cafeos_pos", tenantId: TENANT, storeId: STORE, businessDate: DATE,
        salesTotal: paid ? order.total : 0, orderCount: paid,
        openOrderCount: Number(order?.status === "open"),
        aov: paid ? order.total : null,
        paymentTotal: paid ? payment?.amount ?? 0 : 0,
        closed: Boolean(closed), paymentMix: payment ? { [payment.method]: payment.amount } : {}
      });
    }
    if (path === "/rest/v1/rpc/commerce_close_day") {
      assert.equal(body.p_tenant_id, TENANT);
      if (order?.status === "open") return json({ message: "COMMERCE_CLOSE_OPEN_ORDERS" }, 409);
      closed ??= {
        id: "19000000-0000-4000-8000-000000000001", tenantId: TENANT, storeId: STORE,
        businessDate: DATE, salesTotal: order?.total || 0,
        paymentTotal: payment?.amount || 0,
        cashTotal: payment?.method === "cash" ? payment.amount : 0,
        nonCashTotal: payment && payment.method !== "cash" ? payment.amount : 0,
        orderCount: Number(order?.status === "paid"),
        closedByUserId: MANAGER, closedAt: "2026-10-25T20:00:00Z", idempotent: false
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
    root: fileURLToPath(new URL("..", import.meta.url)),
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

    // Actual HTTP/router boundary must refuse bad quantity data before DB RPC.
    const rpcCallsBeforeInvalidQty = upstreamCalls.filter(x =>
      x.path === "/rest/v1/rpc/commerce_create_order").length;
    for (const quantity of [true, [1], "1e2", "0x2", "2.5555", 1.0001]) {
      const invalid = await call("/api/app/commerce-order", "cashier-token", "POST", {
        ...intent, items: [{ menuItemId: ITEM, quantity }]
      });
      assert.equal(invalid.status, 400, "must reject quantity " + String(quantity));
      assert.equal(invalid.body.error.code, "COMMERCE_ITEMS_INVALID");
    }
    assert.equal(upstreamCalls.filter(x =>
      x.path === "/rest/v1/rpc/commerce_create_order").length, rpcCallsBeforeInvalidQty);

    for (const clientOrderKey of [["kiosk-key-1"], { value: "kiosk-key-1" }, true]) {
      const badIntent = await call("/api/app/commerce-order", "cashier-token", "POST", {
        ...intent, clientOrderKey
      });
      assert.equal(badIntent.status, 400);
      assert.equal(badIntent.body.error.code, "COMMERCE_CLIENT_ORDER_KEY_INVALID");
    }

    const firstOrder = await call("/api/app/commerce-order", "cashier-token", "POST", intent);
    assert.equal(firstOrder.status, 201);
    assert.equal(firstOrder.body.order.total, 70000);
    const retry = await call("/api/app/commerce-order", "cashier-token", "POST", intent);
    assert.equal(retry.status, 201);
    assert.equal(retry.body.order.id, firstOrder.body.order.id);

    const open = await call("/api/app/commerce-open-orders?storeId=" + STORE);
    assert.equal(open.status, 200);
    assert.deepEqual(open.body.orders.map(x => x.id), [ORDER]);
    assert.equal(open.body.nextOffset, null);
    const paged = await call("/api/app/commerce-open-orders?storeId=" + STORE + "&offset=20");
    assert.equal(paged.status, 200);
    assert.equal(paged.body.nextOffset, null);
    const viewDenied = await call("/api/app/commerce-open-orders?storeId=" + STORE, "viewer-token");
    assert.equal(viewDenied.status, 403);

    const closeTooSoon = await call("/api/app/commerce-daily-close", "manager-token", "POST",
      { storeId: STORE, businessDate: DATE });
    assert.equal(closeTooSoon.status, 409);
    assert.equal(closeTooSoon.body.error.code, "COMMERCE_CLOSE_OPEN_ORDERS");

    for (const reference of [true, ["wire-ref"], { ref: "wire-ref" }]) {
      const malformed = await call("/api/app/commerce-payment", "cashier-token", "POST", {
        orderId: ORDER, method: "cash", amount: 70000, reference
      });
      assert.equal(malformed.status, 400);
      assert.equal(malformed.body.error.code, "COMMERCE_PAYMENT_REFERENCE_INVALID");
    }
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
    const receipt = await call("/api/app/commerce-receipt?orderId=" + ORDER + "&storeId=" + STORE);
    assert.equal(receipt.status, 200);
    assert.equal(receipt.body.receipt.orderId, ORDER);
    assert.equal(receipt.body.receipt.storeName, "Test Store");
    assert.equal(receipt.body.receipt.orderNumber, "C-0001");
    assert.equal(receipt.body.receipt.total, 70000);
    assert.equal(receipt.body.receipt.items[0].unitPrice, "35000.00");
    assert.equal(receipt.body.receipt.items[0].quantity, "2.000");
    assert.equal(receipt.body.receipt.payment.method, "cash");
    const viewerReceipt = await call("/api/app/commerce-receipt?orderId=" + ORDER + "&storeId=" + STORE, "viewer-token");
    assert.equal(viewerReceipt.status, 403);
    const anonymousReceipt = await fetch(base + "/api/app/commerce-receipt?orderId=" + ORDER + "&storeId=" + STORE);
    assert.equal(anonymousReceipt.status, 401);
    const wrongStoreReceipt = await call("/api/app/commerce-receipt?orderId=" + ORDER + "&storeId=" + OTHER);
    assert.equal(wrongStoreReceipt.status, 404);
    const second = await call("/api/app/commerce-payment", "cashier-token", "POST",
      { orderId: ORDER, method: "cash", amount: 70000 });
    assert.equal(second.status, 409);

    const after = await call("/api/app/commerce-open-orders?storeId=" + STORE);
    assert.equal(after.status, 200);
    assert.deepEqual(after.body.orders, []);
    const paidList = await call("/api/app/commerce-paid-orders?storeId=" + STORE);
    assert.equal(paidList.status, 200);
    assert.deepEqual(paidList.body.orders.map(x => x.id), [ORDER]);
    assert.equal(paidList.body.orders[0].status, "paid");
    assert.equal(paidList.body.nextOffset, null);
    const paidPaged = await call("/api/app/commerce-paid-orders?storeId=" + STORE + "&offset=20");
    assert.equal(paidPaged.status, 200);
    assert.deepEqual(paidPaged.body.orders, []);
    const viewerPaid = await call("/api/app/commerce-paid-orders?storeId=" + STORE, "viewer-token");
    assert.equal(viewerPaid.status, 403);
    const anonymousPaid = await fetch(base + "/api/app/commerce-paid-orders?storeId=" + STORE);
    assert.equal(anonymousPaid.status, 401);

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
