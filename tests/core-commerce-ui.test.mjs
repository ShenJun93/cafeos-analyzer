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
  assert.doesNotMatch(
    html,
    /const orderBody = \{[\s\S]*?(?:price|subtotal|total)\s*:/i
  );
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
