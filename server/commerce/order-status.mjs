import { AppHttpError, appContext, appError, appJson, onlyGet, supabaseJson } from "../../api/_app-auth.mjs";
import { requiredUuid } from "./_shared.mjs";

// A read-only, authenticated status check to resolve ambiguous payment responses.
export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const url = new URL(req.url ?? "/", "https://cafeos.local");
    const orderId = requiredUuid(url.searchParams.get("orderId"), "COMMERCE_ORDER_INVALID", "Invalid Order");
    const params = new URLSearchParams({
      select: "id,store_id,status,total",
      tenant_id: "eq." + ctx.tenant.id,
      id: "eq." + orderId,
      limit: "1"
    });
    const rows = await supabaseJson("/rest/v1/pos_orders?" + params, {
      token: ctx.token, ...deps
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) throw new AppHttpError(404, "COMMERCE_ORDER_NOT_FOUND", "Order not found in tenant");
    if (row.id !== orderId || !["open", "paid", "voided"].includes(row.status)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid order state");
    }
    return appJson(res, 200, {
      tenant: ctx.tenant,
      order: { id: row.id, storeId: row.store_id, status: row.status, total: row.total }
    });
  } catch (error) {
    return appError(res, error);
  }
}
export default async function handler(req, res) {
  return handle(req, res);
}
