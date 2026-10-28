import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createVercelShapePreviewServer } from "../scripts/serve-vercel-preview.mjs";

test("CafeOS authenticated app shell exposes the approved ecosystem navigation", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(html, /<link rel="stylesheet" href="\/cafeos-ui\.css">/);
  assert.match(html, /class="[^"]*cafeos-app-shell/);

  for (const label of ["POS", "Menu", "Dashboard", "Daily Close", "Control Tower", "Analyzer"]) {
    assert.equal(html.includes(label), true, "missing app navigation " + label);
  }

  for (const id of [
    "authPanel",
    "email",
    "password",
    "signIn",
    "tenant",
    "store",
    "posWorkspace",
    "menuWorkspace",
    "dashboardWorkspace",
    "closeWorkspace",
    "controlWorkspace",
    "menuCatalog",
    "cart",
    "submitOrder",
    "capturePayment"
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'), "missing app element " + id);
  }
});

test("browser auth is publishable-only and memory-only", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(html, /\/api\/app\/client-config/);
  assert.match(html, /\/auth\/v1\/token\?grant_type=password/);
  assert.match(html, /let sessionToken = null/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(html, /SERVICE_ROLE|SUPABASE_SECRET|secret[_-]?key/i);
});

test("POS client sends intent only and does not expose editable trusted prices or totals", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");

  assert.match(
    html,
    /const orderBody = \{\s*storeId:[\s\S]*clientOrderKey:[\s\S]*channel:[\s\S]*items:[\s\S]*\};/
  );
  const orderBodySource = html.match(/const orderBody = \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.ok(orderBodySource, "orderBody source must be present");
  assert.doesNotMatch(orderBodySource, /(?:price|subtotal|total)\s*:/i);
  assert.doesNotMatch(html, /<input[^>]+(?:price|subtotal|total)/i);
  assert.match(html, /unit price is server-owned/i);
  assert.match(html, /server total/i);
});

test("payment v1 and source-boundary copy stay explicit", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  for (const method of ["cash", "card", "bank_transfer", "wallet", "other"]) {
    assert.match(html, new RegExp('value="' + method + '"'));
  }
  assert.match(html, /payment record.*not.*acquir/i);
  assert.match(html, /CafeOS POS first-party/i);
  assert.match(html, /Control Tower[\s\S]*imported\/integrated transaction facts/i);
});

test("app shell uses the fixed authenticated endpoints", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  for (const path of [
    "/api/app/session",
    "/api/app/stores",
    "/api/app/commerce-menu",
    "/api/app/commerce-order",
    "/api/app/commerce-payment",
    "/api/app/commerce-order-status",
    "/api/app/commerce-open-orders",
    "/api/app/commerce-dashboard",
    "/api/app/commerce-daily-close",
    "/api/app/brief"
  ]) {
    assert.equal(html.includes(path), true, "missing endpoint " + path);
  }
});

test("app route is wired into Vercel, local preview, and deploy artifact", async () => {
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(
    vercel.rewrites.some(x => x.source === "/app" && x.destination === "/app.html"),
    true
  );

  const preview = await readFile(new URL("../scripts/serve-vercel-preview.mjs", import.meta.url), "utf8");
  assert.match(preview, /\['\/app', \{ dir: 'public', file: 'app\.html' \}\]/);
  for (const path of [
    "/api/app/commerce-menu",
    "/api/app/commerce-order",
    "/api/app/commerce-payment",
    "/api/app/commerce-order-status",
    "/api/app/commerce-open-orders",
    "/api/app/commerce-dashboard",
    "/api/app/commerce-daily-close"
  ]) assert.equal(preview.includes(path), true, "local preview missing " + path);

  const deploy = await readFile(new URL("../scripts/verify-deploy.mjs", import.meta.url), "utf8");
  assert.match(deploy, /public\/app\.html/);
  assert.match(deploy, /server\/commerce\/order\.mjs/);
});

test("real local preview serves /app and shared CSS", async () => {
  const server = createVercelShapePreviewServer({
    root: fileURLToPath(new URL("..", import.meta.url))
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = server.address().port;
    const app = await fetch("http://127.0.0.1:" + port + "/app");
    assert.equal(app.status, 200);
    assert.match(app.headers.get("content-type") || "", /^text\/html/i);
    assert.match(await app.text(), /cafeos-app-shell/);

    const css = await fetch("http://127.0.0.1:" + port + "/cafeos-ui.css");
    assert.equal(css.status, 200);
    assert.match(await css.text(), /\.cafeos-app-shell/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("shared Hallmark CSS has a dedicated responsive commerce application layout", async () => {
  const css = await readFile(new URL("../public/cafeos-ui.css", import.meta.url), "utf8");
  for (const marker of [
    ".cafeos-app-shell",
    ".app-nav",
    ".pos-layout",
    ".menu-catalog",
    ".cart-panel",
    ".open-order-list",
    ".commerce-metrics",
    ".daily-close-panel"
  ]) assert.equal(css.includes(marker), true, "missing CSS marker " + marker);

  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.pos-layout/);
});


test("POS create-order retries reuse an intent key and lock the cart while request is uncertain", async () => {
  const html=await readFile(new URL("../public/app.html", import.meta.url),"utf8");
  assert.match(html,/let pendingOrderSubmission = null;/);
  assert.match(html,/let orderSubmitInFlight = false;/);
  assert.match(html,/clientOrderKey: pendingOrderSubmission\.clientOrderKey/);
  assert.match(html,/if \(!pendingOrderSubmission\)[\s\S]*?crypto\.randomUUID\(\)/);
  assert.match(html,/finally\s*\{[\s\S]*?orderSubmitInFlight = false;/);
  assert.match(html,/renderCart\(\);[\s\S]*?submitOrder/);
});


test("unfinished POS checkout prevents Store/Tenant refresh from losing the idempotency key", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script, "inline app controller must exist");

  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        value: "", textContent: "", dataset: {}, disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
      });
    }
    return elements.get(id);
  }
  const requests = [];
  const context = createContext({
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      createElement: () => element("created_" + elements.size)
    },
    window: { confirm: () => false },
    fetch: async (url) => {
      requests.push(String(url));
      return {
        ok: true, status: 200,
        json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" })
      };
    },
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixed-order-key" }
  });
  runInContext(script, context);
  await runInContext('Promise.resolve()', context);
  runInContext(`
    sessionToken = "test-token";
    currentTenantId = "tenant-A";
    currentStoreId = "store-A";
    pendingOrderSubmission = { clientOrderKey: "order-locked", storeId: "store-A", channel: "counter", items: [] };
    cartState.set("coffee", { item: { id: "coffee", name: "Coffee", price: 25000 }, quantity: 1 });
  `, context);
  element("tenant").value = "tenant-B";
  element("store").value = "store-B";
  const requestCount = requests.length;
  await runInContext("loadTenant()", context);
  assert.equal(element("tenant").value, "tenant-A", "tenant switch must roll back");
  assert.equal(element("store").value, "store-A", "store selection must roll back");
  assert.equal(runInContext("pendingOrderSubmission.clientOrderKey", context), "order-locked");
  assert.equal(runInContext("cartState.size", context), 1);
  assert.equal(requests.length, requestCount, "blocked tenant change must not fetch");
  await runInContext("refreshStore()", context);
  assert.equal(runInContext("pendingOrderSubmission.clientOrderKey", context), "order-locked");
  assert.equal(requests.length, requestCount, "refresh must not drop an ambiguous order");

  runInContext('pendingOrderSubmission = null; currentOrder = { id: "unpaid", status: "open" }', context);
  element("store").value = "store-B";
  await runInContext("refreshStore()", context);
  assert.equal(runInContext("currentOrder.id", context), "unpaid", "unpaid order must stay payable");
  assert.equal(element("store").value, "store-A");
  assert.equal(requests.length, requestCount);
});


test("Control Tower outage degrades reporting but does not block POS; Menu outage still blocks", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);

  const dom = new Map();
  function node(id) {
    if (!dom.has(id)) dom.set(id, {
      value: "", textContent: "", dataset: {}, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return dom.get(id);
  }
  const context = createContext({
    document: {
      getElementById: node,
      querySelectorAll: () => [],
      createElement: () => node("created_" + dom.size)
    },
    window: { confirm: () => false },
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" })
    }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "synthetic-key" }
  });
  runInContext(script, context);
  node("store").value = "store-1";
  runInContext(`
    sessionToken = "synthetic-token";
    currentTenantId = "tenant-1";
    currentStoreId = "store-1";
    let controlTowerCalls = 0;
    loadMenu = async () => {};
    loadDashboard = async () => {};
    loadControlTower = async () => { controlTowerCalls += 1; throw new Error("brief offline"); };
  `, context);

  await runInContext("refreshStore()", context);
  assert.match(node("status").textContent, /POS.*Commerce Dashboard.*Control Tower/i);
  assert.match(node("controlBrief").textContent, /brief offline/);
  assert.equal(runInContext("controlTowerCalls", context), 1);
  assert.equal(node("status").dataset.state, "warning");

  runInContext('loadMenu = async () => { throw new Error("menu offline"); }', context);
  await assert.rejects(runInContext("refreshStore()", context), /menu offline/);
});

