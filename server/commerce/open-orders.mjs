import {
  AppHttpError, appContext, appError, appJson,
  onlyGet, requireCommerceWriteRole, supabaseJson
} from "../../api/_app-auth.mjs";
import { requiredUuid } from "./_shared.mjs";

// Browse only currently-open first-party POS orders for manual checkout recovery.
// No payment or state mutation is performed on this endpoint.
export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = requireCommerceWriteRole(await appContext(req, deps));
    const url = new URL(req.url ?? "/", "https://cafeos.local");
    const storeId = requiredUuid(
      url.searchParams.get("storeId"), "COMMERCE_STORE_INVALID", "Invalid Store"
    );
    const requestedOffset = url.searchParams.get("offset") ?? "0";
    if (!/^(0|[1-9][0-9]{0,4})$/.test(requestedOffset) || Number(requestedOffset) > 10000) {
      throw new AppHttpError(400, "COMMERCE_OPEN_ORDERS_OFFSET_INVALID", "Invalid open-orders offset");
    }
    const offset = Number(requestedOffset);
    const params = new URLSearchParams({
      select: "id,order_number,store_id,status,total,created_at,channel",
      tenant_id: "eq." + ctx.tenant.id,
      store_id: "eq." + storeId,
      status: "eq.open",
      order: "created_at.desc,id.desc",
      limit: "21",
      offset: String(offset)
    });
    const payload = await supabaseJson("/rest/v1/pos_orders?" + params, {
      token: ctx.token, ...deps
    });
    if (!Array.isArray(payload)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Open order service returned an error");
    }
    const hasMore = payload.length > 20;
    const orders = payload.slice(0, 20).map(row => {
      if (!row?.id || row.store_id !== storeId || row.status !== "open") {
        throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Open order service returned invalid data");
      }
      return {
        id: row.id,
        orderNumber: row.order_number,
        storeId: row.store_id,
        status: row.status,
        total: row.total,
        createdAt: row.created_at,
        channel: row.channel
      };
    });
    return appJson(res, 200, {
      tenant: ctx.tenant,
      orders,
      nextOffset: hasMore ? offset + 20 : null
    });
  } catch (error) {
    return appError(res, error);
  }
}
export default async function handler(req, res) { return handle(req, res); }
