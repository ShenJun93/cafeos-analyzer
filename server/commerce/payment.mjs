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

/**
 * PostgreSQL numerics may be JSON decimal strings or numbers. Compare the
 * captured payment against the requested cents without rounding binary floats.
 * Fail closed on malformed, fractional-cent, or out-of-bounds RPC evidence.
 */
function capturedCents(value) {
  if ((typeof value !== "string" && typeof value !== "number")
      || (typeof value === "number" && !Number.isFinite(value))) return null;
  const match = /^(0|[1-9][0-9]*)(?:[.]([0-9]{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n
    + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents > 0n && cents <= 100000000000000n ? cents : null;
}

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
    // A 2xx response alone is not settlement proof. The fixed RPC must
    // acknowledge exactly the requested Order, method and captured cents.
    // A malformed response may still follow a committed write; the browser
    // must reconcile the order state via its read-only status path, not retry.
    if (payload?.orderId !== orderId || payload.status !== "paid"
        || !payload.payment || Array.isArray(payload.payment)
        || payload.payment.status !== "captured"
        || payload.payment.method !== method
        // The SQL function persists the canonical trimmed reference and
        // returns it on every captured payment (null when not supplied).
        // Never acknowledge an unverified terminal/bank reference as paid.
        || !Object.hasOwn(payload.payment, "reference")
        || payload.payment.reference !== reference
        || capturedCents(payload.payment.amount) !== capturedCents(amount)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM",
        "Commerce payment service returned inconsistent settlement evidence");
    }
    return appJson(res, 201, { tenant: ctx.tenant, ...payload });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
