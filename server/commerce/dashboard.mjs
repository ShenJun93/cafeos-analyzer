import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyGet,
  supabaseJson
} from "../../api/_app-auth.mjs";
import {
  UUID_RE,
  commerceUpstreamError,
  commerceReturnedCents,
  commerceReturnedCount,
  optionalBusinessDate,
  requiredUuid
} from "./_shared.mjs";

const PAYMENT_METHODS = new Set(["cash", "card", "bank_transfer", "wallet", "other"]);

function validBusinessDate(value) {
  return typeof value === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + "T00:00:00Z"))
    && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}

// SQL returns both immutable Daily Close reference fields alongside the
// boolean close state. A 2xx with contradictory or absent close evidence
// must never be displayed as a trustworthy manager dashboard.
function validCloseTimestamp(value) {
  if (typeof value !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(Date.parse(value))) return false;
  return validBusinessDate(value.slice(0, 10));
}

function validDashboard(payload, tenantId, storeId, businessDate) {
  if (!payload || Array.isArray(payload) || typeof payload !== "object"
      || payload.tenantId !== tenantId || payload.storeId !== storeId
      || payload.source !== "cafeos_pos"
      || !validBusinessDate(payload.businessDate)
      || (businessDate !== null && payload.businessDate !== businessDate)
      || !commerceReturnedCount(payload.orderCount)
      || !commerceReturnedCount(payload.openOrderCount)
      || typeof payload.closed !== "boolean") return false;

  if (payload.closed) {
    if (payload.openOrderCount !== 0
        || typeof payload.closeId !== "string" || !UUID_RE.test(payload.closeId)
        || !validCloseTimestamp(payload.closedAt)) return false;
  } else if (payload.closeId !== null || payload.closedAt !== null) {
    return false;
  }

  const sales = commerceReturnedCents(payload.salesTotal);
  const payments = commerceReturnedCents(payload.paymentTotal);
  if (sales === null || payments === null || sales !== payments) return false;
  const average = payload.aov;
  if (payload.orderCount === 0) {
    if (sales !== 0n || average !== null) return false;
  } else if ((typeof average !== "number" && typeof average !== "string")
      || !Number.isFinite(Number(average)) || Number(average) <= 0
      || Math.abs(Number(average) - Number(sales) / 100 / payload.orderCount) > 0.01) {
    return false;
  }

  const mix = payload.paymentMix;
  if (!mix || typeof mix !== "object" || Array.isArray(mix)) return false;
  let mixCents = 0n;
  for (const [method, amount] of Object.entries(mix)) {
    const cents = commerceReturnedCents(amount);
    if (!PAYMENT_METHODS.has(method) || cents === null) return false;
    mixCents += cents;
  }
  return mixCents === payments;
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const url = new URL(req.url ?? "/", "https://cafeos.local");
    const storeId = requiredUuid(url.searchParams.get("storeId"), "COMMERCE_STORE_INVALID", "Invalid Store");
    const businessDate = optionalBusinessDate(url.searchParams.get("businessDate"));

    const payload = await supabaseJson("/rest/v1/rpc/commerce_daily_dashboard", {
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
    if (!validDashboard(payload, ctx.tenant.id, storeId, businessDate)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM",
        "Commerce dashboard returned inconsistent financial or tenant data");
    }
    return appJson(res, 200, { tenant: ctx.tenant, dashboard: payload });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
