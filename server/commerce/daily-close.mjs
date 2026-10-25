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
  commerceUpstreamError,
  optionalBusinessDate,
  requiredUuid,
  strictFields
} from "./_shared.mjs";

const ALLOWED_FIELDS = new Set(["storeId", "businessDate"]);

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
    if (!payload?.id || payload.storeId !== storeId) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Commerce data service returned an error");
    }
    return appJson(res, 201, { tenant: ctx.tenant, close: payload });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
