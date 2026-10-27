import {
  AppHttpError, appContext, appError, appJson, onlyGet,
  requireCommerceWriteRole, supabaseJson
} from "../../api/_app-auth.mjs";
import { requiredUuid } from "./_shared.mjs";

// Read-only paid receipt from immutable server-owned order-item price snapshots.
// Requires the caller's actual Tenant+Store and never accepts client totals.
export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = requireCommerceWriteRole(await appContext(req, deps));
    const url = new URL(req.url ?? "/", "https://cafeos.local");
    const orderId = requiredUuid(
      url.searchParams.get("orderId"), "COMMERCE_ORDER_INVALID", "Invalid Order"
    );
    const storeId = requiredUuid(
      url.searchParams.get("storeId"), "COMMERCE_STORE_INVALID", "Invalid Store"
    );
    const orderParams = new URLSearchParams({
      select: "id,store_id,order_number,channel,business_date,status,total,paid_at",
      tenant_id: "eq." + ctx.tenant.id,
      store_id: "eq." + storeId,
      id: "eq." + orderId,
      limit: "1"
    });
    const orders = await supabaseJson("/rest/v1/pos_orders?" + orderParams, {
      token: ctx.token, ...deps
    });
    if (!Array.isArray(orders)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid receipt source");
    }
    const order = orders[0];
    if (!order) {
      throw new AppHttpError(404, "COMMERCE_ORDER_NOT_FOUND", "Order not found in selected Store");
    }
    if (order.id !== orderId || order.store_id !== storeId) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid receipt order");
    }
    if (order.status !== "paid") {
      throw new AppHttpError(409, "COMMERCE_RECEIPT_NOT_PAID", "Only paid orders have a receipt");
    }

    const lineParams = new URLSearchParams({
      select: "id,order_id,item_name,unit_price,quantity,line_total",
      tenant_id: "eq." + ctx.tenant.id,
      order_id: "eq." + orderId,
      order: "created_at.asc,id.asc",
      limit: "101"
    });
    const paymentParams = new URLSearchParams({
      select: "order_id,method,amount,status,paid_at",
      tenant_id: "eq." + ctx.tenant.id,
      order_id: "eq." + orderId,
      status: "eq.captured",
      limit: "2"
    });
    const storeParams = new URLSearchParams({
      select: "id,name",
      tenant_id: "eq." + ctx.tenant.id,
      id: "eq." + storeId,
      limit: "1"
    });
    const [lines, payments, stores] = await Promise.all([
      supabaseJson("/rest/v1/pos_order_items?" + lineParams, { token: ctx.token, ...deps }),
      supabaseJson("/rest/v1/pos_payments?" + paymentParams, { token: ctx.token, ...deps }),
      supabaseJson("/rest/v1/stores?" + storeParams, { token: ctx.token, ...deps })
    ]);
    // Fail closed: never print partial receipts or rely on the browser's cart.
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100
        || lines.some(line => line.order_id !== orderId || !line.id || !line.item_name
          || line.unit_price == null || line.quantity == null || line.line_total == null)
        || !Array.isArray(payments) || payments.length !== 1
        || payments[0].order_id !== orderId || payments[0].status !== "captured"
        || payments[0].amount == null || !payments[0].method
        || !Array.isArray(stores) || stores.length !== 1
        || stores[0].id !== storeId || !stores[0].name
        || !order.order_number || order.total == null || !order.paid_at) {
      throw new AppHttpError(502, "COMMERCE_RECEIPT_INCOMPLETE", "Server receipt is incomplete");
    }

    return appJson(res, 200, {
      tenant: ctx.tenant,
      receipt: {
        orderId, storeId, storeName: stores[0].name,
        orderNumber: order.order_number,
        channel: order.channel,
        businessDate: order.business_date,
        paidAt: order.paid_at,
        status: "paid",
        total: order.total,
        items: lines.map(line => ({
          name: line.item_name,
          quantity: line.quantity,
          unitPrice: line.unit_price,
          lineTotal: line.line_total
        })),
        payment: {
          method: payments[0].method,
          amount: payments[0].amount,
          paidAt: payments[0].paid_at
        }
      }
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