test("lost payment response reconciles paid order and preserves an open order", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const nodes = new Map();
  function elem(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", dataset: {}, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return nodes.get(id);
  }
  const context = createContext({
    document: {
      getElementById: elem,
      querySelectorAll: () => [],
      createElement: () => elem("created_" + nodes.size)
    },
    window: { confirm: () => false },
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" })
    }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "synthetic-key" }
  });
  runInContext(script, context);
  elem("paymentMethod").value = "cash";
  runInContext(`
    sessionToken = "fake-jwt";
    currentTenantId = "tenant-1";
    currentTenantRole = "cashier";
    currentStoreId = "store-1";
    currentOrder = { id: "order-1", status: "open", total: 50000 };
    let statusResult = "paid";
    let statusChecks = 0;
    let receiptReads = 0;
    let payments = 0;
    let dashboardRefreshes = 0;
    loadDashboard = async () => { dashboardRefreshes += 1; };
    appFetch = async (path) => {
      if (path === "/api/app/commerce-payment") {
        payments += 1; throw new Error("network response lost");
      }
      if (path.startsWith("/api/app/commerce-order-status?orderId=")) {
        statusChecks += 1;
        return { order: { id: "order-1", storeId: "store-1", status: statusResult, total: "50000.00" } };
      }
      if (path.startsWith("/api/app/commerce-receipt?orderId=")) {
        receiptReads++;
        return { receipt: { orderId: "order-1", storeId: "store-1",
          status: "paid", total: "50000.00",
          payment: { method: "cash", amount: "50000.00", reference: null } } };
      }
      throw new Error("unexpected route " + path);
    };
  `, context);
  await runInContext("capturePayment()", context);
  assert.equal(runInContext("currentOrder", context), null);
  assert.equal(runInContext("statusChecks", context), 1);
  assert.equal(runInContext("receiptReads", context), 2,
    "one receipt read verifies settlement; the next loads the printable copy");
  assert.equal(runInContext("dashboardRefreshes", context), 1);
  // Startup config is fetched independently and can overwrite the ephemeral
  // status text; settlement outcome is proved by order clearance and both
  // server-side reads rather than the timing of a status banner.

  runInContext('currentOrder = { id: "order-1", status: "open", total: 50000 }; statusResult = "open";', context);
  await assert.rejects(runInContext("capturePayment()", context), /Chưa xác minh được payment/);
  assert.equal(runInContext("currentOrder.status", context), "open");
  assert.equal(runInContext("statusChecks", context), 2);
  assert.equal(runInContext("receiptReads", context), 2,
    "open order state must not trigger another paid receipt read");
  assert.equal(runInContext("dashboardRefreshes", context), 1);
});

test("ambiguous POS payment recovery requires exact settled cents before clearing the order", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const nodes = new Map();
  function element(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", dataset: {}, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return nodes.get(id);
  }
  const ctx = createContext({
    document: {
      getElementById: element, querySelectorAll: () => [],
      createElement: () => element("created_" + nodes.size)
    },
    window: { confirm: () => false },
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" })
    }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "payment-recovery-intent" }
  });
  runInContext(script, ctx);
  element("paymentMethod").value = "cash";
  runInContext(`
    sessionToken = "synthetic-token";
    currentTenantId = "tenant-1";
    currentTenantRole = "cashier";
    currentStoreId = "store-1";
    let paymentWrites = 0;
    let statusReads = 0;
    let receiptReads = 0;
    let dashboardRefreshes = 0;
    let serverOrder = { id: "order-1", storeId: "store-1",
      status: "paid", total: "35000.29" };
    let serverReceipt = {
      orderId: "order-1", storeId: "store-1", status: "paid", total: "35000.29",
      payment: { method: "cash", amount: "35000.29", reference: null }
    };
    let lastPaymentReference = "not sent";
    loadDashboard = async () => { dashboardRefreshes++; };
    appFetch = async (path, options) => {
      if (path === "/api/app/commerce-payment") {
        lastPaymentReference = options?.body?.reference;
        paymentWrites++; throw new Error("POST response lost");
      }
      if (path.startsWith("/api/app/commerce-order-status?orderId=")) {
        statusReads++; return { order: serverOrder };
      }
      if (path.startsWith("/api/app/commerce-receipt?orderId=")) {
        receiptReads++; return { receipt: serverReceipt };
      }
      throw new Error("unexpected request: " + path);
    };
  `, ctx);

  // Every one of these reads says "paid"; none proves that the paid amount
  // matches the exact amount the cashier sent, so keep the open order.
  for (const total of [
    "35000.28", "35000.30", "35000.290", "NaN", null, 0,
    true, [35000.29], -1, "1000000000000.01"
  ]) {
    runInContext("currentOrder = { id: 'order-1', status: 'open', total: 35000.29 };", ctx);
    ctx.serverMoney = total;
    runInContext("serverOrder = { id: 'order-1', storeId: 'store-1', status: 'paid', total: serverMoney };", ctx);
    const before = runInContext("paymentWrites", ctx);
    await assert.rejects(runInContext("capturePayment()", ctx), /Chưa xác minh được payment/);
    assert.equal(runInContext("paymentWrites", ctx), before + 1,
      "a failed reconciliation must not send another payment request");
    assert.equal(runInContext("currentOrder.status", ctx), "open");
    assert.equal(runInContext("currentOrder.total", ctx), 35000.29);
    assert.equal(runInContext("dashboardRefreshes", ctx), 0);
  }

  for (const total of ["35000.29", 35000.29]) {
    runInContext("currentOrder = { id: 'order-1', status: 'open', total: 35000.29 };", ctx);
    ctx.serverMoney = total;
    runInContext("serverOrder = { id: 'order-1', storeId: 'store-1', status: 'paid', total: serverMoney };", ctx);
    const before = runInContext("paymentWrites", ctx);
    await runInContext("capturePayment()", ctx);
    assert.equal(runInContext("currentOrder", ctx), null,
      "exact settled amount from tenant-scoped read may close the UI checkout");
    assert.equal(runInContext("paymentWrites", ctx), before + 1);
  }
  assert.equal(runInContext("statusReads", ctx), 12);
  assert.equal(runInContext("receiptReads", ctx), 4,
    "each confirmed recovery verifies captured evidence, then loads its printable receipt");
  assert.equal(runInContext("dashboardRefreshes", ctx), 2);

  // A same-total PAID order may have been captured with a different method
  // by a concurrent cashier. Never infer that this attempted method succeeded.
  const validReceipt = {
    orderId: "order-1", storeId: "store-1", status: "paid",
    total: "35000.29", payment: { method: "cash", amount: "35000.29", reference: null }
  };
  const invalidReceipts = [
    { ...validReceipt, orderId: "another-order" },
    { ...validReceipt, storeId: "another-store" },
    { ...validReceipt, status: "open" },
    { ...validReceipt, total: "35000.28" },
    { ...validReceipt, payment: { method: "card", amount: "35000.29" } },
    { ...validReceipt, payment: { method: "cash", amount: "35000.28" } },
    { ...validReceipt, payment: { method: "cash", amount: "35000.29", reference: "other" } },
    { ...validReceipt, payment: { method: "cash", amount: "35000.29" } },
    { ...validReceipt, payment: null },
    null
  ];
  for (const receipt of invalidReceipts) {
    runInContext("currentOrder = { id: 'order-1', status: 'open', total: 35000.29 };", ctx);
    ctx.syntheticReceipt = receipt;
    runInContext("serverReceipt = syntheticReceipt", ctx);
    const before = runInContext("paymentWrites", ctx);
    const statusBefore = runInContext("statusReads", ctx);
    const receiptsBefore = runInContext("receiptReads", ctx);
    await assert.rejects(runInContext("capturePayment()", ctx), /Chưa xác minh được payment/);
    assert.equal(runInContext("paymentWrites", ctx), before + 1);
    assert.equal(runInContext("statusReads", ctx), statusBefore + 1);
    assert.equal(runInContext("receiptReads", ctx), receiptsBefore + 1);
    assert.equal(runInContext("currentOrder.status", ctx), "open",
      "wrong method/amount on receipt must not clear checkout");
    assert.equal(runInContext("dashboardRefreshes", ctx), 2);
  }

  // A cashier-provided bank/terminal reference must be snapshotted once
  // and matched with the actual captured reference, not just method/amount.
  element("paymentReference").value = "  txn-42  ";
  runInContext("currentOrder = { id: 'order-1', status: 'open', total: 35000.29 };", ctx);
  ctx.syntheticReceipt = {
    ...validReceipt,
    payment: { method: "cash", amount: "35000.29", reference: "txn-42" }
  };
  runInContext("serverReceipt = syntheticReceipt", ctx);
  await runInContext("capturePayment()", ctx);
  assert.equal(runInContext("currentOrder", ctx), null);
  assert.equal(runInContext("lastPaymentReference", ctx), "txn-42");
  assert.equal(runInContext("dashboardRefreshes", ctx), 3);

  // A different captured reference (same order/method/amount) cannot prove
  // the selected payment reference was captured: preserve the checkout.
  runInContext("currentOrder = { id: 'order-1', status: 'open', total: 35000.29 };", ctx);
  element("paymentReference").value = "txn-43";
  const beforeWrongRef = runInContext("paymentWrites", ctx);
  await assert.rejects(runInContext("capturePayment()", ctx), /Chưa xác minh được payment/);
  assert.equal(runInContext("lastPaymentReference", ctx), "txn-43");
  assert.equal(runInContext("paymentWrites", ctx), beforeWrongRef + 1);
  assert.equal(runInContext("currentOrder.status", ctx), "open");
  assert.equal(runInContext("dashboardRefreshes", ctx), 3);
  element("paymentReference").value = "";

  // A failed receipt read likewise leaves the order unsettled rather than
  // silently falling back to PAID order header alone.
  runInContext("currentOrder = { id: 'order-1', status: 'open', total: 35000.29 };", ctx);
  runInContext(`appFetch = async (path) => {
    if (path === "/api/app/commerce-payment") {
      paymentWrites++; throw new Error("POST response lost");
    }
    if (path.startsWith("/api/app/commerce-order-status?orderId=")) {
      statusReads++; return { order: serverOrder };
    }
    if (path.startsWith("/api/app/commerce-receipt?orderId=")) {
      receiptReads++; throw new Error("receipt read unavailable");
    }
    throw new Error("unexpected request: " + path);
  };`, ctx);
  await assert.rejects(runInContext("capturePayment()", ctx), /Chưa xác minh được payment/);
  assert.equal(runInContext("currentOrder.status", ctx), "open");

  // The same method, exact amount and receipt identity are required before
  // clearing the checkout. No additional payment POST may be sent by recovery.

  // A malformed trusted order total should fail before any payment RPC.
  runInContext("currentOrder = { id: 'order-1', status: 'open', total: '35000.291' };", ctx);
  const writesBefore = runInContext("paymentWrites", ctx);
  await assert.rejects(runInContext("capturePayment()", ctx), /Server total không hợp lệ/);
  assert.equal(runInContext("paymentWrites", ctx), writesBefore);
  assert.equal(runInContext("currentOrder.status", ctx), "open");
});

