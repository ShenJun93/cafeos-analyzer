import {
  AppHttpError, appContext, appError, appJson,
  onlyGet, requireCommerceWriteRole, supabaseJson
} from "../../api/_app-auth.mjs";
import { requiredUuid, validCommerceOrderListRow } from "./_shared.mjs";

// Browse settled first-party orders for receipt lookup/reprint. The list is
// metadata only: the full receipt is separately verified as PAID per Store.
export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = requireCommerceWriteRole(await appContext(req, deps));
    const url = new URL(req.url ?? "/", "https://cafeos.local");
    const storeId = requiredUuid(
      url.searchParams.get("storeId"), "COMMERCE_STORE_INVALID", "Invalid Store"
    );
    const requestedOffset = url.searchParams.get("offset") ?? "0";
    if (!/^(0|[1-9][0-9]{0,4})$/.test(requestedOffset)
        || Number(requestedOffset) > 10000) {
      throw new AppHttpError(400, "COMMERCE_PAID_ORDERS_OFFSET_INVALID",
        "Invalid paid-orders offset");
    }
    const offset = Number(requestedOffset);
    const params = new URLSearchParams({
      select: "id,tenant_id,order_number,store_id,status,total,paid_at,business_date",
      tenant_id: "eq." + ctx.tenant.id,
      store_id: "eq." + storeId,
      status: "eq.paid",
      order: "paid_at.desc,id.desc",
      limit: "21",
      offset: String(offset)
    });
    const rows = await supabaseJson("/rest/v1/pos_orders?" + params, {
      token: ctx.token, ...deps
    });
    const valid = Array.isArray(rows) && rows.length <= 21
      && rows.every(row => validCommerceOrderListRow(
        row, { tenantId: ctx.tenant.id, storeId, status: "paid" }
      ));
    if (!valid || new Set(rows.map(row => row.id)).size !== rows.length) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Paid order service returned invalid data");
    }
    const orders = rows.slice(0, 20).map(row => {
      return {
        id: row.id, orderNumber: row.order_number,
        storeId: row.store_id, status: row.status, total: row.total,
        paidAt: row.paid_at, businessDate: row.business_date
      };
    });
    return appJson(res, 200, {
      tenant: ctx.tenant,
      orders,
      nextOffset: rows.length > 20 ? offset + 20 : null
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
