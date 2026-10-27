import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyPost,
  requestJsonObject,
  requireCommerceManagerRole,
  supabaseJson
} from "../../api/_app-auth.mjs";
import {
  UUID_RE,
  commerceUpstreamError,
  commerceReturnedCents,
  commerceReturnedCount,
  optionalBusinessDate,
  requiredUuid,
  strictFields
} from "./_shared.mjs";

const ALLOWED_FIELDS = new Set(["storeId", "businessDate"]);

function validBusinessDate(value) {
  return typeof value === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + "T00:00:00Z"))
    && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}

function validClose(payload, tenantId, storeId, requestedDate) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || typeof payload.id !== "string" || !UUID_RE.test(payload.id)
      || payload.tenantId !== tenantId || payload.storeId !== storeId
      || !validBusinessDate(payload.businessDate)
      || (requestedDate !== null && payload.businessDate !== requestedDate)
      || !commerceReturnedCount(payload.orderCount)
      || typeof payload.idempotent !== "boolean") return false;
  const sales = commerceReturnedCents(payload.salesTotal);
  const payments = commerceReturnedCents(payload.paymentTotal);
  const cash = commerceReturnedCents(payload.cashTotal);
  const nonCash = commerceReturnedCents(payload.nonCashTotal);
  return sales !== null && payments !== null && cash !== null
    && nonCash !== null && sales === payments && cash + nonCash === payments
    && (payload.orderCount !== 0 || sales === 0n);
}

export async function handle(req, res, deps = {}) {
  if (!onlyPost(req, res)) return;
  try {
    const ctx = requireCommerceManagerRole(await appContext(req, deps));
    const body = requestJsonObject(req);
    strictFields(body, ALLOWED_FIELDS);

    const storeId = requiredUuid(body.storeId, "COMMERCE_STORE_INVALID", "Invalid Store");
    const businessDate = optionalBusinessDate(body.businessDate);

    const payload = await supabaseJson("/rest/v1/rpc/commerce_close_day", {
      token: ctx.token,
      method: "POST",
      body: {
        p_tenant_id: ctx.tenant.id,
        p_store_id: storeId,
        p_business_date: businessDate
      },
      mapError: commerceUpstreamError,
      ...deps
    });
    // A close is a persistent accounting receipt, not just a successful RPC.
    // Never show "CLOSED" for a foreign Tenant/date or unbalanced totals.
    if (!validClose(payload, ctx.tenant.id, storeId, businessDate)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM",
        "Commerce close returned inconsistent financial or tenant data");
    }
    return appJson(res, 201, { tenant: ctx.tenant, close: payload });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
