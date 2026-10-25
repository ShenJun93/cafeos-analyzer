import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyGet,
  supabaseJson
} from "../../api/_app-auth.mjs";
import {
  commerceUpstreamError,
  optionalBusinessDate,
  requiredUuid
} from "./_shared.mjs";

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
    if (!payload || payload.storeId !== storeId || payload.source !== "cafeos_pos") {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Commerce data service returned an error");
    }
    return appJson(res, 200, { tenant: ctx.tenant, dashboard: payload });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