test("local workflow router keeps orderId/storeId query params and denies anonymous reads", async () => {
  const server = createVercelShapePreviewServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = server.address().port;
    const order = await fetch("http://127.0.0.1:" + port +
      "/api/app/commerce-order-status?orderId=16000000-0000-4000-8000-000000000001");
    assert.equal(order.status, 401);
    assert.equal((await order.json()).error.code, "AUTH_REQUIRED");

    const dashboard = await fetch("http://127.0.0.1:" + port +
      "/api/app/commerce-dashboard?storeId=11000000-0000-4000-8000-000000000001&businessDate=2026-10-25");
    assert.equal(dashboard.status, 401);
    assert.equal((await dashboard.json()).error.code, "AUTH_REQUIRED");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("cashier POS affordances remain available while manager-only Menu and Daily Close are hidden", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const nodes = new Map();
  function element(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {
        value: "", textContent: "", dataset: {}, disabled: false,
        classList: {
          add(name) { classes.add(name); },
          remove(name) { classes.delete(name); },
          toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
          contains(name) { return classes.has(name); }
        },
        addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
      });
    }
    return nodes.get(id);
  }
  const context = createContext({
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      createElement: () => element("created_" + nodes.size)
    },
    window: { confirm: () => false },
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" })
    }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "synthetic-key" }
  });
  runInContext(script, context);
  runInContext(`
    sessionToken = "synthetic-user";
    tenantMemberships = [
      { tenantId: "tenant-cashier", role: "cashier" },
      { tenantId: "tenant-manager", role: "manager" }
    ];
    appFetch = async (path) => {
      if (path === "/api/app/stores") return { stores: [{ id: "store-1", name: "Store" }] };
      throw new Error("Unexpected call: " + path);
    };
    refreshStore = async () => {};
  `, context);
  element("tenant").value = "tenant-cashier";
  await runInContext("loadTenant()", context);
  assert.equal(runInContext("currentTenantRole", context), "cashier");
  assert.equal(runInContext("canWriteCommerce()", context), true);
  assert.equal(runInContext("canManageCommerce()", context), false);
  assert.equal(element("menuWriteControls").classList.contains("hidden"), true);
  assert.equal(element("menuReadOnlyNotice").classList.contains("hidden"), false);
  assert.equal(element("closeManagerNotice").classList.contains("hidden"), false);
  runInContext(`
    currentDashboard = {
      businessDate: "2026-10-25", orderCount: 0, salesTotal: 0,
      openOrderCount: 0, closed: false
    };
    renderClosePreview();
  `, context);
  assert.equal(element("closeDay").disabled, true);
  await assert.rejects(runInContext("closeBusinessDay()", context), /Manager role required/);
  await assert.rejects(runInContext("createItem({ preventDefault() {} })", context), /Manager role required/);

  element("tenant").value = "tenant-manager";
  await runInContext("loadTenant()", context);
  assert.equal(runInContext("currentTenantRole", context), "manager");
  assert.equal(element("menuWriteControls").classList.contains("hidden"), false);
  assert.equal(element("menuReadOnlyNotice").classList.contains("hidden"), true);
  assert.equal(element("closeManagerNotice").classList.contains("hidden"), true);
  runInContext(`currentDashboard = {
    businessDate: "2026-10-25", orderCount: 0, salesTotal: 0,
    openOrderCount: 0, closed: false
  }; renderClosePreview();`, context);
  assert.equal(element("closeDay").disabled, false);
});

test("POS recovers a server-owned open order without trusted price edit or browser persistence", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", disabled: false, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return nodes.get(id);
  }
  const context = createContext({
    document: { getElementById: node, querySelectorAll: () => [],
      createElement: () => node("created_" + nodes.size) },
    window: { confirm: () => false },
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" })
    }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "synthetic-key" }
  });
  runInContext(script, context);
  runInContext(`
    sessionToken = "jwt-test";
    currentTenantId = "tenant-A";
    currentTenantRole = "cashier";
    currentStoreId = "store-A";
    let requested = [];
    appFetch = async path => {
      requested.push(path);
      return {
        order: { id: "order-A", storeId: "store-A", status: "open", total: 42000 }
      };
    };
  `, context);
  await runInContext('resumeOpenOrder("order-A")', context);
  assert.equal(runInContext("currentOrder.id", context), "order-A");
  assert.equal(runInContext("currentOrder.total", context), 42000);
  assert.equal(node("submitOrder").disabled, true);
  assert.equal(node("recoverOpenOrders").disabled, true);
  assert.match(node("status").textContent, /khôi phục đơn mở/i);
  assert.equal(runInContext("requested.length", context), 1);

  runInContext("currentOrder = null; cartState.clear();", context);
  runInContext(`
    appFetch = async () => ({ order: {
      id: "order-A", storeId: "store-B", status: "open", total: 42000
    } });
  `, context);
  await assert.rejects(runInContext('resumeOpenOrder("order-A")', context), /không thuộc Store/);
  assert.equal(runInContext("currentOrder", context), null);
});

test("Daily Close requires an explicit summary confirmation and blocks duplicate submissions and context changes", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const dom = new Map();
  function node(id) {
    if (!dom.has(id)) dom.set(id, {
      value: "", textContent: "", dataset: {}, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return dom.get(id);
  }
  let confirmed = false;
  let question = "";
  const context = createContext({
    document: {
      getElementById: node,
      querySelectorAll: () => [],
      createElement: () => node("new_" + dom.size)
    },
    window: { confirm: value => { question = value; return confirmed; } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "key" }
  });
  runInContext(script, context);
  runInContext(`
    sessionToken = "synthetic-token";
    currentTenantId = "tenant-A";
    currentStoreId = "store-A";
    currentTenantRole = "manager";
    currentDashboard = {
      businessDate: "2026-10-25", orderCount: 2, openOrderCount: 0,
      salesTotal: 70000, closed: false
    };
    let closeCalls = 0;
    let resolveClose;
    appFetch = async (path, options) => {
      if (path !== "/api/app/commerce-daily-close") throw new Error("unexpected path");
      closeCalls += 1;
      if (options.body.storeId !== "store-A") throw new Error("wrong Store");
      return new Promise(resolve => { resolveClose = resolve; });
    };
    loadDashboard = async () => {
      currentDashboard.closed = true;
      renderClosePreview();
    };
    renderClosePreview();
  `, context);
  await runInContext("closeBusinessDay()", context);
  assert.equal(runInContext("closeCalls", context), 0, "cancelled confirmation must not write");
  assert.match(question, /2026-10-25/);
  assert.match(question, /70/);
  assert.match(question, /không thể tạo đơn mới/);

  confirmed = true;
  const pending = runInContext("closeBusinessDay()", context);
  assert.equal(runInContext("closeSubmitInFlight", context), true);
  assert.equal(node("closeDay").disabled, true);
  assert.equal(runInContext("closeCalls", context), 1);
  node("tenant").value = "tenant-B";
  node("store").value = "store-B";
  await runInContext("loadTenant()", context);
  assert.equal(node("tenant").value, "tenant-A");
  assert.equal(node("store").value, "store-A");
  await runInContext("closeBusinessDay()", context);
  assert.equal(runInContext("closeCalls", context), 1, "no duplicate close request");
  runInContext(`resolveClose({
    close: { businessDate: "2026-10-25", orderCount: 2, salesTotal: 70000, paymentTotal: 70000 }
  })`, context);
  await pending;
  assert.equal(runInContext("closeSubmitInFlight", context), false);
  assert.equal(node("closeDay").disabled, true, "successfully closed day cannot close again");
  assert.match(node("closeReceipt").textContent, /Close 2026-10-25/);
});


test("paid POS outcome survives Dashboard outage without a second payment or stale close controls", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const inline = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(inline);
  const elements = new Map();
  function elem(id) {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", dataset: {}, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return elements.get(id);
  }
  const ctx = createContext({
    document: {
      getElementById: elem, querySelectorAll: () => [],
      createElement: () => elem("new_" + elements.size)
    },
    window: { confirm: () => true },
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" })
    }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixed-intent" }
  });
  runInContext(inline, ctx);
  elem("paymentMethod").value = "cash";
  runInContext(`
    sessionToken = "synthetic-user";
    currentTenantId = "tenant-1";
    currentTenantRole = "cashier";
    currentStoreId = "store-1";
    currentOrder = { id: "order-1", status: "open", total: 50000 };
    currentDashboard = { closed: false, openOrderCount: 0 };
    let paymentWrites = 0;
    let dashboardCalls = 0;
    loadDashboard = async () => { dashboardCalls += 1; throw new Error("read model offline"); };
    appFetch = async (path) => {
      if (path === "/api/app/commerce-payment") {
        paymentWrites += 1;
        return { orderId: "order-1", status: "paid" };
      }
      throw new Error("unexpected route: " + path);
    };
  `, ctx);
  await runInContext("capturePayment()", ctx);
  assert.equal(runInContext("paymentWrites", ctx), 1);
  assert.equal(runInContext("dashboardCalls", ctx), 1);
  assert.equal(runInContext("currentOrder", ctx), null, "paid checkout must be cleared");
  assert.equal(runInContext("currentDashboard", ctx), null, "stale read model invalidated");
  assert.equal(elem("closeDay").disabled, true, "cannot close against stale metrics");
  assert.equal(elem("capturePayment").disabled, true, "no duplicate capture affordance");
  assert.equal(elem("status").dataset.state, "warning");
  assert.match(elem("status").textContent, /paid.*Dashboard chưa cập nhật/i);
  await runInContext("capturePayment()", ctx);
  assert.equal(runInContext("paymentWrites", ctx), 1, "must not send a second payment");

  runInContext(`
    currentDashboard = { closed: false, openOrderCount: 0 };
    currentOrder = null;
    cartState.set("item-1", { item: { id: "item-1", name: "Coffee", price: 50000 }, quantity: 1 });
    appFetch = async (path) => {
      if (path === "/api/app/commerce-order") {
        return { order: { id: "order-1", orderNumber: "C-1", status: "paid", total: 50000 }, items: [] };
      }
      throw new Error("unexpected route: " + path);
    };
  `, ctx);
  await runInContext("submitOrder()", ctx);
  assert.equal(runInContext("currentOrder", ctx), null);
  assert.equal(runInContext("pendingOrderSubmission", ctx), null);
  assert.equal(runInContext("cartState.size", ctx), 0);
  assert.equal(runInContext("currentDashboard", ctx), null);
  assert.equal(elem("closeDay").disabled, true);
  assert.match(elem("status").textContent, /thanh toán từ lần trước.*Dashboard chưa cập nhật/);
});

