import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
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
    root: new URL("..", import.meta.url).pathname
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
    let payments = 0;
    let dashboardRefreshes = 0;
    loadDashboard = async () => { dashboardRefreshes += 1; };
    appFetch = async (path) => {
      if (path === "/api/app/commerce-payment") {
        payments += 1; throw new Error("network response lost");
      }
      if (path.startsWith("/api/app/commerce-order-status?orderId=")) {
        statusChecks += 1;
        return { order: { id: "order-1", storeId: "store-1", status: statusResult } };
      }
      throw new Error("unexpected route " + path);
    };
  `, context);
  await runInContext("capturePayment()", context);
  assert.equal(runInContext("currentOrder", context), null);
  assert.equal(runInContext("statusChecks", context), 1);
  assert.equal(runInContext("dashboardRefreshes", context), 1);
  assert.match(elem("status").textContent, /xác nhận payment thành công/i);

  runInContext('currentOrder = { id: "order-1", status: "open", total: 50000 }; statusResult = "open";', context);
  await assert.rejects(runInContext("capturePayment()", context), /Chưa xác minh được payment/);
  assert.equal(runInContext("currentOrder.status", context), "open");
  assert.equal(runInContext("statusChecks", context), 2);
  assert.equal(runInContext("dashboardRefreshes", context), 1);
});

test("local workflow router keeps orderId/storeId query params and denies anonymous reads", async () => {
  const server = createVercelShapePreviewServer({
    root: new URL("..", import.meta.url).pathname,
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

test("cart buttons never exceed maximum POS quantity supported by trusted create-order RPC", async () => {
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
