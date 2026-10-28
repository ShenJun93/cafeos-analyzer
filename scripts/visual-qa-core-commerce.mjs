// Chromium UI evidence for Core Commerce v1. All users, orders and responses
// are synthetic. This NEVER calls real Supabase/Vercel or processes payments.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createVercelShapePreviewServer } from "./serve-vercel-preview.mjs";

const BASE_DIR = resolve("artifacts/cafeos-visual");
const TENANT = "10000000-0000-4000-8000-000000000001";
const STORE = "11000000-0000-4000-8000-000000000001";
const COFFEE = "15000000-0000-4000-8000-000000000001";
const DATE = "2026-10-25";
const day = () => ({
  source: "cafeos_pos", tenantId: TENANT, storeId: STORE,
  businessDate: DATE, salesTotal: 70000, paymentTotal: 70000,
  orderCount: 1, openOrderCount: 0, aov: 70000,
  paymentMix: { cash: 70000 }, closed: false
});
const menu = {
  categories: [{ id: "17000000-0000-4000-8000-000000000001", name: "Coffee", sortOrder: 0 }],
  items: [
    { id: COFFEE, name: "Latte", sku: "LATTE", price: 35000, active: true },
    { id: "15000000-0000-4000-8000-000000000002", name: "Cappuccino", sku: "CAP", price: 42000, active: true },
    { id: "15000000-0000-4000-8000-000000000003", name: "Cold Brew", sku: "COLD", price: 45000, active: true }
  ]
};
const state = { lastOrder: null, paid: false, closed: false, requests: [], closeWrites: 0, voidWrites: 0, loseVoidAck: false };

