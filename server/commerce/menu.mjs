import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  requestJsonObject,
  requireCommerceManagerRole,
  supabaseJson
} from "../../api/_app-auth.mjs";
import { UUID_RE, strictFields, parseCommerceMoney, commerceReturnedCents } from "./_shared.mjs";

const CATEGORY_FIELDS = new Set(["kind", "name", "sortOrder"]);
const ITEM_FIELDS = new Set(["kind", "categoryId", "sku", "name", "price"]);

function validReadPrice(value) {
  if ((typeof value !== "number" && typeof value !== "string")
      || (typeof value === "number" && !Number.isFinite(value))) return false;
  // Same two-decimal, bounded financial contract as the manager's Menu write.
  const raw = String(value);
  return /^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$/.test(raw)
    && Number(raw) <= 1000000000;
}

function boundedText(value, { code, message, max, nullable = false } = {}) {
  if (nullable && (value === undefined || value === null || value === "")) return null;
  // Menu labels and identifiers are strings, not JS-coerced arrays/booleans.
  if (typeof value !== "string") throw new AppHttpError(400, code, message);
  const text = value.trim();
  if (!text || text.length > max) throw new AppHttpError(400, code, message);
  return text;
}

function categoryBody(body, tenantId) {
  strictFields(body, CATEGORY_FIELDS);
  const name = boundedText(body.name, {
    code: "MENU_CATEGORY_NAME_INVALID",
    message: "Category name is invalid",
    max: 200
  });
  const sortOrder = body.sortOrder === undefined ? 0 : body.sortOrder;
  if (typeof sortOrder !== "number" || !Number.isSafeInteger(sortOrder)
      || Math.abs(sortOrder) > 100000) {
    throw new AppHttpError(400, "MENU_CATEGORY_SORT_INVALID", "Category sort order is invalid");
  }
  return { tenant_id: tenantId, name, sort_order: sortOrder, active: true };
}

// A successful HTTP POST is not proof that the returned row is the one
// requested. Return 502 on a mismatched acknowledgment: the insert might
// already have committed, so clients must inspect Menu rather than retry.
function confirmedMenuCategory(rows, requested) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)
      || typeof row.id !== "string" || !UUID_RE.test(row.id)
      || row.tenant_id !== requested.tenant_id
      || row.name !== requested.name
      || row.sort_order !== requested.sort_order
      || row.active !== true) return null;
  return row;
}

function confirmedMenuItem(rows, requested) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)
      || typeof row.id !== "string" || !UUID_RE.test(row.id)
      || row.tenant_id !== requested.tenant_id
      || row.name !== requested.name || row.sku !== requested.sku
      || row.category_id !== requested.category_id?.toLowerCase() && !(row.category_id === null && requested.category_id === null)
      || row.active !== true
      || commerceReturnedCents(row.price) === null
      || commerceReturnedCents(row.price) !== commerceReturnedCents(requested.price)) return null;
  return row;
}

function itemBody(body, tenantId) {
  strictFields(body, ITEM_FIELDS);
  const name = boundedText(body.name, {
    code: "MENU_ITEM_NAME_INVALID",
    message: "Menu item name is invalid",
    max: 300
  });
  const categoryId = body.categoryId === undefined || body.categoryId === null || body.categoryId === ""
    ? null
    : body.categoryId;
  if (categoryId !== null && (typeof categoryId !== "string" || !UUID_RE.test(categoryId))) {
    throw new AppHttpError(400, "MENU_CATEGORY_INVALID", "Invalid Menu category");
  }
  const sku = boundedText(body.sku, {
    code: "MENU_ITEM_SKU_INVALID",
    message: "Menu item SKU is invalid",
    max: 100,
    nullable: true
  });
  const price = parseCommerceMoney(body.price, {
    code: "MENU_ITEM_PRICE_INVALID",
    message: "Menu item price is invalid",
    max: 1000000000,
    allowZero: true
  });
  return { tenant_id: tenantId, category_id: categoryId, sku, name, price, active: true };
}