test("cart enforces SQL per-item quantity and 100 distinct order-line limit before checkout", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const inline = html.split("<script>")[1]?.split("</script>")[0];
  const elements = new Map();
  function elem(id) {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", dataset: {}, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return elements.get(id);
  }
  const ctx = createContext({
    document: { getElementById: elem, querySelectorAll: () => [], createElement: () => elem("created_" + elements.size) },
    window: { confirm: () => false },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" }) }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixed" }
  });
  runInContext(inline, ctx);
  runInContext(`
    currentTenantRole = "cashier";
    currentStoreId = "store-1";
    menuState.items = [{ id: "item-1", name: "Coffee", price: 35000 }];
    cartState.set("item-1", { item: menuState.items[0], quantity: 1000 });
  `, ctx);
  await runInContext('addToCart("item-1")', ctx);
  await runInContext('changeQuantity("item-1", 1)', ctx);
  assert.equal(runInContext('cartState.get("item-1").quantity', ctx), 1000);
  await runInContext('changeQuantity("item-1", -1)', ctx);
  assert.equal(runInContext('cartState.get("item-1").quantity', ctx), 999);
  await runInContext('addToCart("item-1")', ctx);
  assert.equal(runInContext('cartState.get("item-1").quantity', ctx), 1000);

  // The SQL RPC accepts 100 lines, not 100 total units. A cashier must not
  // build an impossible 101-line order; existing lines remain adjustable.
  runInContext(`
    cartState.clear();
    menuState.items = Array.from({ length: 101 }, (_, i) => ({
      id: "line-" + i, name: "Drink " + i, price: 1000
    }));
    for (const item of menuState.items.slice(0, 100)) {
      cartState.set(item.id, { item, quantity: 1 });
    }
  `, ctx);
  assert.equal(runInContext("cartState.size", ctx), 100);
  runInContext('addToCart("line-100")', ctx);
  assert.equal(runInContext("cartState.size", ctx), 100);
  assert.equal(runInContext('cartState.has("line-100")', ctx), false);
  assert.match(elem("status").textContent, /100 món khác nhau/);
  runInContext('addToCart("line-0")', ctx);
  assert.equal(runInContext('cartState.get("line-0").quantity', ctx), 2);
  runInContext('changeQuantity("line-1", -1)', ctx);
  assert.equal(runInContext("cartState.size", ctx), 99);
  runInContext('addToCart("line-100")', ctx);
  assert.equal(runInContext("cartState.size", ctx), 100);
  assert.equal(runInContext('cartState.get("line-100").quantity', ctx), 1);
  assert.equal(runInContext("pendingOrderSubmission", ctx), null);

  // Even a programmatically restored malformed cart must not create a key or
  // send an unsatisfiable order to the server.
  runInContext(`
    cartState.set("line-101", { item: { id: "line-101", name: "Extra", price: 1000 }, quantity: 1 });
  `, ctx);
  assert.equal(runInContext("cartState.size", ctx), 101);
  await assert.rejects(runInContext("submitOrder()", ctx), /100 dòng món/);
  assert.equal(runInContext("pendingOrderSubmission", ctx), null);
});


test("cashier can search POS menu by name/SKU and filter category without mutating priced items", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(html, /id="posMenuSearch"/);
  assert.match(html, /id="posMenuCategory"/);
  assert.match(html, /posMenuSearch"\).addEventListener\("input", renderMenu\)/);
  const source = html.split("<script>")[1]?.split("</script>")[0];
  const nodes = new Map();
  const createNode = () => ({
    value: "", textContent: "", dataset: {}, disabled: false, children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    replaceChildren(...items) { this.children = [...items]; },
    append(...items) { this.children.push(...items); }
  });
  const elem = id => {
    if (!nodes.has(id)) nodes.set(id, createNode());
    return nodes.get(id);
  };
  const context = createContext({
    document: {
      getElementById: elem, querySelectorAll: () => [],
      createElement: () => createNode()
    },
    window: { confirm: () => false },
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" })
    }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixed" }
  });
  runInContext(source, context);
  runInContext(`
    currentTenantRole = "cashier";
    menuState.categories = [{ id: "coffee", name: "Cà phê" }, { id: "tea", name: "Trà" }];
    menuState.items = [
      { id: "a", name: "Cà phê sữa đá", sku: "CF-01", category_id: "coffee", price: 29000 },
      { id: "b", name: "Latte", sku: "LAT-02", category_id: "coffee", price: 49000 },
      { id: "c", name: "Trà đào", sku: "TEA-10", category_id: "tea", price: 39000 }
    ];
  `, context);
  runInContext("renderMenu()", context);
  assert.equal(elem("menuCatalog").children.length, 3);

  elem("posMenuSearch").value = "lat-02";
  runInContext("renderMenu()", context);
  assert.equal(elem("menuCatalog").children.length, 1);
  assert.equal(elem("menuCatalog").children[0].children[0].textContent, "Latte");

  elem("posMenuSearch").value = "";
  elem("posMenuCategory").value = "tea";
  runInContext("renderMenu()", context);
  assert.equal(elem("menuCatalog").children.length, 1);
  assert.equal(elem("menuCatalog").children[0].children[0].textContent, "Trà đào");
  assert.equal(elem("posMenuCategory").value, "tea");

  elem("posMenuSearch").value = "KHÔNG TỒN TẠI";
  runInContext("renderMenu()", context);
  assert.match(elem("menuCatalog").children[0].textContent, /Không tìm thấy/);
  assert.equal(runInContext("menuState.items[0].price", context), 29000);

  // A category removed by a fresh menu load cannot leave a stale active filter.
  runInContext('menuState.categories = [{ id: "coffee", name: "Cà phê" }]', context);
  elem("posMenuSearch").value = "";
  runInContext("renderMenu()", context);
  assert.equal(elem("posMenuCategory").value, "");
  assert.equal(elem("menuCatalog").children.length, 3);
});


test("stale dashboard response cannot replace a newer Store or same-Store read", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const code = html.split("<script>")[1].split("</script>")[0];
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", disabled: false, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {},
      append(...v) { this.children.push(...v); },
      replaceChildren(...v) { this.children = [...v]; }
    });
    return nodes.get(id);
  };
  const pending = [];
  const ctx = createContext({
    document: {
      getElementById: node, querySelectorAll: () => [],
      createElement: () => ({ textContent: "", append() {} })
    },
    window: { confirm: () => false },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    deferred: path => new Promise(resolve => pending.push({ path, resolve })),
    URLSearchParams, Intl, crypto: { randomUUID: () => "test-id" }
  });
  runInContext(code, ctx);
  runInContext(`
    sessionToken = "test"; currentTenantId = "tenant";
    currentTenantRole = "manager"; currentStoreId = "store-A";
    currentDashboard = { salesTotal: 999, openOrderCount: 0 };
    appFetch = deferred;
    loadMenu = async () => {};
    loadOptionalControlTower = async () => true;
  `, ctx);
  const old = runInContext("loadDashboard()", ctx);
  node("store").value = "store-B";
  const updated = runInContext("refreshStore()", ctx);
  assert.equal(runInContext("currentDashboard", ctx), null);
  assert.equal(node("closeDay").disabled, true);
  assert.equal(pending.length, 2);
  const result = amount => ({ dashboard: {
    businessDate: "2026-10-27", orderCount: 1,
    salesTotal: amount, aov: amount, openOrderCount: 0, closed: false, paymentMix: {}
  } });
  pending[1].resolve(result(222));
  await updated;
  assert.equal(runInContext("currentDashboard.salesTotal", ctx), 222);
  pending[0].resolve(result(999));
  await old;
  assert.equal(runInContext("currentDashboard.salesTotal", ctx), 222);
  const slow = runInContext("loadDashboard()", ctx);
  const fast = runInContext("loadDashboard()", ctx);
  pending[3].resolve(result(333)); await fast;
  pending[2].resolve(result(111)); await slow;
  assert.equal(runInContext("currentDashboard.salesTotal", ctx), 333);
});

test("stale Tenant Store-list response cannot replace a newer Tenant selection", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const inline = html.split("<script>")[1].split("</script>")[0];
  const nodes = new Map();
  function el(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", disabled: false, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {},
      append(...v) { this.children.push(...v); },
      replaceChildren(...v) { this.children = [...v]; }
    });
    return nodes.get(id);
  }
  const pending = [];
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [],
      createElement: () => ({ value: "", textContent: "" }) },
    window: { confirm: () => false },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    deferred: path => new Promise(resolve => pending.push({ path, resolve })),
    URLSearchParams, Intl, crypto: { randomUUID: () => "test-id" }
  });
  runInContext(inline, ctx);
  runInContext(`
    sessionToken = "test";
    tenantMemberships = [{ tenantId: "A", role: "cashier" }, { tenantId: "B", role: "manager" }];
    let refreshCount = 0;
    appFetch = deferred;
    refreshStore = async () => { refreshCount++; };
  `, ctx);
  el("tenant").value = "A";
  const old = runInContext("loadTenant()", ctx);
  el("tenant").value = "B";
  const latest = runInContext("loadTenant()", ctx);
  assert.equal(pending.length, 2);
  pending[1].resolve({ stores: [{ id: "store-B", active: true }] });
  await latest;
  assert.equal(runInContext("currentTenantId", ctx), "B");
  assert.equal(runInContext("currentTenantRole", ctx), "manager");
  assert.equal(runInContext("refreshCount", ctx), 1);
  assert.equal(el("store").children[0].value, "store-B");
  pending[0].resolve({ stores: [{ id: "store-A", active: true }] });
  await old;
  assert.equal(runInContext("currentTenantId", ctx), "B");
  assert.equal(el("store").children[0].value, "store-B");
  assert.equal(runInContext("refreshCount", ctx), 1);
});