function jsonResponse(payload) {
  return JSON.stringify(payload);
}
async function installMockTransport(page) {
  await page.route("https://synthetic.supabase.invalid/**", async route => {
    const req = route.request();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,GET,OPTIONS",
      "access-control-allow-headers": "*"
    };
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers, body: "" });
    }
    const data = req.postDataJSON();
    const isManager = String(data?.email || "").startsWith("manager@");
    return route.fulfill({
      status: 200, headers, contentType: "application/json",
      body: jsonResponse({ access_token: isManager ? "synthetic-manager-token" : "synthetic-cashier-token" })
    });
  });

  await page.route("**/api/app/**", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === "/api/app/client-config") return route.continue();
    const token = req.headers().authorization || "";
    const manager = token === "Bearer synthetic-manager-token";
    const cashier = token === "Bearer synthetic-cashier-token";
    if (!manager && !cashier) {
      return route.fulfill({ status: 401, contentType: "application/json",
        body: jsonResponse({ error: { code: "AUTH_REQUIRED", message: "Auth required" } }) });
    }
    let payload, status = 200;
    state.requests.push({ path: url.pathname, method: req.method(), role: manager ? "manager" : "cashier" });
    switch (url.pathname) {
      case "/api/app/session":
        payload = {
          user: { id: manager ? "synthetic-manager" : "synthetic-cashier" },
          memberships: [{ tenantId: TENANT, name: "CafeOS Synthetic", role: manager ? "manager" : "cashier" }]
        };
        break;
      case "/api/app/stores":
        payload = { stores: [{ id: STORE, name: "Synthetic Flagship", active: true, timezone: "Asia/Ho_Chi_Minh" }] };
        break;
      case "/api/app/commerce-menu":
        payload = menu;
        break;
      case "/api/app/commerce-dashboard":
        payload = { dashboard: { ...day(), closed: state.closed } };
        break;
      case "/api/app/commerce-hq": {
        assert.equal(req.method(), "GET");
        assert.equal(url.searchParams.get("businessDate"), DATE);
        if (!manager) {
          status = 403;
          payload = { error: { code: "COMMERCE_MANAGER_FORBIDDEN", message: "Manager role required" } };
          break;
        }
        payload = { overview: {
          source: "cafeos_pos", businessDate: DATE,
          storeCount: 1, closedStoreCount: 0, orderCount: 1, openOrderCount: 0,
          salesTotal: "70000.00", paymentTotal: "70000.00",
          aov: "70000.00", paymentMix: { cash: "70000.00" },
          stores: [{
            id: STORE, name: "Synthetic Flagship", businessDate: DATE,
            status: "open", orderCount: 1, openOrderCount: 0,
            salesTotal: "70000.00", paymentTotal: "70000.00"
          }]
        } };
        break;
      }
      case "/api/app/commerce-hq-sources": {
        assert.equal(req.method(), "GET");
        assert.equal(url.searchParams.get("businessDate"), DATE);
        assert.equal(manager, true, "cashier may not read HQ source coverage");
        payload = { report: {
          sourceBoundary: "separate_not_deduplicated",
          businessDate: DATE, activeStoreCount: 1,
          directoryEvidence: {status:"exact_store_directory",verified:true,matchedStoreCount:1},
          counts: { bothPresent: 1, posOnly: 0, importsOnly: 0, neither: 0 },
          reconciliation: { status: "not_proven",
            sharedTransactionIdentity: "not_verified",
            deduplication: "not_performed", combinedSales: null },
          stores: [{
            storeId: STORE, storeName: "Synthetic Flagship", businessDate: DATE,
            status: "both_present_overlap_unresolved",
            pos: {
              source: "cafeos_pos", hasData: true, salesTotal: "70000.00",
              paidOrders: 1, openOrders: 0, closed: state.closed
            },
            imports: {
              source: "imported_line_items", hasData: true,
              netSales: "34000.00", orders: 1, baselineStatus: "insufficient_history"
            }
          }]
        } };
        break;
      }
      case "/api/app/brief":
        payload = {
          kind: "control-tower-daily-brief",
          metrics: { netSales: { current: 0 }, orders: { current: 0 }, aov: { current: null } },
          attention: [], unresolvedActions: []
        };
        break;
      case "/api/app/commerce-order": {
        const body = req.postDataJSON();
        assert.equal(req.method(), "POST");
        assert.deepEqual(Object.keys(body).sort(), ["channel", "clientOrderKey", "items", "storeId"].sort());
        state.lastOrder = {
          id: state.paid ? "16000000-0000-4000-8000-000000000002" : "16000000-0000-4000-8000-000000000001",
          orderNumber: "POS-SYNTHETIC", clientOrderKey: body.clientOrderKey,
          total: 35000 * body.items[0].quantity, status: "open", storeId: STORE
        };
        payload = { order: state.lastOrder, items: [] };
        status = 201;
        break;
      }
      case "/api/app/commerce-payment": {
        assert.equal(req.method(), "POST");
        const body = req.postDataJSON();
        assert.equal(body.amount, state.lastOrder.total, "payment amount must follow server total");
        state.lastOrder.status = "paid";
        state.paid = true;
        payload = { orderId: state.lastOrder.id, status: "paid", payment: { amount: body.amount, status: "captured" } };
        status = 201;
        break;
      }
      case "/api/app/commerce-void-order": {
        assert.equal(req.method(), "POST");
        assert.equal(manager, true);
        const body = req.postDataJSON();
        assert.equal(body.orderId, state.lastOrder.id);
        assert.equal(body.storeId, STORE);
        assert.equal(body.reason, "Khách đổi ý");
        assert.equal(state.lastOrder.status, "open");
        state.lastOrder.status = "voided";
        state.voidWrites++;
        payload = { void: {
          orderId: body.orderId, storeId: STORE, businessDate: DATE,
          status: "voided", reason: body.reason,
          voidedByUserId: "synthetic-manager", voidedAt: DATE + "T11:30:00Z",
          idempotent: false
        } };
        if (state.loseVoidAck) {
          status = 503;
          payload = { error: { message: "Synthetic committed void but response lost" } };
        }
        break;
      }
      case "/api/app/commerce-source-bridge": {
        assert.equal(req.method(), "GET");
        assert.equal(url.searchParams.get("storeId"), STORE);
        assert.equal(url.searchParams.get("businessDate"), DATE);
        payload = {
          tenant: { id: TENANT },
          store: { id: STORE, name: "Synthetic Flagship" },
          businessDate: DATE,
          sourceBoundary: {status:"separate_not_deduplicated",
            reason:"Import and POS may overlap; never sum"},
          sources: {
            cafeosPos: { source:"cafeos_pos",hasData:true,
              salesTotal:"70000.00",orderCount:1,openOrderCount:0,aov:"70000.00",closed:state.closed },
            imports: { source:"imported_line_items",hasData:true,
              asOfBusinessDate:DATE,netSales:"34000.00",orderCount:1,aov:"34000.00",
              baselineStatus:"insufficient_history",
              latestObservedTransactionAt:DATE+"T07:00:00Z"}
          }
        };
        break;
      }
      case "/api/app/commerce-import-lineage": {
        assert.equal(manager, true, "only manager may inspect import namespace evidence");
        assert.equal(req.method(), "GET");
        assert.equal(url.searchParams.get("storeId"), STORE);
        assert.equal(url.searchParams.get("businessDate"), DATE);
        payload = {
          tenant: { id: TENANT },
          store: { id: STORE, name: "Synthetic Flagship", timezone: "Asia/Ho_Chi_Minh" },
          businessDate: DATE,
          boundedUtcRange: {
            start: "2026-10-27T17:00:00.000Z", end: "2026-10-28T17:00:00.000Z"
          },
          sourceBoundary: {
            status: "import_namespace_observation_only",
            transactionIdentity: "tenant_store_source_namespace_transaction_id",
            sourceAccountProvenance: "not_verified",
            comparedToPos: false, deduplication: "not_performed",
            combinedSales: null, transactionIdsExposed: false
          },
          completeness: { status:"bounded_read_only",
            maxLineItems: 500, exactResponseVerified: true,
            exactMatchedLineItemCount: 3, noRowLimitReached:true },
          observedLineItemCount: 3, observedNamespaceCount: 2,
          namespaces: [
            {sourceNamespace:"kiotviet",lineItemCount:2,sourceScopedTransactionCount:1},
            {sourceNamespace:"sapo",lineItemCount:1,sourceScopedTransactionCount:1}
          ]
        };
        break;
      }
      case "/api/app/commerce-void-history": {
        assert.equal(manager, true);
        assert.equal(req.method(), "GET");
        assert.equal(url.searchParams.get("storeId"), STORE);
        const audit = {
          orderId: state.lastOrder.id, storeId: STORE, businessDate: DATE,
          reason: "Khách đổi ý", voidedByUserId: "synthetic-manager",
          voidedAt: DATE + "T11:30:00Z"
        };
        if (url.searchParams.has("orderId")) {
          assert.equal(url.searchParams.get("orderId"), state.lastOrder.id);
          payload = {
            order: { orderId: state.lastOrder.id, orderNumber: "POS-SYNTHETIC",
              storeId: STORE, businessDate: DATE, status: state.lastOrder.status },
            receipt: state.lastOrder.status === "voided" ? audit : null
          };
        } else {
          assert.equal(url.searchParams.get("offset"), "0");
          payload = { receipts: state.voidWrites ? [audit] : [], nextOffset: null };
        }
        break;
      }
      case "/api/app/commerce-open-orders":
        payload = { orders: [], nextOffset: null };
        break;
      case "/api/app/commerce-paid-orders":
        assert.equal(req.method(), "GET");
        assert.equal(url.searchParams.get("storeId"), STORE);
        payload = {
          orders: state.paid ? [{
            id: state.lastOrder.id, orderNumber: state.lastOrder.orderNumber,
            storeId: STORE, status: "paid", total: state.lastOrder.total,
            paidAt: DATE + "T08:30:00Z", businessDate: DATE
          }] : [],
          nextOffset: null
        };
        break;
      case "/api/app/commerce-receipt":
        assert.equal(req.method(), "GET");
        assert.equal(url.searchParams.get("orderId"), state.lastOrder?.id);
        assert.equal(url.searchParams.get("storeId"), STORE);
        assert.equal(state.paid, true, "only paid orders expose printable receipt");
        payload = { receipt: {
          orderId: state.lastOrder.id, storeId: STORE,
          storeName: "Synthetic Flagship",
          orderNumber: state.lastOrder.orderNumber, channel: "counter",
          businessDate: DATE, paidAt: DATE + "T08:30:00Z", status: "paid",
          total: state.lastOrder.total,
          items: [{ name: "Latte", quantity: "2.000",
            unitPrice: "35000.00", lineTotal: "70000.00" }],
          payment: { method: "cash", amount: state.lastOrder.total,
            paidAt: DATE + "T08:30:00Z" }
        } };
        break;
      case "/api/app/commerce-daily-close": {
        assert.equal(req.method(), "POST");
        assert.equal(manager, true, "only manager may close a day");
        assert.equal(req.postDataJSON().businessDate, DATE);
        state.closeWrites++;
        state.closed = true;
        payload = { close: {
          id: "19000000-0000-4000-8000-000000000001",
          businessDate: DATE, orderCount: 1, salesTotal: 70000, paymentTotal: 70000
        } };
        status = 201;
        break;
      }
      default:
        throw new Error("Unhandled synthetic browser API: " + url.pathname);
    }
    return route.fulfill({ status, contentType: "application/json", body: jsonResponse(payload) });
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const m = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  assert.ok(m.document <= m.viewport + 1 && m.body <= m.viewport + 1,
    label + ": horizontal overflow: " + JSON.stringify(m));
}

