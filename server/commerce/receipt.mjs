import {
  AppHttpError, appContext, appError, appJson, onlyGet,
  requireCommerceWriteRole, supabaseJson
} from "../../api/_app-auth.mjs";
import { requiredUuid } from "./_shared.mjs";

// PostgREST may encode SQL NUMERIC as a JSON number or decimal string.
// Compare exact integer cents, never IEEE-754 products or rounded displays.
// Values beyond safe JSON precision fail closed instead of misprinting.
function receiptCents(value) {
  if ((typeof value !== "string" && typeof value !== "number")
      || (typeof value === "number"
        && (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER / 100))) return null;
  const match = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,2}))?$/.exec(String(value));
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

// PostgreSQL numeric(12,3) quantities are exact to one-thousandth.
// The generated numeric(18,2) line_total rounds positive half-cent ties up.
function receiptQuantityMilli(value) {
  if ((typeof value !== "string" && typeof value !== "number")
      || (typeof value === "number" && !Number.isFinite(value))) return null;
  const match = /^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,3}))?$/.exec(String(value));
  if (!match) return null;
  const milli = BigInt(match[1]) * 1000n
    + BigInt((match[2] ?? "").padEnd(3, "0"));
  return milli > 0n ? milli : null;
}

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
      select: "id,store_id,order_number,channel,business_date,status,subtotal,discount_total,tax_total,total,paid_at",
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
        || !payments[0].paid_at || payments[0].paid_at !== order.paid_at
        || !Array.isArray(stores) || stores.length !== 1
        || stores[0].id !== storeId || !stores[0].name
        || !order.order_number || order.total == null || !order.paid_at) {
      throw new AppHttpError(502, "COMMERCE_RECEIPT_INCOMPLETE", "Server receipt is incomplete");
    }

    const subtotal = receiptCents(order.subtotal);
    const discount = receiptCents(order.discount_total);
    const tax = receiptCents(order.tax_total);
    const total = receiptCents(order.total);
    const paymentAmount = receiptCents(payments[0].amount);
    let itemsSubtotal = 0n;
    for (const line of lines) {
      const lineAmount = receiptCents(line.line_total);
      const unitPrice = receiptCents(line.unit_price);
      const quantityMilli = receiptQuantityMilli(line.quantity);
      // PostgreSQL stores the generated unit_price * quantity as numeric(18,2).
      // Keep positive half-cent rounding exact; never trust a partial receipt.
      const calculatedLineCents = unitPrice === null || quantityMilli === null
        ? null : (unitPrice * quantityMilli + 500n) / 1000n;
      if (lineAmount === null || calculatedLineCents === null
          || calculatedLineCents !== lineAmount) {
        throw new AppHttpError(502, "COMMERCE_RECEIPT_TOTAL_MISMATCH",
          "Receipt line has invalid financial data");
      }
      itemsSubtotal += lineAmount;
    }
    if ([subtotal, discount, tax, total, paymentAmount].some(value => value === null)
        || itemsSubtotal !== subtotal
        || total !== subtotal - discount + tax
        || paymentAmount !== total) {
      throw new AppHttpError(502, "COMMERCE_RECEIPT_TOTAL_MISMATCH",
        "Receipt totals do not reconcile");
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
        subtotal: order.subtotal,
        discountTotal: order.discount_total,
        taxTotal: order.tax_total,
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