test("Daily Close retains server-confirmed receipt when Dashboard refresh fails or stays stale", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const dom = new Map();
  function el(id) {
    if (!dom.has(id)) dom.set(id, {
      value: "", textContent: "", disabled: false, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return dom.get(id);
  }
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [],
      createElement: () => el("new-" + dom.size) },
    window: { confirm: () => true },
    fetch: async () => ({ ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" }) }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "synthetic" }
  });
  runInContext(script, ctx);
  runInContext(`
    sessionToken = "synthetic";
    currentTenantId = "tenant-A";
    currentTenantRole = "manager";
    currentStoreId = "store-A";
    currentDashboard = { businessDate: "2026-10-27", orderCount: 2,
      salesTotal: 70000, openOrderCount: 0, closed: false };
    let closeWrites = 0;
    let dashboardReads = 0;
    appFetch = async (path, options) => {
      if (path !== "/api/app/commerce-daily-close") throw new Error("unexpected API call");
      closeWrites++;
      if (options.body.storeId !== "store-A") throw new Error("wrong store");
      return { close: { businessDate: "2026-10-27", orderCount: 2,
        salesTotal: 70000, paymentTotal: 70000 } };
    };
    loadDashboard = async () => {
      dashboardReads++;
      throw new Error("Dashboard offline");
    };
  `, ctx);
  await runInContext("closeBusinessDay()", ctx);
  assert.equal(runInContext("closeWrites", ctx), 1);
  assert.equal(runInContext("dashboardReads", ctx), 1);
  assert.equal(runInContext("currentDashboard", ctx), null);
  assert.equal(el("closeDay").disabled, true);
  assert.match(el("closeReceipt").textContent, /Close 2026-10-27/);
  assert.match(el("status").textContent, /Daily Close đã được ghi nhận/);
  assert.equal(el("status").dataset.state, "warning");
  await runInContext("closeBusinessDay()", ctx);
  assert.equal(runInContext("closeWrites", ctx), 1, "committed close cannot be resubmitted while reports are unavailable");

  // A lagging Dashboard may still say the SAME day is open. Fail closed.
  runInContext(`
    currentDashboard = { businessDate: "2026-10-27", orderCount: 2,
      salesTotal: 70000, openOrderCount: 0, closed: false };
    loadDashboard = async () => { dashboardReads++; };
  `, ctx);
  await runInContext("closeBusinessDay()", ctx);
  assert.equal(runInContext("currentDashboard", ctx), null);
  assert.equal(el("closeDay").disabled, true);
  assert.equal(runInContext("closeWrites", ctx), 2, "test makes one deliberate new mock close");
  assert.match(el("status").textContent, /Dashboard chưa cập nhật/);
});

test("ambiguous Daily Close response prevents duplicate write until fresh dashboard and receipt resets on Store change", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  const dom = new Map();
  function el(id) {
    if (!dom.has(id)) dom.set(id, {
      value: "", textContent: "", disabled: false, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}, reset() {}
    });
    return dom.get(id);
  }
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [],
      createElement: () => el("new-" + dom.size) },
    window: { confirm: () => true },
    fetch: async () => ({ ok: true, status: 200,
      json: async () => ({ supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" }) }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "synthetic" }
  });
  runInContext(script, ctx);
  runInContext(`
    sessionToken = "synthetic";
    currentTenantId = "tenant-A";
    currentTenantRole = "manager";
    currentStoreId = "store-A";
    currentDashboard = { businessDate: "2026-10-27", orderCount: 1,
      salesTotal: 30000, openOrderCount: 0, closed: false };
    let closeWrites = 0;
    appFetch = async path => {
      if (path !== "/api/app/commerce-daily-close") throw new Error("unexpected API call");
      closeWrites++;
      throw new Error("network response lost");
    };
  `, ctx);
  await assert.rejects(runInContext("closeBusinessDay()", ctx), /Chưa xác nhận được Daily Close/);
  assert.equal(runInContext("currentDashboard", ctx), null);
  assert.equal(el("closeDay").disabled, true);
  await runInContext("closeBusinessDay()", ctx);
  assert.equal(runInContext("closeWrites", ctx), 1, "no automatic duplicate close on unknown outcome");

  runInContext(`
    appFetch = async () => { throw new Error("not expected"); };
    loadMenu = async () => {};
    loadDashboard = async () => {};
    loadOptionalControlTower = async () => true;
  `, ctx);
  el("closeReceipt").textContent = "Close store-A";
  el("store").value = "store-B";
  await runInContext("refreshStore()", ctx);
  assert.equal(el("closeReceipt").textContent, "", "Store change must clear old close receipt");
  assert.equal(el("closeDay").disabled, true, "new Store still awaits verified dashboard");
});

test("old recovery list cannot repaint another Store or unlock a newer pending fetch", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const code = html.split("<script>")[1].split("</script>")[0];
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", disabled: false, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {},
      replaceChildren(...xs) { this.children = xs; },
      append(...xs) { this.children.push(...xs); }
    });
    return nodes.get(id);
  };
  const pending = [];
  const ctx = createContext({
    document: {
      getElementById: element, querySelectorAll: () => [],
      createElement: () => ({ textContent: "", type: "", className: "", addEventListener() {} })
    },
    window: { confirm: () => false },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    deferred: path => new Promise(resolve => pending.push({ path, resolve })),
    URLSearchParams, Intl, crypto: { randomUUID: () => "test-id" }
  });
  runInContext(code, ctx);
  runInContext(`
    sessionToken = "jwt"; currentTenantId = "tenant-A";
    currentTenantRole = "cashier"; currentStoreId = "store-A";
    appFetch = deferred;
    loadMenu = async () => {};
    loadDashboard = async () => {};
    loadOptionalControlTower = async () => true;
  `, ctx);
  const old = runInContext("loadOpenOrdersForRecovery()", ctx);
  assert.equal(pending.length, 1);
  assert.match(pending[0].path, /store-A/);
  element("store").value = "store-B";
  await runInContext("refreshStore()", ctx);
  assert.equal(runInContext("openOrdersLoadInFlight", ctx), false);
  const fresh = runInContext("loadOpenOrdersForRecovery()", ctx);
  assert.equal(pending.length, 2);
  assert.match(pending[1].path, /store-B/);
  pending[0].resolve({ orders: [{ id: "old", orderNumber: "OLD", total: 1 }], nextOffset: null });
  await old;
  assert.equal(element("openOrderList").children.length, 0, "old Store order must be discarded");
  assert.equal(runInContext("openOrdersLoadInFlight", ctx), true, "old finally must not unlock fresh read");
  pending[1].resolve({ orders: [{ id: "new", orderNumber: "NEW", total: 2 }], nextOffset: null });
  await fresh;
  assert.equal(element("openOrderList").children.length, 1);
  assert.match(element("openOrderList").children[0].textContent, /NEW/);
  assert.equal(runInContext("openOrdersLoadInFlight", ctx), false);
});

test("recovery selection discards stale response and protects newer unsent cart", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const code = html.split("<script>")[1].split("</script>")[0];
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", disabled: false, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {},
      replaceChildren(...xs) { this.children = xs; },
      append(...xs) { this.children.push(...xs); }
    });
    return nodes.get(id);
  };
  const pending = [];
  const ctx = createContext({
    document: {
      getElementById: element, querySelectorAll: () => [],
      createElement: () => ({ textContent: "", type: "", addEventListener() {}, append() {} })
    },
    window: { confirm: () => true },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    deferred: path => new Promise(resolve => pending.push({ path, resolve })),
    URLSearchParams, Intl, crypto: { randomUUID: () => "test-id" }
  });
  runInContext(code, ctx);
  runInContext(`
    sessionToken = "jwt"; currentTenantId = "tenant-A";
    currentTenantRole = "cashier"; currentStoreId = "store-A";
    menuState.items = [{ id: "coffee", name: "Coffee", price: 29000 }];
    appFetch = deferred;
    loadMenu = async () => {};
    loadDashboard = async () => {};
    loadOptionalControlTower = async () => true;
  `, ctx);
  const recovery = runInContext('resumeOpenOrder("old-order")', ctx);
  runInContext('addToCart("coffee")', ctx);
  pending[0].resolve({ order: { id: "old-order", storeId: "store-A", status: "open", total: 30000 } });
  await assert.rejects(recovery, /Giỏ hàng đã thay đổi/);
  assert.equal(runInContext("currentOrder", ctx), null);
  assert.equal(runInContext("cartState.get('coffee').quantity", ctx), 1);

  runInContext("cartState.clear()", ctx);
  const obsolete = runInContext('resumeOpenOrder("old-order")', ctx);
  element("store").value = "store-B";
  await runInContext("refreshStore()", ctx);
  runInContext('cartState.set("coffee", { item: { id: "coffee", price: 29000, name: "Coffee" }, quantity: 2 })', ctx);
  pending[1].resolve({ order: { id: "old-order", storeId: "store-A", status: "open", total: 30000 } });
  await obsolete;
  assert.equal(runInContext("currentOrder", ctx), null);
  assert.equal(runInContext("cartState.get('coffee').quantity", ctx), 2, "old recovery must not erase new Store cart");
});