async function snapshot(page, width, label) {
  await assertNoHorizontalOverflow(page, label);
  await page.screenshot({ path: resolve(BASE_DIR, width + "-" + label + ".png"), fullPage: true });
}

async function signIn(page, email, password) {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#signIn").click();
  await page.locator("#menuCatalog .menu-item-button").first().waitFor({ state: "visible" });
  assert.equal(await page.locator("#authPanel").isVisible(), false);
}

async function runViewport(browser, width, height, base) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await installMockTransport(page);
    await page.goto(base + "/app", { waitUntil: "networkidle" });
    await snapshot(page, width, "login");
    await signIn(page, "manager@synthetic.invalid", "synthetic-only");
    const modules = await page.locator(".app-nav-item,.app-nav-link").evaluateAll(
      els => els.map(el => {
        const box = el.getBoundingClientRect();
        return { name: el.textContent.trim(), left: box.left, right: box.right, width: box.width };
      })
    );
    assert.equal(modules.length, 7, "all modules including HQ must appear in manager navigation");
    assert.ok(modules.some(x => x.name === "HQ Overview"), "missing HQ navigation");
    for (const link of modules) {
      assert.ok(link.left >= -1 && link.right <= width + 1 && link.width > 0,
        width + "px module tab clipped: " + JSON.stringify(link));
    }
    assert.equal(await page.locator("#menuWriteControls").evaluate(el => el.classList.contains("hidden")), false);
    await snapshot(page, width, "pos");
    await page.locator("#hqNav").click();
    await page.locator("#hqMetrics .metric-display").first().waitFor({ state: "visible" });
    assert.match(await page.locator("#hqStatus").innerText(), /1 Store/);
    assert.match(await page.locator("#hqStores").innerText(), /Synthetic Flagship/);
    await snapshot(page, width, "hq-overview");
    await page.locator("#hqSourcesRefresh").click();
    await page.locator("#hqSourcesRows .hq-source-row").first().waitFor({state:"visible"});
    assert.match(await page.locator("#hqSourcesRows").innerText(), /Synthetic Flagship/);
    assert.match(await page.locator("#hqSourcesRows").innerText(), /CHƯA loại trùng/);
    assert.match(await page.locator("#hqSourcesStatus").innerText(), /Không có tổng doanh thu gộp/);
    await snapshot(page, width, "hq-source-coverage");
    await page.locator('[data-view="posWorkspace"]').click();
    const latte = page.locator("#menuCatalog .menu-item-button").filter({ hasText: "Latte" });
    await latte.click();
    await latte.click();
    await snapshot(page, width, "cart");
    assert.equal(await page.locator("#submitOrder").isDisabled(), false);
    await page.locator("#submitOrder").click();
    await page.locator("#paymentPanel").waitFor({ state: "visible" });
    assert.match(await page.locator("#serverOrderTotal").innerText(), /70/);
    await snapshot(page, width, "payment");
    await page.locator("#capturePayment").click();
    await page.locator("#paymentPanel").waitFor({ state: "hidden" });
    assert.equal(state.paid, true);
    await page.waitForFunction(() => {
      const button = document.getElementById("printPaidReceipt");
      return button && !button.disabled;
    });
    assert.equal(await page.locator("#printPaidReceipt").isEnabled(), true);
    assert.match(await page.locator("#receiptTotal").innerText(), /70/);
    await snapshot(page, width, "paid-receipt");
    await page.locator("#browsePaidOrders").click();
    await page.locator("#paidOrderList button").first().waitFor({ state: "visible" });
    assert.match(await page.locator("#paidOrderList button").first().innerText(), /POS-SYNTHETIC/);
    await page.locator("#paidOrderList button").first().click();
    await page.waitForFunction(() => {
      const button = document.getElementById("printPaidReceipt");
      return button && !button.disabled;
    });
    assert.equal(await page.locator("#printPaidReceipt").isEnabled(), true);
    await snapshot(page, width, "receipt-reprint");
    await page.locator('[data-view="posWorkspace"]').click();
    await latte.click();
    await page.locator("#submitOrder").click();
    await page.locator("#paymentPanel").waitFor({ state: "visible" });
    await page.locator("#voidReason").fill("Khách đổi ý");
    state.loseVoidAck = true;
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#voidOrder").click();
    await page.locator("#checkVoidResult").waitFor({ state: "visible" });
    assert.equal(state.lastOrder.status, "voided");
    assert.equal(state.voidWrites, 1);
    assert.equal(await page.locator("#capturePayment").isDisabled(), true);
    await snapshot(page, width, "void-response-uncertain");
    await page.locator("#checkVoidResult").click();
    await page.locator("#paymentPanel").waitFor({ state: "hidden" });
    assert.equal(state.voidWrites, 1, "read-only reconciliation must not repeat void write");
    await page.locator("#voidHistory").click();
    await page.locator("#voidHistoryList .void-audit-item").first().waitFor({ state: "visible" });
    assert.match(await page.locator("#voidHistoryList").innerText(), /Khách đổi ý/);
    assert.match(await page.locator("#voidHistoryList").innerText(), /synthetic-manager/);
    await snapshot(page, width, "void-audit-history");
    await page.locator('[data-view="menuWorkspace"]').click();
    await snapshot(page, width, "menu");
    await page.locator('[data-view="dashboardWorkspace"]').click();
    await snapshot(page, width, "dashboard");
    await page.locator('[data-view="closeWorkspace"]').click();
    await snapshot(page, width, "daily-close");
    page.once("dialog", async dialog => {
      assert.match(dialog.message(), /2026-10-25/);
      await dialog.dismiss();
    });
    await page.locator("#closeDay").click();
    assert.equal(state.closeWrites, 0, "cancel must not write");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#closeDay").click();
    await page.locator("#closeReceipt").getByText("Close 2026-10-25", { exact: false }).count().catch(() => {});
    assert.equal(state.closeWrites, 1);
    await snapshot(page, width, "closed");
    await page.locator('[data-view="controlWorkspace"]').click();
    await snapshot(page, width, "control-tower");
    await page.locator("#sourceBridgeRefresh").click();
    await page.locator("#sourceBridgeCards .source-bridge-card").first().waitFor({state:"visible"});
    assert.equal(await page.locator("#sourceBridgeCards .source-bridge-card").count(),2);
    assert.match(await page.locator("#sourceBridgeCards").innerText(),/CafeOS-native POS/);
    assert.match(await page.locator("#sourceBridgeCards").innerText(),/Nguồn import/);
    assert.match(await page.locator("#sourceBridgeStatus").innerText(),/KHÔNG cộng tổng/);
    await snapshot(page, width, "source-separated-bridge");
    await page.locator("#importLineageRefresh").click();
    await page.locator("#importLineageRows .import-lineage-row").first().waitFor({state:"visible"});
    assert.equal(await page.locator("#importLineageRows .import-lineage-row").count(),2);
    assert.match(await page.locator("#importLineageRows").innerText(),/kiotviet/);
    assert.match(await page.locator("#importLineageRows").innerText(),/sapo/);
    assert.match(await page.locator("#importLineageStatus").innerText(),/KHÔNG đối soát trùng/);
    await snapshot(page, width, "import-namespace-evidence");
    assert.deepEqual(errors, [], "browser JS console errors");
    console.log("BROWSER_VISUAL_PASS manager " + width + "x" + height);
  } finally {
    await context.close();
  }

  const cashierContext = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const cashier = await cashierContext.newPage();
  try {
    await installMockTransport(cashier);
    await cashier.goto(base + "/app", { waitUntil: "networkidle" });
    await signIn(cashier, "cashier@synthetic.invalid", "synthetic-only");
    assert.equal(await cashier.locator("#menuWriteControls").evaluate(el => el.classList.contains("hidden")), true);
    assert.equal(await cashier.locator("#closeDay").isDisabled(), true);
    assert.equal(await cashier.locator("#voidControls").isVisible(), false);
    assert.equal(await cashier.locator("#voidHistorySection").isVisible(), false);
    assert.equal(await cashier.locator("#hqNav").isVisible(), false);
    assert.equal(await cashier.locator("#importLineagePanel").isVisible(), false);
    assert.equal(await cashier.locator("#hqSourcesRefresh").isVisible(), false);
    assert.equal(await cashier.locator("#menuCatalog .menu-item-button").first().isEnabled(), true);
    await snapshot(cashier, width, "cashier");
    console.log("BROWSER_VISUAL_PASS cashier " + width + "x" + height);
  } finally {
    await cashierContext.close();
  }
}

await mkdir(BASE_DIR, { recursive: true });
const server = createVercelShapePreviewServer({
  root: process.cwd(),
  env: {
    SUPABASE_URL: "https://synthetic.supabase.invalid",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_visual_fixture"
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await runViewport(browser, 390, 844, base);
  state.paid = false; state.closed = false; state.closeWrites = 0; state.voidWrites = 0; state.loseVoidAck = false;
  await runViewport(browser, 1200, 800, base);
  console.log("CAFEOS_VISUAL_QA_PASS: 390px and 1200px; synthetic transport only");
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, "close");
}
