import test from "node:test";
import assert from "node:assert/strict";
import { handle as menuHandle } from "../server/commerce/menu.mjs";

const TENANT = "10000000-0000-4000-8000-000000000001";
const USER = "a0000000-0000-4000-8000-000000000001";
const CATEGORY = {
  id: "17000000-0000-4000-8000-000000000001",
  tenant_id: TENANT, name: "Coffee", sort_order: 0, active: true
};
const ITEM = {
  id: "15000000-0000-4000-8000-000000000001",
  tenant_id: TENANT, category_id: CATEGORY.id, sku: "LATTE",
  name: "Latte", price: "35000.00", active: true
};

function reply(data, range) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(range === undefined ? {} : { "content-range": range })
    }
  });
}

async function fetchMenu({ categoryRows = [CATEGORY], itemRows = [ITEM],
  categoryRange = "0-0/1", itemRange = "0-0/1" } = {}) {
  const calls = [];
  const fetchImpl = async (resource, options = {}) => {
    const url = new URL(resource);
    const path = url.pathname;
    calls.push({ path, method: options.method ?? "GET" });
    if (path === "/auth/v1/user") return reply({ id: USER });
    if (path === "/rest/v1/tenant_members") {
      return reply([{ tenant_id: TENANT, role: "cashier" }]);
    }
    if (path === "/rest/v1/menu_categories" || path === "/rest/v1/menu_items") {
      assert.equal(options.method ?? "GET", "GET");
      assert.equal(options.headers.prefer, "count=exact");
      assert.equal(options.headers.authorization, "Bearer synthetic-jwt");
      assert.equal(url.searchParams.get("tenant_id"), "eq." + TENANT);
      assert.equal(url.searchParams.get("active"), "eq.true");
      if (path.endsWith("menu_categories")) {
        assert.equal(url.searchParams.get("limit"), "200");
        return reply(categoryRows, categoryRange);
      }
      assert.equal(url.searchParams.get("limit"), "1000");
      return reply(itemRows, itemRange);
    }
    throw new Error("Unexpected synthetic upstream " + path);
  };

  const response = {
    statusCode: 0,
    body: "",
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = "") { this.body = String(value); }
  };
  await menuHandle({
    method: "GET", url: "/api/app/commerce-menu",
    headers: {
      authorization: "Bearer synthetic-jwt",
      "x-cafeos-tenant-id": TENANT
    }
  }, response, {
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic"
    },
    fetchImpl
  });
  return { status: response.statusCode, payload: JSON.parse(response.body), calls };
}

test("Menu reads require exact RLS-scoped counts for categories and items", async () => {
  const valid = await fetchMenu();
  assert.equal(valid.status, 200);
  assert.equal(valid.payload.categories.length, 1);
  assert.equal(valid.payload.items.length, 1);
  assert.equal(valid.calls.filter(c => c.path.startsWith("/rest/v1/menu_")).length, 2);
  assert.ok(valid.calls.every(c => c.method === "GET"),
    "Menu must never write during catalog discovery");

  const empty = await fetchMenu({
    categoryRows: [], itemRows: [], categoryRange: "*/0", itemRange: "*/0"
  });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.payload.categories, []);
  assert.deepEqual(empty.payload.items, []);

  const noCategories = await fetchMenu({ categoryRows: [], categoryRange: "*/0" });
  assert.equal(noCategories.status, 200);
  assert.equal(noCategories.payload.items.length, 1);
});

test("Menu refuses short upstream prefixes and unverifiable counts before publishing any catalog", async () => {
  const cases = [
    ["truncated categories", { categoryRange: "0-0/2" }],
    ["truncated items", { itemRange: "0-0/2" }],
    ["missing categories count", { categoryRange: undefined }],
    ["missing items count", { itemRange: undefined }],
    ["unknown categories count", { categoryRange: "0-0/*" }],
    ["offset categories", { categoryRange: "1-1/1" }],
    ["wrong item endpoint count", { itemRange: "0-1/1" }],
    ["wrong total", { itemRange: "0-0/0" }],
    ["empty with nonzero total", { itemRows: [], itemRange: "*/1" }],
    ["missing empty count", { itemRows: [], itemRange: undefined }],
    ["nonarray category data", { categoryRows: {} }],
    ["nonarray item data", { itemRows: {} }]
  ];
  for (const [label, overrides] of cases) {
    const actual = await fetchMenu(overrides);
    assert.equal(actual.status, 502, label);
    assert.equal(actual.payload.error.code, "COMMERCE_MENU_UPSTREAM_INVALID", label);
    assert.ok(!("items" in actual.payload), label + " must not publish partial Menu");
  }
});

test("Menu rejects catalog totals beyond its supported bounds", async () => {
  for (const [label, overrides] of [
    ["200 category total", { categoryRange: "0-0/200" }],
    ["1000 item total", { itemRange: "0-0/1000" }],
    ["200 materialized categories", {
      categoryRows: Array.from({ length: 200 }, (_, index) => ({
        ...CATEGORY, id: "17000000-0000-4000-8000-" + String(index).padStart(12, "0")
      })),
      categoryRange: "0-199/200"
    }],
    ["1000 materialized items", {
      itemRows: Array.from({ length: 1000 }, (_, index) => ({
        ...ITEM, id: "15000000-0000-4000-8000-" + String(index).padStart(12, "0")
      })),
      itemRange: "0-999/1000"
    }]
  ]) {
    const actual = await fetchMenu(overrides);
    assert.equal(actual.status, 503, label);
    assert.equal(actual.payload.error.code, "COMMERCE_MENU_CATALOG_LIMIT", label);
  }
});