test("sign-in serial ignores superseded auth responses and never publishes a half-loaded shell", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const inline = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(inline);
  const dom = new Map();
  function el(id) {
    if (!dom.has(id)) dom.set(id, {
      value: "", textContent: "", disabled: false, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren(...xs) { this.children = xs; },
      append(...xs) { this.children.push(...xs); }
    });
    return dom.get(id);
  }
  const pendingAuth = [];
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [],
      createElement: () => ({ value: "", textContent: "" }) },
    window: { confirm: () => true },
    fetch: async () => ({ ok: true, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    pendingAuth: options => new Promise(resolve => pendingAuth.push({ options, resolve })),
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixture" }
  });
  runInContext(inline, ctx);
  runInContext(`
    clientConfig = { supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" };
    jsonFetch = (url, options) => pendingAuth(options);
    appFetch = async path => {
      if (path === "/api/app/session") return { memberships: [{ tenantId: "tenant-B", role: "manager" }] };
      throw new Error("unexpected path");
    };
    loadTenant = async () => { setStatus("Control Tower không tải được", "warning"); };
  `, ctx);

  el("email").value = "first@example.invalid";
  el("password").value = "fixture-password";
  const first = runInContext("signIn()", ctx);
  assert.equal(el("signIn").disabled, true);
  await runInContext("signIn()", ctx);
  assert.equal(pendingAuth.length, 1, "double login must not issue a second auth request");
  assert.equal(runInContext("sessionToken", ctx), null);

  runInContext("signOut()", ctx);
  assert.equal(el("signIn").disabled, false);
  el("email").value = "second@example.invalid";
  const second = runInContext("signIn()", ctx);
  assert.equal(pendingAuth.length, 2);

  pendingAuth[1].resolve({ access_token: "jwt-second" });
  await second;
  assert.equal(runInContext("sessionToken", ctx), "jwt-second");
  assert.equal(el("identity").textContent, "second@example.invalid");
  assert.equal(el("signIn").disabled, false);
  assert.equal(el("status").dataset.state, "warning", "auth cannot overwrite Store warning");
  assert.match(el("status").textContent, /Control Tower không tải được/);
  pendingAuth[0].resolve({ access_token: "jwt-first" });
  await first;
  assert.equal(runInContext("sessionToken", ctx), "jwt-second");
  assert.equal(el("identity").textContent, "second@example.invalid");
  assert.equal(el("signIn").disabled, false);
  assert.equal(runInContext("tenantMemberships[0].tenantId", ctx), "tenant-B");
});

test("sign-out invalidates delayed old membership response and failed login clears all session data", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const inline = html.split("<script>")[1]?.split("</script>")[0];
  const dom = new Map();
  function el(id) {
    if (!dom.has(id)) dom.set(id, {
      value: "", textContent: "", disabled: false, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren(...xs) { this.children = xs; },
      append(...xs) { this.children.push(...xs); }
    });
    return dom.get(id);
  }
  const waiting = [];
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [],
      createElement: () => ({ value: "", textContent: "" }) },
    window: { confirm: () => true },
    fetch: async () => ({ ok: true, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    deferSession: () => new Promise(resolve => waiting.push(resolve)),
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixture" }
  });
  runInContext(inline, ctx);
  runInContext(`
    clientConfig = { supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test" };
    jsonFetch = async () => ({ access_token: "jwt-A" });
    appFetch = deferSession;
    loadTenant = async () => {};
  `, ctx);
  el("email").value = "first@example.invalid";
  el("password").value = "fixture";
  const first = runInContext("signIn()", ctx);
  await Promise.resolve();
  assert.equal(waiting.length, 1, "membership fetch should be outstanding");
  assert.equal(runInContext("sessionToken", ctx), "jwt-A");
  assert.equal(el("identity").textContent, "", "must not publish identity before membership confirmation");
  runInContext("signOut()", ctx);
  assert.equal(runInContext("sessionToken", ctx), null);

  runInContext(`
    jsonFetch = async () => ({ access_token: "jwt-B" });
    appFetch = async () => ({ memberships: [{ tenantId: "tenant-B", role: "owner" }] });
  `, ctx);
  el("email").value = "second@example.invalid";
  const second = runInContext("signIn()", ctx);
  await second;
  assert.equal(runInContext("sessionToken", ctx), "jwt-B");
  waiting[0]({ memberships: [{ tenantId: "tenant-A", role: "owner" }] });
  await first;
  assert.equal(runInContext("tenantMemberships[0].tenantId", ctx), "tenant-B");
  assert.equal(el("identity").textContent, "second@example.invalid");

  runInContext("signOut()", ctx);
  runInContext(`
    jsonFetch = async () => ({ access_token: "jwt-no-membership" });
    appFetch = async () => ({ memberships: [] });
  `, ctx);
  el("email").value = "no-membership@example.invalid";
  await assert.rejects(runInContext("signIn()", ctx), /membership/);
  assert.equal(runInContext("sessionToken", ctx), null);
  assert.equal(runInContext("tenantMemberships.length", ctx), 0);
  assert.equal(el("identity").textContent, "Chưa đăng nhập");
  assert.equal(el("signIn").disabled, false);
});

async function menuMutationHarness() {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const dom = new Map();
  function newNode() {
    return {
      value: "", textContent: "", disabled: false, dataset: {}, children: [], resetCount: 0,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren(...xs) { this.children = xs; },
      append(...xs) { this.children.push(...xs); },
      reset() { this.resetCount++; }
    };
  }
  function el(id) {
    if (!dom.has(id)) dom.set(id, newNode());
    return dom.get(id);
  }
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [], createElement: newNode },
    window: { confirm: () => false },
    fetch: async () => ({
      ok: true, json: async () => ({
        supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
      })
    }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "synthetic" }
  });
  runInContext(script, ctx);
  runInContext(`
    sessionToken = "jwt";
    currentTenantId = "tenant-A";
    currentTenantRole = "manager";
    currentStoreId = "store-A";
    let menuPosts = 0;
    let menuReads = 0;
  `, ctx);
  el("tenant").value = "tenant-A";
  el("store").value = "store-A";
  return { ctx, el, runInContext };
}

test("manager Menu writes are single-flight and cannot be interrupted by Store/Tenant switch or sign-out", async () => {
  const { ctx, el, runInContext } = await menuMutationHarness();
  const pending = [];
  const posts = [];
  ctx.post = body => {
    posts.push(body);
    return new Promise(resolve => pending.push(resolve));
  };
  runInContext(`
    appFetch = async (path, options) => {
      if (path !== "/api/app/commerce-menu" || options?.method !== "POST") {
        throw new Error("unexpected Menu API");
      }
      menuPosts++;
      return post(options.body);
    };
    loadMenu = async () => { menuReads++; };
  `, ctx);
  el("categoryName").value = "Coffee";
  const first = runInContext("createCategory({ preventDefault() {} })", ctx);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].kind, "category");
  assert.equal(runInContext("menuWriteInFlight", ctx), true);
  assert.equal(el("createCategoryButton").disabled, true);
  assert.equal(el("createItemButton").disabled, true);

  el("itemName").value = "Latte";
  await runInContext("createCategory({ preventDefault() {} })", ctx);
  await runInContext("createItem({ preventDefault() {} })", ctx);
  assert.equal(posts.length, 1, "multiple form submissions cannot duplicate writes");

  el("store").value = "store-B";
  await runInContext("refreshStore()", ctx);
  assert.equal(el("store").value, "store-A");
  el("tenant").value = "tenant-B";
  await runInContext("loadTenant()", ctx);
  assert.equal(el("tenant").value, "tenant-A");
  runInContext("signOut()", ctx);
  assert.equal(runInContext("sessionToken", ctx), "jwt");
  assert.equal(posts.length, 1);

  pending[0]({ category: { id: "category-A" } });
  await first;
  assert.equal(runInContext("menuWriteInFlight", ctx), false);
  assert.equal(runInContext("menuReads", ctx), 1);
  assert.equal(el("categoryForm").resetCount, 1);
  assert.equal(el("createCategoryButton").disabled, false);
  assert.equal(el("createItemButton").disabled, false);
  assert.equal(el("status").dataset.state, "ok");
});

test("confirmed Menu insert followed by read-model failure remains success with warning, not a retry", async () => {
  const { ctx, el, runInContext } = await menuMutationHarness();
  el("itemName").value = "Bạc xỉu";
  el("itemAmount").value = "35000";
  runInContext(`
    menuState.items = [{ id: "old", name: "Old", price: 1000 }];
    appFetch = async (path, options) => {
      if (path !== "/api/app/commerce-menu" || options?.method !== "POST") throw new Error("unexpected");
      menuPosts++;
      return { item: { id: "new" } };
    };
    loadMenu = async () => { menuReads++; throw new Error("Menu read offline"); };
  `, ctx);
  await runInContext("createItem({ preventDefault() {} })", ctx);
  assert.equal(runInContext("menuPosts", ctx), 1);
  assert.equal(runInContext("menuReads", ctx), 1);
  assert.equal(el("itemForm").resetCount, 1, "form clears after confirmed database write");
  assert.equal(runInContext("menuState.items.length", ctx), 0, "stale menu prices must be cleared");
  assert.equal(el("status").dataset.state, "warning");
  assert.match(el("status").textContent, /Đã tạo menu item.*chưa tải lại/);
  assert.match(el("status").textContent, /không tạo lại/);
  assert.equal(el("createItemButton").disabled, false);
  assert.equal(runInContext("menuWriteInFlight", ctx), false);
});

test("uncertain Menu write never auto-retries, retains form, and warns that duplicate insert is possible", async () => {
  const { ctx, el, runInContext } = await menuMutationHarness();
  el("itemName").value = "New item";
  el("itemAmount").value = "45000";
  runInContext(`
    appFetch = async (path, options) => {
      if (path !== "/api/app/commerce-menu" || options?.method !== "POST") throw new Error("unexpected");
      menuPosts++;
      throw new Error("POST response lost");
    };
    loadMenu = async () => { menuReads++; };
  `, ctx);
  await assert.rejects(runInContext("createItem({ preventDefault() {} })", ctx), /Kiểm tra danh sách Menu trước khi gửi lại/);
  assert.equal(runInContext("menuPosts", ctx), 1);
  assert.equal(runInContext("menuReads", ctx), 0);
  assert.equal(el("itemForm").resetCount, 0, "uncertain request preserves operator entry");
  assert.equal(el("itemName").value, "New item");
  assert.equal(el("createItemButton").disabled, false);
  assert.equal(runInContext("menuWriteInFlight", ctx), false);
});

