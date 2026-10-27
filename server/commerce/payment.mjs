import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyPost,
  requestJsonObject,
  requireCommerceWriteRole,
  supabaseJson
} from "../../api/_app-auth.mjs";
import {
  commerceUpstreamError,
  requiredUuid,
  strictFields,
  parseCommerceMoney
} from "./_shared.mjs";

const ALLOWED_FIELDS = new Set(["orderId", "method", "amount", "reference"]);
const METHODS = new Set(["cash", "card", "bank_transfer", "wallet", "other"]);

export async function handle(req, res, deps = {}) {
  if (!onlyPost(req, res)) return;
  try {
    const ctx = requireCommerceWriteRole(await appContext(req, deps));
    const body = requestJsonObject(req);
    strictFields(body, ALLOWED_FIELDS);

    const orderId = requiredUuid(body.orderId, "COMMERCE_ORDER_INVALID", "Invalid Order");
    const method = typeof body.method === "string" ? body.method.trim() : "";
    if (!METHODS.has(method)) {
      throw new AppHttpError(400, "COMMERCE_PAYMENT_METHOD_INVALID", "Payment method is invalid");
    }
    const amount = parseCommerceMoney(body.amount, {
      code: "COMMERCE_PAYMENT_AMOUNT_INVALID",
      message: "Payment amount is invalid",
      max: 1000000000000
    });
    // Settlement references are optional strings; never manufacture a reference
    // from a boolean, array or object by calling String(value).
    if (body.reference !== undefined && body.reference !== null
        && typeof body.reference !== "string") {
      throw new AppHttpError(400, "COMMERCE_PAYMENT_REFERENCE_INVALID", "Payment reference is invalid");
    }
    const reference = typeof body.reference === "string" ? (body.reference.trim() || null) : null;
    if (reference !== null && reference.length > 500) {
      throw new AppHttpError(400, "COMMERCE_PAYMENT_REFERENCE_INVALID", "Payment reference is invalid");
    }

    const payload = await supabaseJson("/rest/v1/rpc/commerce_capture_payment", {
      token: ctx.token,
      method: "POST",
      body: {
        p_tenant_id: ctx.tenant.id,
        p_order_id: orderId,
        p_method: method,
        p_amount: amount,
        p_reference: reference
      },
      mapError: commerceUpstreamError,
      ...deps
    });
    if (!payload?.orderId || payload.status !== "paid" || !payload.payment) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Commerce data service returned an error");
    }
    return appJson(res, 201, { tenant: ctx.tenant, ...payload });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
