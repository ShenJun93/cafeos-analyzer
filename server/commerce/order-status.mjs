import { AppHttpError, appContext, appError, appJson, onlyGet, requireCommerceWriteRole, supabaseJson } from "../../api/_app-auth.mjs";
import { requiredUuid, UUID_RE, commerceReturnedCents } from "./_shared.mjs";

// Read-only payment/checkout recovery for the same bounded commerce roles
// permitted to browse open orders. Dashboard-only roles must not recover POS.
export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = requireCommerceWriteRole(await appContext(req, deps));
    const url = new URL(req.url ?? "/", "https://cafeos.local");
    const orderId = requiredUuid(url.searchParams.get("orderId"), "COMMERCE_ORDER_INVALID", "Invalid Order");
    const params = new URLSearchParams({
      select: "id,tenant_id,store_id,status,total",
      tenant_id: "eq." + ctx.tenant.id,
      id: "eq." + orderId,
      limit: "1"
    });
    const rows = await supabaseJson("/rest/v1/pos_orders?" + params, {
      token: ctx.token, ...deps
    });
    if (!Array.isArray(rows) || rows.length > 1) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid order status response");
    }
    const row = rows[0];
    if (!row) throw new AppHttpError(404, "COMMERCE_ORDER_NOT_FOUND", "Order not found in tenant");
    if (row.id !== orderId || row.tenant_id !== ctx.tenant.id
        || typeof row.store_id !== "string"
        || !UUID_RE.test(row.store_id)
        || !["open", "paid", "voided"].includes(row.status)
        || (commerceReturnedCents(row.total) ?? 0n) <= 0n) {
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
