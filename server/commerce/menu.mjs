import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  requestJsonObject,
  requireCommerceManagerRole,
  supabaseJson
} from "../../api/_app-auth.mjs";
import { UUID_RE, requiredUuid, strictFields, parseCommerceMoney, commerceReturnedCents } from "./_shared.mjs";

const CATEGORY_FIELDS = new Set(["kind", "name", "sortOrder"]);
const CATEGORY_UPDATE_FIELDS = new Set(["kind", "categoryId", "name", "sortOrder", "active"]);
const ITEM_FIELDS = new Set(["kind", "categoryId", "sku", "name", "price"]);
const ITEM_UPDATE_FIELDS = new Set(["kind", "itemId", "categoryId", "sku", "name", "price", "active"]);

// PostgreSQL returns category sort_order as int4 and optional item SKU as
// text/null. These are exposed to the cashier's category filter and SKU
// search: do not allow malformed read models to silently reach the POS UI.
function validReadCategorySort(value) {
  return typeof value === "number" && Number.isInteger(value)
    && value >= -2147483648 && value <= 2147483647;
}

function validReadSku(value) {
  return value === null
    || (typeof value === "string" && value.trim().length >= 1
      && value.trim().length <= 100);
}

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
function updatedCategoryBody(body) {
  strictFields(body, CATEGORY_UPDATE_FIELDS);
  const id = requiredUuid(body.categoryId, "MENU_CATEGORY_ID_INVALID", "Invalid Menu category");
  const insert = categoryBody({ kind: "category", name: body.name,
    sortOrder: body.sortOrder }, null);
  if (typeof body.active !== "boolean") {
    throw new AppHttpError(400, "MENU_CATEGORY_ACTIVE_INVALID",
      "Menu category active state must be boolean");
  }
  return { id, data: {
    name: insert.name, sort_order: insert.sort_order, active: body.active
  } };
}

function confirmedUpdatedCategory(rows, expected, tenantId, id) {
  if (!Array.isArray(rows) || rows.length !== 1) return false;
  const row = rows[0];
  return !!row && typeof row === "object" && !Array.isArray(row)
    && row.id === id && row.tenant_id === tenantId
    && row.name === expected.name && row.sort_order === expected.sort_order
    && row.active === expected.active;
}

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
  const expectedCategory = requested.category_id === null
    ? null : requested.category_id.toLowerCase();
  const returnedCents = commerceReturnedCents(row?.price);
  if (!row || typeof row !== "object" || Array.isArray(row)
      || typeof row.id !== "string" || !UUID_RE.test(row.id)
      || row.tenant_id !== requested.tenant_id
      || row.name !== requested.name || row.sku !== requested.sku
      || row.category_id !== expectedCategory
      || row.active !== true
      || returnedCents === null
      || returnedCents !== commerceReturnedCents(requested.price)) return null;
  return row;
}

function updatedItemBody(body) {
  strictFields(body, ITEM_UPDATE_FIELDS);
  const id = requiredUuid(body.itemId, "MENU_ITEM_ID_INVALID", "Invalid Menu item");
  const data = itemBody({
    kind: "item", name: body.name, sku: body.sku,
    categoryId: body.categoryId, price: body.price
  }, null);
  if (typeof body.active !== "boolean") {
    throw new AppHttpError(400, "MENU_ITEM_ACTIVE_INVALID", "Menu item active state must be boolean");
  }
  // Only update columns granted to authenticated managers. Never trust
  // tenant_id, created_at, updated_at or an incoming order price snapshot.
  return { id, data: {
    category_id: data.category_id, sku: data.sku, name: data.name,
    price: data.price, active: body.active
  } };
}

