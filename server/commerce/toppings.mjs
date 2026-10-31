import {
  AppHttpError, appContext, appError, appJson, requestJsonObject,
  requireCommerceManagerRole, supabaseJson
} from "../../api/_app-auth.mjs";
import {
  UUID_RE, requiredUuid, strictFields, parseCommerceMoney, commerceReturnedCents
} from "./_shared.mjs";

const CREATE_FIELDS = new Set(["menuItemId", "name", "price", "sortOrder"]);
const UPDATE_FIELDS = new Set(["toppingId", "name", "price", "sortOrder", "active"]);
const SELECT = "id,tenant_id,menu_item_id,name,price,sort_order,active,created_at,updated_at";
function toppingName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw new AppHttpError(400, "TOPPING_NAME_INVALID", "Topping name is invalid");
  }
  return value.trim();
}
function sortOrder(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)
      || Math.abs(value) > 100000) {
    throw new AppHttpError(400, "TOPPING_SORT_INVALID", "Topping sort is invalid");
  }
  return value;
}
function toppingPrice(value) {
  return parseCommerceMoney(value, {
    code: "TOPPING_PRICE_INVALID", message: "Topping price is invalid",
    max: 1000000, allowZero: true
  });
}
function readValid(row, tenantId, inactive) {
  return row && typeof row === "object" && !Array.isArray(row)
    && row.tenant_id === tenantId
    && typeof row.id === "string" && UUID_RE.test(row.id)
    && typeof row.menu_item_id === "string" && UUID_RE.test(row.menu_item_id)
    && typeof row.name === "string" && row.name.trim() === row.name
    && row.name.length >= 1 && row.name.length <= 100
    && typeof row.sort_order === "number" && Number.isInteger(row.sort_order)
    && Math.abs(row.sort_order) <= 100000
    && (inactive ? typeof row.active === "boolean" : row.active === true)
    && commerceReturnedCents(row.price) !== null
    && commerceReturnedCents(row.price) <= 100000000n;
}
function confirmed(rows, expected, tenantId, id) {
  return Array.isArray(rows) && rows.length === 1
    && readValid(rows[0], tenantId, true)
    && (id === null ? true : rows[0].id === id)
    && Object.entries(expected).every(([key, value]) => (
      key === "price"
        ? commerceReturnedCents(rows[0].price) === commerceReturnedCents(value)
        : rows[0][key] === value
    ));
}
export async function handle(req, res, deps = {}) {
  try {
    if (req.method === "GET") {
      const ctx = await appContext(req, deps);
      const params = new URLSearchParams(new URL(req.url ?? "/", "http://localhost").search);
      for (const key of params.keys()) {
        if (key !== "includeInactive") {
          throw new AppHttpError(400, "TOPPING_READ_OPTION_INVALID", "Invalid topping read option");
        }
      }
      const raw = params.getAll("includeInactive");
      if (raw.length > 1 || (raw.length === 1 && raw[0] !== "true")) {
        throw new AppHttpError(400, "TOPPING_READ_OPTION_INVALID", "Invalid topping read option");
      }
      const inactive = raw.length === 1;
      if (inactive) requireCommerceManagerRole(ctx);
      const query = new URLSearchParams({
        select: SELECT, tenant_id: "eq." + ctx.tenant.id,
        ...(inactive ? {} : { active: "eq.true" }),
        order: "sort_order.asc,name.asc", limit: "1000"
      });
      const rows = await supabaseJson("/rest/v1/menu_toppings?" + query, {
        token: ctx.token, ...deps
      });
      if (!Array.isArray(rows) || rows.some(r => !readValid(r, ctx.tenant.id, inactive))
          || new Set(rows.map(r => r.id)).size !== rows.length) {
        throw new AppHttpError(502, "TOPPING_READ_UNTRUSTED", "Topping catalog invalid");
      }
      if (rows.length >= 1000) {
        throw new AppHttpError(503, "TOPPING_CATALOG_LIMIT", "Topping catalog exceeds limit");
      }
      return appJson(res, 200, { tenant: ctx.tenant, toppings: rows });
    }
    if (req.method === "POST") {
      const ctx = requireCommerceManagerRole(await appContext(req, deps));
      const body = requestJsonObject(req);
      strictFields(body, CREATE_FIELDS);
      const data = {
        tenant_id: ctx.tenant.id,
        menu_item_id: requiredUuid(body.menuItemId, "TOPPING_ITEM_ID_INVALID", "Invalid Menu item"),
        name: toppingName(body.name),
        price: toppingPrice(body.price),
        sort_order: sortOrder(body.sortOrder ?? 0),
        active: true
      };
      const query = new URLSearchParams({ select: SELECT });
      const rows = await supabaseJson("/rest/v1/menu_toppings?" + query, {
        token: ctx.token, method: "POST", body: data,
        headers: { Prefer: "return=representation" }, ...deps
      });
      if (!confirmed(rows, data, ctx.tenant.id, null)) {
        throw new AppHttpError(502, "TOPPING_WRITE_UNCONFIRMED",
          "Topping creation has uncertain evidence; inspect catalog before retry");
      }
      return appJson(res, 201, { tenant: ctx.tenant, topping: rows[0] });
    }
    if (req.method === "PATCH") {
      const ctx = requireCommerceManagerRole(await appContext(req, deps));
      const body = requestJsonObject(req);
      strictFields(body, UPDATE_FIELDS);
      const id = requiredUuid(body.toppingId, "TOPPING_ID_INVALID", "Invalid topping");
      if (typeof body.active !== "boolean") {
        throw new AppHttpError(400, "TOPPING_ACTIVE_INVALID", "Topping active must be boolean");
      }
      const data = {
        name: toppingName(body.name), price: toppingPrice(body.price),
        sort_order: sortOrder(body.sortOrder), active: body.active
      };
      const query = new URLSearchParams({
        tenant_id: "eq." + ctx.tenant.id, id: "eq." + id, select: SELECT
      });
      const rows = await supabaseJson("/rest/v1/menu_toppings?" + query, {
        token: ctx.token, method: "PATCH", body: data,
        headers: { Prefer: "return=representation" }, ...deps
      });
      if (Array.isArray(rows) && rows.length === 0) {
        throw new AppHttpError(404, "TOPPING_NOT_FOUND", "Topping not found in tenant");
      }
      if (!confirmed(rows, data, ctx.tenant.id, id)) {
        throw new AppHttpError(502, "TOPPING_WRITE_UNCONFIRMED",
          "Topping update has uncertain evidence; inspect catalog before retry");
      }
      return appJson(res, 200, { tenant: ctx.tenant, topping: rows[0] });
    }
    res.setHeader("allow", "GET, POST, PATCH");
    return appJson(res, 405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }
    });
  } catch (error) {
    return appError(res, error);
  }
}
