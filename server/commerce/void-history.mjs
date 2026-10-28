// Read-only manager audit browser and authoritative void reconciliation.
// This never guesses that a lost POST succeeded, never mutates POS facts.
import {
  AppHttpError, appContext, appError, appJson, onlyGet,
  requireCommerceManagerRole, supabaseJson
} from "../../api/_app-auth.mjs";
import {
  requiredUuid, UUID_RE, validCommerceBusinessDate, validCommerceTimestamp
} from "./_shared.mjs";

const SELECT = "tenant_id,order_id,store_id,business_date,reason,voided_by_user_id,voided_at";
const MAX_OFFSET = 10000;

function receipt(row, tenant, store) {
  if (!row || typeof row !== "object" || Array.isArray(row)
      || row.tenant_id !== tenant || row.store_id !== store
      || typeof row.order_id !== "string" || !UUID_RE.test(row.order_id)
      || !validCommerceBusinessDate(row.business_date)
      || typeof row.reason !== "string" || row.reason.trim() !== row.reason
      || row.reason.length < 5 || row.reason.length > 240
      || typeof row.voided_by_user_id !== "string" || !UUID_RE.test(row.voided_by_user_id)
      || !validCommerceTimestamp(row.voided_at)) {
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid void audit evidence");
  }
  return {
    orderId: row.order_id, storeId: row.store_id, businessDate: row.business_date,
    reason: row.reason, voidedByUserId: row.voided_by_user_id, voidedAt: row.voided_at
  };
}

function queryRows(tenant, store, extra) {
  return "/rest/v1/pos_order_voids?" + new URLSearchParams({
    select: SELECT, tenant_id: "eq." + tenant, store_id: "eq." + store, ...extra
  });
}

async function detail(ctx, storeId, orderId, deps) {
  const orders = await supabaseJson("/rest/v1/pos_orders?" + new URLSearchParams({
    select: "id,tenant_id,store_id,order_number,status,business_date,voided_at",
    tenant_id: "eq." + ctx.tenant.id, store_id: "eq." + storeId,
    id: "eq." + orderId, limit: "2"
  }), { token: ctx.token, ...deps });
  if (!Array.isArray(orders) || orders.length > 1)
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid void Order lookup");
  const order = orders[0];
  if (!order) throw new AppHttpError(404, "COMMERCE_ORDER_NOT_FOUND", "Order not found");
  if (order.tenant_id !== ctx.tenant.id || order.id !== orderId
      || order.store_id !== storeId || !validCommerceBusinessDate(order.business_date)
      || typeof order.order_number !== "string" || !order.order_number.trim()
      || order.order_number.length > 100
      || !["open", "paid", "voided"].includes(order.status)
      || (order.status === "voided") !== (order.voided_at !== null)) {
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Order status evidence is inconsistent");
  }
  if (order.voided_at !== null && !validCommerceTimestamp(order.voided_at))
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid Order void timestamp");

  const rows = await supabaseJson(queryRows(ctx.tenant.id, storeId, {
    order_id: "eq." + orderId, limit: "2"
  }), { token: ctx.token, ...deps });
  if (!Array.isArray(rows) || rows.length > 1)
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid void receipt lookup");
  const record = rows.length ? receipt(rows[0], ctx.tenant.id, storeId) : null;
  if ((order.status === "voided") !== Boolean(record)
      || (record && (record.orderId !== orderId
        || record.businessDate !== order.business_date
        || Date.parse(record.voidedAt) !== Date.parse(order.voided_at)))) {
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Order state and void audit disagree");
  }
  return {
    tenant: ctx.tenant,
    order: {
      orderId, orderNumber: order.order_number, storeId,
      businessDate: order.business_date, status: order.status
    },
    receipt: record
  };
}

async function history(ctx, storeId, offset, deps) {
  const rows = await supabaseJson(queryRows(ctx.tenant.id, storeId, {
    order: "voided_at.desc,order_id.desc", limit: "21", offset: String(offset)
  }), { token: ctx.token, ...deps });
  if (!Array.isArray(rows) || rows.length > 21)
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid void history page");
  const receipts = rows.map(row => receipt(row, ctx.tenant.id, storeId));
  if (new Set(receipts.map(x => x.orderId)).size !== receipts.length)
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Duplicate void audit row");
  return {
    tenant: ctx.tenant, receipts: receipts.slice(0, 20),
    nextOffset: rows.length > 20 ? offset + 20 : null
  };
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = requireCommerceManagerRole(await appContext(req, deps));
    const params = new URL(req.url ?? "/", "https://cafeos.local").searchParams;
    if ([...params.keys()].some(k => !["route", "storeId", "orderId", "offset"].includes(k))
      || params.getAll("storeId").length !== 1 || params.getAll("orderId").length > 1
      || params.getAll("offset").length > 1 || (params.has("orderId") && params.has("offset"))) {
      throw new AppHttpError(400, "COMMERCE_VOID_QUERY_INVALID", "Invalid audit query");
    }
    const store = requiredUuid(params.get("storeId"), "COMMERCE_STORE_INVALID", "Invalid Store");
    if (params.has("orderId")) {
      const order = requiredUuid(params.get("orderId"), "COMMERCE_ORDER_INVALID", "Invalid Order");
      return appJson(res, 200, await detail(ctx, store, order, deps));
    }
    const raw = params.get("offset") ?? "0";
    if (!/^(0|[1-9][0-9]{0,4})$/.test(raw) || Number(raw) > MAX_OFFSET) {
      throw new AppHttpError(400, "COMMERCE_VOID_OFFSET_INVALID", "Invalid audit offset");
    }
    return appJson(res, 200, await history(ctx, store, Number(raw), deps));
  } catch (error) { return appError(res, error); }
}
export default async function handler(req, res) { return handle(req, res); }