function confirmedUpdatedItem(rows, expected, tenantId, id) {
  if (!Array.isArray(rows) || rows.length !== 1) return false;
  const row = rows[0];
  return !!row && typeof row === "object" && !Array.isArray(row)
    && row.id === id && row.tenant_id === tenantId
    && row.category_id === expected.category_id
    && row.sku === expected.sku && row.name === expected.name
    && row.active === expected.active
    && commerceReturnedCents(row.price) !== null
    && commerceReturnedCents(row.price) === commerceReturnedCents(expected.price);
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
      const url = new URL(req.url ?? "/api/app/commerce-menu", "http://localhost");
      const includeInactive = url.searchParams.get("includeInactive");
      if (includeInactive !== null && includeInactive !== "true") {
        throw new AppHttpError(400, "MENU_READ_OPTION_INVALID", "Invalid Menu read option");
      }
      if (includeInactive === "true") requireCommerceManagerRole(ctx);
      const categoryParams = new URLSearchParams({
        select: "id,tenant_id,name,sort_order,active,created_at,updated_at",
        tenant_id: "eq." + ctx.tenant.id,
        ...(includeInactive === "true" ? {} : { active: "eq.true" }),
        order: "sort_order.asc,name.asc",
        limit: "200"
      });
      const itemParams = new URLSearchParams({
        select: "id,tenant_id,category_id,sku,name,price,active,created_at,updated_at",
        tenant_id: "eq." + ctx.tenant.id,
        ...(includeInactive === "true" ? {} : { active: "eq.true" }),
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
          || !validReadCategorySort(row.sort_order)
          || (includeInactive === "true"
            ? typeof row.active !== "boolean" : row.active !== true))
          || items.some(row => !row || row.tenant_id !== ctx.tenant.id
            || typeof row.id !== "string" || !UUID_RE.test(row.id)
            || (row.category_id !== null
              && (typeof row.category_id !== "string" || !UUID_RE.test(row.category_id)))
            || typeof row.name !== "string" || !row.name.trim() || row.name.length > 300
            || !validReadSku(row.sku)
            || (includeInactive === "true"
              ? typeof row.active !== "boolean" : row.active !== true)
            || !validReadPrice(row.price))
          || new Set(categories.map(row => row.id)).size !== categories.length
          || new Set(items.map(row => row.id)).size !== items.length) {
        throw new AppHttpError(502, "COMMERCE_MENU_UPSTREAM_INVALID",
          "Menu data service returned an invalid catalog");
      }
      return appJson(res, 200, {
        tenant: ctx.tenant, categories, items
      });
    }

    if (req.method === "PATCH") {
      const ctx = requireCommerceManagerRole(await appContext(req, deps));
      const body = requestJsonObject(req);
      if (body.kind === "category") {
        const { id, data } = updatedCategoryBody(body);
        const params = new URLSearchParams({
          tenant_id: "eq." + ctx.tenant.id,
          id: "eq." + id,
          select: "id,tenant_id,name,sort_order,active,created_at,updated_at"
        });
        const rows = await supabaseJson("/rest/v1/menu_categories?" + params, {
          token: ctx.token, method: "PATCH", body: data,
          headers: { Prefer: "return=representation" }, ...deps
        });
        if (Array.isArray(rows) && rows.length === 0) {
          throw new AppHttpError(404, "MENU_CATEGORY_NOT_FOUND",
            "Menu category was not found in this tenant");
        }
        if (!confirmedUpdatedCategory(rows, data, ctx.tenant.id, id)) {
          throw new AppHttpError(502, "COMMERCE_MENU_WRITE_UNCONFIRMED",
            "Category update has uncertain commit evidence; inspect Menu before retry");
        }
        return appJson(res, 200, { tenant: ctx.tenant, category: rows[0] });
      }
      if (body.kind !== "item") {
        throw new AppHttpError(400, "MENU_KIND_INVALID", "Menu update kind must be category or item");
      }
      const { id, data } = updatedItemBody(body);
      const params = new URLSearchParams({
        tenant_id: "eq." + ctx.tenant.id,
        id: "eq." + id,
        select: "id,tenant_id,category_id,sku,name,price,active,created_at,updated_at"
      });
      const rows = await supabaseJson("/rest/v1/menu_items?" + params, {
        token: ctx.token, method: "PATCH", body: data,
        headers: { Prefer: "return=representation" }, ...deps
      });
      if (Array.isArray(rows) && rows.length === 0) {
        throw new AppHttpError(404, "MENU_ITEM_NOT_FOUND", "Menu item was not found in this tenant");
      }
      if (!confirmedUpdatedItem(rows, data, ctx.tenant.id, id)) {
        throw new AppHttpError(502, "COMMERCE_MENU_WRITE_UNCONFIRMED",
          "Menu update has uncertain commit evidence; inspect Menu before retry");
      }
      return appJson(res, 200, { tenant: ctx.tenant, item: rows[0] });
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

    res.setHeader("allow", "GET, POST, PATCH");
    return appJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