test("Daily Close cannot start while local POS or Menu operations are unsettled", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const dom = new Map();
  const node = id => {
    if (!dom.has(id)) dom.set(id, {
      value: "", textContent: "", disabled: false, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}
    });
    return dom.get(id);
  };
  let confirms = 0;
  const ctx = createContext({
    document: { getElementById: node, querySelectorAll: () => [],
      createElement: () => ({ value: "", textContent: "", append() {} }) },
    window: { confirm: () => { confirms++; return true; } },
    fetch: async () => ({ ok: true, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixture" }
  });
  runInContext(script, ctx);
  runInContext(`
    sessionToken = "jwt"; currentTenantId = "tenant-A";
    currentTenantRole = "manager"; currentStoreId = "store-A";
    currentDashboard = { businessDate: "2026-10-27", orderCount: 2,
      salesTotal: 70000, openOrderCount: 0, closed: false };
    let closeWrites = 0;
    appFetch = async () => { closeWrites++; throw new Error("Close must not be submitted"); };
  `, ctx);
  for (const state of [
    'currentOrder = { id: "order-1", status: "open", total: 30000 }',
    'pendingOrderSubmission = { clientOrderKey: "intent-1" }',
    'orderSubmitInFlight = true',
    'paymentSubmitInFlight = true',
    'menuWriteInFlight = true'
  ]) {
    runInContext(`
      currentOrder = null; pendingOrderSubmission = null;
      orderSubmitInFlight = false; paymentSubmitInFlight = false;
      menuWriteInFlight = false;
    `, ctx);
    runInContext(state, ctx);
    runInContext("renderClosePreview(); renderRoleControls()", ctx);
    assert.equal(node("closeDay").disabled, true, state + " disables close");
    await runInContext("closeBusinessDay()", ctx);
    assert.equal(runInContext("closeWrites", ctx), 0, state + " must not write");
    assert.equal(confirms, 0, state + " must not show misleading close confirmation");
  }
  runInContext(`
    currentOrder = null; pendingOrderSubmission = null;
    orderSubmitInFlight = false; paymentSubmitInFlight = false;
    menuWriteInFlight = false;
    renderClosePreview();
  `, ctx);
  assert.equal(node("closeDay").disabled, false, "ready dashboard can re-enable close");

  runInContext("currentDashboard.openOrderCount = 2; renderClosePreview()", ctx);
  assert.equal(node("closeDay").disabled, true, "two open orders must block closing day");
  assert.match(node("closePreview").textContent, /ĐÓNG NGÀY BỊ CHẶN/);
  assert.match(node("closePreview").textContent, /Khôi phục đơn chưa thanh toán/);
  assert.match(node("closePreview").textContent, /chưa hỗ trợ hủy đơn/);
  assert.match(node("closePreview").textContent, /không ghi thanh toán giả/);
  await runInContext("closeBusinessDay()", ctx);
  assert.equal(runInContext("closeWrites", ctx), 0, "blocked close cannot write");
  assert.equal(confirms, 0, "blocked close cannot request misleading confirmation");

  runInContext("currentDashboard.openOrderCount = 0; renderClosePreview()", ctx);
  assert.equal(node("closeDay").disabled, false, "resolved open orders permit confirmation");
  assert.doesNotMatch(node("closePreview").textContent, /ĐÓNG NGÀY BỊ CHẶN/);
});

test("confirmed POS payment invalidates pre-sale Dashboard while refreshed totals are pending", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const dom = new Map();
  const makeNode = () => ({
    value: "", textContent: "", disabled: false, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, replaceChildren() {}, append() {}
  });
  const node = id => {
    if (!dom.has(id)) dom.set(id, makeNode());
    return dom.get(id);
  };
  const ctx = createContext({
    document: { getElementById: node, querySelectorAll: () => [], createElement: makeNode },
    window: { confirm: () => true },
    fetch: async () => ({ ok: true, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixture" }
  });
  runInContext(script, ctx);
  node("paymentMethod").value = "cash";
  runInContext(`
    sessionToken = "jwt"; currentTenantId = "tenant-A";
    currentTenantRole = "manager"; currentStoreId = "store-A";
    currentOrder = { id: "order-1", status: "open", total: 30000 };
    currentDashboard = { businessDate: "2026-10-27",
      orderCount: 0, salesTotal: 0, openOrderCount: 0, closed: false };
    let paymentWrites = 0; let closeWrites = 0; let dashboardReads = 0;
    const ready = [];
    appFetch = async path => {
      if (path === "/api/app/commerce-payment") {
        paymentWrites++;
        return { orderId: "order-1", status: "paid" };
      }
      if (path === "/api/app/commerce-daily-close") { closeWrites++; throw new Error("premature close"); }
      throw new Error("unexpected route " + path);
    };
    loadDashboard = async () => {
      dashboardReads++;
      await new Promise(resolve => ready.push(resolve));
      currentDashboard = { businessDate: "2026-10-27",
        orderCount: 1, salesTotal: 30000, openOrderCount: 0, closed: false };
      renderClosePreview();
    };
    renderClosePreview();
  `, ctx);
  assert.equal(node("closeDay").disabled, true, "open order already blocks Daily Close");
  const recording = runInContext("capturePayment()", ctx);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(runInContext("paymentWrites", ctx), 1);
  assert.equal(runInContext("dashboardReads", ctx), 1);
  assert.equal(runInContext("currentOrder", ctx), null, "server confirmed paid");
  assert.equal(runInContext("currentDashboard", ctx), null, "old sales total invalidated before GET finishes");
  assert.equal(node("closeDay").disabled, true);
  await runInContext("closeBusinessDay()", ctx);
  assert.equal(runInContext("closeWrites", ctx), 0, "no close before fresh paid totals");
  runInContext("ready[0]()", ctx);
  await recording;
  assert.equal(runInContext("currentDashboard.salesTotal", ctx), 30000);
  assert.equal(node("closeDay").disabled, false, "verified dashboard may enable close");
  assert.equal(node("status").dataset.state, "ok");
  assert.equal(runInContext("paymentWrites", ctx), 1, "no duplicate capture");
});

test("paid receipt is server-sourced, printable on click, and treats item names as text", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(html, /id="paidReceipt"/);
  assert.match(html, /id="printPaidReceipt"/);
  const inline = html.split("<script>")[1]?.split("</script>")[0];
  const dom = new Map();
  function element() {
    const classes = new Set();
    return {
      value: "", textContent: "", disabled: false, dataset: {}, children: [],
      classList: {
        add(x) { classes.add(x); }, remove(x) { classes.delete(x); },
        toggle(x, enabled) { if (enabled) classes.add(x); else classes.delete(x); },
        contains(x) { return classes.has(x); }
      },
      addEventListener() {}, replaceChildren(...xs) { this.children = xs; },
      append(...xs) { this.children.push(...xs); }
    };
  }
  function el(id) {
    if (!dom.has(id)) dom.set(id, element());
    return dom.get(id);
  }
  let printCalls = 0;
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [], createElement: element },
    window: { confirm: () => false, print: () => { printCalls++; } },
    fetch: async () => ({ ok: true, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    URLSearchParams, Intl, crypto: { randomUUID: () => "test" }
  });
  runInContext(inline, ctx);
  runInContext(`
    sessionToken = "jwt-A"; currentTenantId = "tenant-A";
    currentTenantRole = "cashier"; currentStoreId = "store-A";
    appFetch = async (path) => {
      if (!path.includes("commerce-receipt?orderId=order-A&storeId=store-A")) {
        throw new Error("Unexpected receipt URL");
      }
      return { receipt: {
        orderId: "order-A", storeId: "store-A", storeName: "CafeOS Shop",
        orderNumber: "C-0088", businessDate: "2026-10-27", channel: "counter",
        paidAt: "2026-10-27T10:00:00Z", status: "paid",
        subtotal: "70000.00", discountTotal: "5000.07", taxTotal: "2000.29",
        total: "67000.22",
        items: [{ name: "<img src=x onerror=alert(1)>", quantity: "2.000",
          unitPrice: "35000.00", lineTotal: "70000.00" }],
        payment: { method: "cash", amount: "67000.22" }
      } };
    };
  `, ctx);
  runInContext("printPaidReceipt()", ctx);
  assert.equal(printCalls, 0, "unverified receipt cannot print");
  await runInContext('loadPaidReceipt("order-A")', ctx);
  assert.equal(el("paidReceipt").classList.contains("hidden"), false);
  assert.equal(el("receiptStore").textContent, "CafeOS Shop");
  assert.match(el("receiptMeta").textContent, /C-0088/);
  assert.equal(el("receiptLines").children.length, 4);
  assert.match(el("receiptLines").children[0].children[0].textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(el("receiptLines").children[1].children[0].textContent, "Tạm tính");
  assert.equal(el("receiptLines").children[2].children[0].textContent, "Giảm giá");
  assert.equal(el("receiptLines").children[3].children[0].textContent, "Thuế");
  assert.match(el("receiptTotal").textContent, /67/);
  assert.match(el("receiptTotal").textContent, /,22/);
  assert.match(runInContext('money("0.07")', ctx), /0,07/);
  assert.equal(el("printPaidReceipt").disabled, false);
  runInContext("printPaidReceipt()", ctx);
  assert.equal(printCalls, 1, "print is always initiated by the cashier");
  runInContext("clearPaidReceipt()", ctx);
  assert.equal(el("receiptLines").children.length, 0);
  assert.equal(el("printPaidReceipt").disabled, true);
  runInContext("printPaidReceipt()", ctx);
  assert.equal(printCalls, 1);
});