export async function handle(req, res, deps = {}) {
  try {
    if (req.method === "GET") {
      const ctx = await appContext(req, deps);
      const categoryParams = new URLSearchParams({
        select: "id,tenant_id,name,sort_order,active,created_at,updated_at",
        tenant_id: "eq." + ctx.tenant.id,
        active: "eq.true",
        order: "sort_order.asc,name.asc",
        limit: "200"
      });
      const itemParams = new URLSearchParams({
        select: "id,tenant_id,category_id,sku,name,price,active,created_at,updated_at",
        tenant_id: "eq." + ctx.tenant.id,
        active: "eq.true",
        order: "name.asc",
        limit: "1000"
      });
      const [categories, items] = await Promise.all([
        supabaseJson("/rest/v1/menu_categories?" + categoryParams, { token: ctx.token, ...deps }),
        supabaseJson("/rest/v1/menu_items?" + itemParams, { token: ctx.token, ...deps })
      ]);
      // A broken read-model is NOT an empty Menu. A truncated Menu is also
      // unsafe for cashiers: it can silently hide sellable items/categories.
      // Supabase Data API can impose a project-level max_rows cap, so reject
      // the boundary itself rather than assuming a full page was returned.
      if (!Array.isArray(categories) || !Array.isArray(items)) {
        throw new AppHttpError(502, "COMMERCE_MENU_UPSTREAM_INVALID",
          "Menu data service returned an invalid catalog");
      }
      if (categories.length >= 200 || items.length >= 1000) {
        throw new AppHttpError(503, "COMMERCE_MENU_CATALOG_LIMIT",
          "Menu exceeds the current supported catalog size");
      }
      if (categories.some(row => !row || row.tenant_id !== ctx.tenant.id
          || typeof row.id !== "string" || !UUID_RE.test(row.id)
          || typeof row.name !== "string" || !row.name.trim() || row.name.length > 200
          || row.active !== true)
          || items.some(row => !row || row.tenant_id !== ctx.tenant.id
            || typeof row.id !== "string" || !UUID_RE.test(row.id)
            || (row.category_id !== null
              && (typeof row.category_id !== "string" || !UUID_RE.test(row.category_id)))
            || typeof row.name !== "string" || !row.name.trim() || row.name.length > 300
            || row.active !== true || !validReadPrice(row.price))
          || new Set(categories.map(row => row.id)).size !== categories.length
          || new Set(items.map(row => row.id)).size !== items.length) {
        throw new AppHttpError(502, "COMMERCE_MENU_UPSTREAM_INVALID",
          "Menu data service returned an invalid catalog");
      }
      return appJson(res, 200, {
        tenant: ctx.tenant, categories, items
      });
    }

    if (req.method === "POST") {
      const ctx = requireCommerceManagerRole(await appContext(req, deps));
      const body = requestJsonObject(req);
      const kind = typeof body.kind === "string" ? body.kind.trim() : "";
      if (kind === "category") {
        const insert = categoryBody(body, ctx.tenant.id);
        const params = new URLSearchParams({
          select: "id,tenant_id,name,sort_order,active,created_at,updated_at"
        });
        const rows = await supabaseJson("/rest/v1/menu_categories?" + params, {
          token: ctx.token,
          method: "POST",
          body: insert,
          headers: { Prefer: "return=representation" },
          ...deps
        });
        const category = confirmedMenuCategory(rows, insert);
        if (!category) throw new AppHttpError(502, "COMMERCE_MENU_WRITE_UNCONFIRMED",
          "Menu category write has inconsistent commit evidence; inspect Menu before retry");
        return appJson(res, 201, { tenant: ctx.tenant, category });
      }
      if (kind === "item") {
        const insert = itemBody(body, ctx.tenant.id);
        const params = new URLSearchParams({
          select: "id,tenant_id,category_id,sku,name,price,active,created_at,updated_at"
        });
        const rows = await supabaseJson("/rest/v1/menu_items?" + params, {
          token: ctx.token,
          method: "POST",
          body: insert,
          headers: { Prefer: "return=representation" },
          ...deps
        });
        const item = confirmedMenuItem(rows, insert);
        if (!item) throw new AppHttpError(502, "COMMERCE_MENU_WRITE_UNCONFIRMED",
          "Menu item write has inconsistent commit evidence; inspect Menu before retry");
        return appJson(res, 201, { tenant: ctx.tenant, item });
      }
      throw new AppHttpError(400, "MENU_KIND_INVALID", "Menu write kind must be category or item");
    }

    res.setHeader("allow", "GET, POST");
    return appJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
