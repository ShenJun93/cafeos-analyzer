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