test("late paid receipt from old Store is discarded and receipt GET failure never retries payment", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const inline = html.split("<script>")[1]?.split("</script>")[0];
  const dom = new Map();
  function el(id) {
    if (!dom.has(id)) dom.set(id, {
      value: "", textContent: "", disabled: false, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren() {}, append() {}
    });
    return dom.get(id);
  }
  const waiting = [];
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [],
      createElement: () => ({ textContent: "", append() {} }) },
    window: { confirm: () => false, print() {} },
    fetch: async () => ({ ok: true, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    deferred: path => new Promise(resolve => waiting.push({ path, resolve })),
    URLSearchParams, Intl, crypto: { randomUUID: () => "test" }
  });
  runInContext(inline, ctx);
  runInContext(`
    sessionToken = "jwt"; currentTenantId = "tenant-A";
    currentTenantRole = "cashier"; currentStoreId = "store-A";
    appFetch = deferred;
    loadMenu = async () => {};
    loadDashboard = async () => {};
    loadOptionalControlTower = async () => true;
  `, ctx);
  const obsolete = runInContext('loadPaidReceipt("order-A")', ctx);
  assert.equal(waiting.length, 1);
  el("store").value = "store-B";
  await runInContext("refreshStore()", ctx);
  waiting[0].resolve({ receipt: {
    orderId: "order-A", storeId: "store-A", status: "paid",
    items: [{ name: "Old", quantity: 1 }], payment: { method: "cash" }
  } });
  await obsolete;
  assert.equal(runInContext("paidReceiptState", ctx), null);
  assert.equal(el("printPaidReceipt").disabled, true);
  assert.equal(el("receiptStore").textContent, "");

  runInContext('appFetch = async () => { throw new Error("Network offline"); }', ctx);
  await runInContext('loadPaidReceipt("order-B")', ctx);
  assert.equal(runInContext("paidReceiptState", ctx), null);
  assert.equal(el("printPaidReceipt").disabled, true);
  assert.match(el("receiptMessage").textContent, /không ghi Payment lần nữa/);
  assert.equal(waiting.length, 1, "receipt lookup failure must not issue any payment call");
});

test("paid-order reprint list renders authorized settled receipts and paginates without commerce writes", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(html, /id="browsePaidOrders"/);
  assert.match(html, /id="paidOrderList"/);
  const script = html.split("<script>")[1]?.split("</script>")[0];
  const elements = new Map();
  function newElement() {
    return {
      value: "", textContent: "", disabled: false, dataset: {}, className: "",
      children: [], listeners: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(name, cb) { this.listeners[name] = cb; },
      replaceChildren(...items) { this.children = [...items]; },
      append(...items) { this.children.push(...items); },
      querySelector(sel) {
        return this.children.find(x => x.className?.includes(sel.slice(1))) || null;
      },
      remove() { elements.get("paidOrderList").children =
        elements.get("paidOrderList").children.filter(x => x !== this); }
    };
  }
  const el = id => {
    if (!elements.has(id)) elements.set(id, newElement());
    return elements.get(id);
  };
  const calls = [];
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [], createElement: newElement },
    window: { confirm: () => false, print() {} },
    fetch: async () => ({ ok: true, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    historyFetch: path => {
      calls.push(path);
      const row = offset => ({
        id: "paid-" + offset, orderNumber: "C-" + offset,
        storeId: "store-A", status: "paid", total: "35000.00",
        paidAt: "2026-10-27T08:30:00Z", businessDate: "2026-10-27"
      });
      if (path.includes("offset=0")) return Promise.resolve({
        orders: [row(0)], nextOffset: 20
      });
      if (path.includes("offset=20")) return Promise.resolve({
        orders: [row(20)], nextOffset: null
      });
      throw new Error("Unexpected read " + path);
    },
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixture" }
  });
  runInContext(script, ctx);
  runInContext(`
    sessionToken = "jwt"; currentTenantId = "tenant-A";
    currentTenantRole = "cashier"; currentStoreId = "store-A";
    appFetch = historyFetch;
  `, ctx);
  const first = runInContext("browsePaidOrders()", ctx);
  assert.equal(el("browsePaidOrders").disabled, true);
  await first;
  assert.equal(el("browsePaidOrders").disabled, false);
  assert.equal(el("paidOrderList").children.length, 2);
  assert.match(el("paidOrderList").children[0].textContent, /C-0/);
  assert.match(el("paidOrderList").children[1].textContent, /Xem thêm/);
  assert.equal(typeof el("paidOrderList").children[0].listeners.click, "function");

  await runInContext("browsePaidOrders(20)", ctx);
  assert.equal(el("paidOrderList").children.length, 2, "remove prior More before appending");
  assert.match(el("paidOrderList").children[1].textContent, /C-20/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(path => path.startsWith("/api/app/commerce-paid-orders?")));
  assert.equal(runInContext("paidReceiptState", ctx), null, "history fetch must not forge a paid receipt");
});

test("paid history drops obsolete Store responses and refuses unpaid/other-Store results", async () => {
  const { createContext, runInContext } = await import("node:vm");
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const script = html.split("<script>")[1]?.split("</script>")[0];
  const nodes = new Map();
  function newNode() {
    return {
      value: "", textContent: "", disabled: false, dataset: {},
      className: "", children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, replaceChildren(...xs) { this.children = [...xs]; },
      append(...xs) { this.children.push(...xs); }
    };
  }
  const el = id => {
    if (!nodes.has(id)) nodes.set(id, newNode());
    return nodes.get(id);
  };
  const pending = [];
  const ctx = createContext({
    document: { getElementById: el, querySelectorAll: () => [], createElement: newNode },
    window: { confirm: () => false, print() {} },
    fetch: async () => ({ ok: true, json: async () => ({
      supabaseUrl: "https://example.invalid", publishableKey: "sb_publishable_test"
    }) }),
    deferred: path => new Promise(resolve => pending.push({ path, resolve })),
    URLSearchParams, Intl, crypto: { randomUUID: () => "fixture" }
  });
  runInContext(script, ctx);
  runInContext(`
    sessionToken = "jwt"; currentTenantId = "tenant-A";
    currentTenantRole = "cashier"; currentStoreId = "store-A";
    appFetch = deferred;
    loadMenu = async () => {};
    loadDashboard = async () => {};
    loadOptionalControlTower = async () => true;
  `, ctx);
  const row = (store, id) => ({
    id, storeId: store, orderNumber: id, status: "paid",
    total: 30000, paidAt: "2026-10-27T09:00:00Z", businessDate: "2026-10-27"
  });
  const obsolete = runInContext("browsePaidOrders()", ctx);
  assert.equal(pending.length, 1);
  assert.match(pending[0].path, /store-A/);
  el("store").value = "store-B";
  await runInContext("refreshStore()", ctx);
  assert.equal(runInContext("paidOrdersLoadInFlight", ctx), false);
  const fresh = runInContext("browsePaidOrders()", ctx);
  assert.equal(pending.length, 2);
  assert.match(pending[1].path, /store-B/);
  pending[0].resolve({ orders: [row("store-A", "old")], nextOffset: null });
  await obsolete;
  assert.equal(el("paidOrderList").children.length, 0);
  assert.equal(runInContext("paidOrdersLoadInFlight", ctx), true);
  pending[1].resolve({ orders: [row("store-B", "new")], nextOffset: null });
  await fresh;
  assert.equal(el("paidOrderList").children.length, 1);
  assert.match(el("paidOrderList").children[0].textContent, /new/);
  assert.equal(el("browsePaidOrders").disabled, false);

  runInContext('appFetch = async () => ({ orders: [{ id: "unpaid", storeId: "store-B", status: "open" }], nextOffset: null })', ctx);
  await assert.rejects(runInContext("browsePaidOrders()", ctx), /không hợp lệ/);
  assert.equal(el("paidOrderList").children.length, 1, "invalid response cannot replace verified history");
  runInContext('appFetch = async () => ({ orders: [{ id: "wrong", storeId: "store-A", status: "paid" }], nextOffset: null })', ctx);
  await assert.rejects(runInContext("browsePaidOrders()", ctx), /không hợp lệ/);
  assert.equal(el("paidOrderList").children.length, 1);
});

test("HQ Overview exposes manager-only, date-scoped first-party multi-store evidence without local fake data", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const preview = await readFile(new URL("../scripts/serve-vercel-preview.mjs", import.meta.url), "utf8");
  assert.match(html, /id="hqNav"[^>]*data-view="hqWorkspace"/);
  assert.match(html, /id="hqBusinessDate" type="date"/);
  assert.match(html, /id="hqMetrics"/);
  assert.match(html, /id="hqStores"/);
  assert.match(html, /hqNav"\)\.classList\.toggle\("hidden", !manager\)/);
  assert.match(html, /\/api\/app\/commerce-hq\?businessDate=/);
  assert.match(html, /overview\.source !== "cafeos_pos"/);
  assert.match(html, /hqMoney\(overview\.salesTotal\)/);
  assert.match(html, /không công bố tổng một phần/);
  assert.ok(vercel.rewrites.some(x => x.source === "/api/app/commerce-hq"
    && x.destination === "/api/app/workflow?route=commerce-hq"));
  assert.match(preview, /'\/api\/app\/commerce-hq', 'commerce-hq'/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/);
});

test("POS manager void UI is deliberately gated and never calls a payment or refund endpoint", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(html, /id="voidControls" class="void-controls hidden"/);
  assert.match(html, /id="voidReason" maxlength="240"/);
  assert.match(html, /id="voidOrder"/);
  assert.match(html, /voidControls"\)\.classList\.toggle\("hidden", !manager\)/);
  assert.match(html, /let pendingVoidIntent = null/);
  assert.match(html, /voidSubmitInFlight/);
  assert.match(html, /if \(!pendingVoidIntent\)/);
  assert.match(html, /\/api\/app\/commerce-void-order/);
  assert.match(html, /currentOrder = null;[\s\S]*invalidateOpenOrderReads\(\)/);
  assert.match(html, /pendingVoidIntent[\s\S]*không ghi Payment/i);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/);
});
