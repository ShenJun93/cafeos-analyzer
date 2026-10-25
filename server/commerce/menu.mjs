import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  requestJsonObject,
  requireCommerceManagerRole,
  supabaseJson
} from "../../api/_app-auth.mjs";
import { UUID_RE, strictFields } from "./_shared.mjs";

const CATEGORY_FIELDS = new Set(["kind", "name", "sortOrder"]);
const ITEM_FIELDS = new Set(["kind", "categoryId", "sku", "name", "price"]);

function boundedText(value, { code, message, max, nullable = false } = {}) {
  if (nullable && (value === undefined || value === null || String(value).trim() === "")) return null;
  const text = String(value ?? "").trim();
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
  const sortOrder = body.sortOrder === undefined ? 0 : Number(body.sortOrder);
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 100000) {
    throw new AppHttpError(400, "MENU_CATEGORY_SORT_INVALID", "Category sort order is invalid");
  }
  return { tenant_id: tenantId, name, sort_order: sortOrder, active: true };
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
    : String(body.categoryId).trim();
  if (categoryId !== null && !UUID_RE.test(categoryId)) {
    throw new AppHttpError(400, "MENU_CATEGORY_INVALID", "Invalid Menu category");
  }
  const sku = boundedText(body.sku, {
    code: "MENU_ITEM_SKU_INVALID",
    message: "Menu item SKU is invalid",
    max: 100,
    nullable: true
  });
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 1000000000 || Math.round(price * 100) !== price * 100) {
    throw new AppHttpError(400, "MENU_ITEM_PRICE_INVALID", "Menu item price is invalid");
  }
  return { tenant_id: tenantId, category_id: categoryId, sku, name, price, active: true };
}

export async function handle(req, res, deps = {}) {
  try {
    if (req.method === "GET") {
      const ctx = await appContext(req, deps);
      const categoryParams = new URLSearchParams({
        select: "id,name,sort_order,active,created_at,updated_at",
        tenant_id: "eq." + ctx.tenant.id,
        active: "eq.true",
        order: "sort_order.asc,name.asc",
        limit: "200"
      });
      const itemParams = new URLSearchParams({
        select: "id,category_id,sku,name,price,active,created_at,updated_at",
        tenant_id: "eq." + ctx.tenant.id,
        active: "eq.true",
        order: "name.asc",
        limit: "1000"
      });
      const [categories, items] = await Promise.all([
        supabaseJson("/rest/v1/menu_categories?" + categoryParams, { token: ctx.token, ...deps }),
        supabaseJson("/rest/v1/menu_items?" + itemParams, { token: ctx.token, ...deps })
      ]);
      return appJson(res, 200, {
        tenant: ctx.tenant,
        categories: Array.isArray(categories) ? categories : [],
        items: Array.isArray(items) ? items : []
      });
    }

    if (req.method === "POST") {
      const ctx = requireCommerceManagerRole(await appContext(req, deps));
      const body = requestJsonObject(req);
      const kind = String(body.kind ?? "").trim();
      if (kind === "category") {
        const insert = categoryBody(body, ctx.tenant.id);
        const params = new URLSearchParams({
          select: "id,name,sort_order,active,created_at,updated_at"
        });
        const rows = await supabaseJson("/rest/v1/menu_categories?" + params, {
          token: ctx.token,
          method: "POST",
          body: insert,
          headers: { Prefer: "return=representation" },
          ...deps
        });
        const category = Array.isArray(rows) ? rows[0] : null;
        if (!category?.id) throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Menu service returned an error");
        return appJson(res, 201, { tenant: ctx.tenant, category });
      }
      if (kind === "item") {
        const insert = itemBody(body, ctx.tenant.id);
        const params = new URLSearchParams({
          select: "id,category_id,sku,name,price,active,created_at,updated_at"
        });
        const rows = await supabaseJson("/rest/v1/menu_items?" + params, {
          token: ctx.token,
          method: "POST",
          body: insert,
          headers: { Prefer: "return=representation" },
          ...deps
        });
        const item = Array.isArray(rows) ? rows[0] : null;
        if (!item?.id) throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Menu service returned an error");
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
