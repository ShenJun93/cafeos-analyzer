import {
  AppHttpError, appContext, appError, appJson, onlyPost, requestJsonObject,
  requireCommerceManagerRole, supabaseJson
} from "../../api/_app-auth.mjs";
import {
  commerceUpstreamError, requiredUuid, strictFields, validCommerceBusinessDate,
  validCommerceTimestamp
} from "./_shared.mjs";

const ALLOWED_FIELDS = new Set(["orderId", "storeId", "reason"]);

// Only manager-or-higher may void a never-paid POS order. This does not refund,
// capture or alter paid receipts; a committed void is paired with an audit row.
export async function handle(req, res, deps = {}) {
  if (!onlyPost(req, res)) return;
  try {
    const ctx = requireCommerceManagerRole(await appContext(req, deps));
    const body = requestJsonObject(req);
    strictFields(body, ALLOWED_FIELDS);
    const orderId = requiredUuid(body.orderId, "COMMERCE_ORDER_INVALID", "Invalid Order");
    const storeId = requiredUuid(body.storeId, "COMMERCE_STORE_INVALID", "Invalid Store");
    if (typeof body.reason !== "string") {
      throw new AppHttpError(400, "COMMERCE_VOID_REASON_INVALID", "A reason is required");
    }
    const reason = body.reason.trim();
    if (reason.length < 5 || reason.length > 240) {
      throw new AppHttpError(400, "COMMERCE_VOID_REASON_INVALID", "Reason must be 5–240 characters");
    }
    const payload = await supabaseJson("/rest/v1/rpc/commerce_void_order", {
      token: ctx.token,
      method: "POST",
      body: {
        p_tenant_id: ctx.tenant.id,
        p_order_id: orderId,
        p_reason: reason
      },
      mapError: ({ payload }) => {
        const code = String(payload?.message ?? "").trim();
        if (["COMMERCE_VOID_CONFLICT", "COMMERCE_ORDER_HAS_PAYMENT"].includes(code)) {
          return new AppHttpError(409, code, "Order cannot be voided in this state");
        }
        return commerceUpstreamError({ payload });
      },
      ...deps
    });
    if (!payload || Array.isArray(payload) || payload.orderId !== orderId
      || payload.storeId !== storeId || payload.status !== "voided"
      || !validCommerceBusinessDate(payload.businessDate)
      || payload.voidedByUserId !== ctx.user.id
      || !validCommerceTimestamp(payload.voidedAt)
      || payload.reason !== reason
      || typeof payload.idempotent !== "boolean") {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM",
        "Void response did not confirm the expected Order, reason and actor");
    }
    return appJson(res, 200, { tenant: ctx.tenant, void: payload });
  } catch (error) {
    return appError(res, error);
  }
}
export default async function handler(req, res) { return handle(req, res); }
