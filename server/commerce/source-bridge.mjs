// Source-separated operating read-model: never silently sum imported and native
// money or claim shared lineage/deduplication without a migration/reconciliation plan.
import {
  AppHttpError, appContext, appError, appJson, onlyGet, supabaseJson
} from "../../api/_app-auth.mjs";
import {
  commerceUpstreamError, optionalBusinessDate, requiredUuid,
  validCommerceBusinessDate, validCommerceTimestamp
} from "./_shared.mjs";
import { validDashboard } from "./dashboard.mjs";

const IMPORTED_METRICS = ["netSales", "orders", "aov"];
function metricValue(value, { count = false } = {}) {
  if (value === null) return true;
  if (typeof value !== "string" && typeof value !== "number") return false;
  const text = String(value);
  if (!/^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/.test(text)) return false;
  if (count && (!/^(?:0|[1-9]\d{0,10})$/.test(text)
    || !Number.isSafeInteger(Number(text)))) return false;
  return true;
}
function validImported(raw, tenant, store, businessDate) {
  if (!raw || Array.isArray(raw) || typeof raw !== "object"
    || raw.tenantId !== tenant || !raw.store || Array.isArray(raw.store)
    || raw.store.id !== store || raw.store.active !== true
    || typeof raw.store.name !== "string" || !raw.store.name.trim()
    || !raw.coverage || typeof raw.coverage.currentHasData !== "boolean"
    || !raw.metrics || typeof raw.metrics !== "object" || Array.isArray(raw.metrics)
    || !raw.freshness || typeof raw.freshness !== "object") return false;

  const hasImportedData = raw.coverage.currentHasData;
  if (raw.asOfBusinessDate !== businessDate
      && !(raw.asOfBusinessDate === null && !hasImportedData)) return false;
  const observed = raw.freshness.latestObservedTransactionAt;
  if (observed !== null && !validCommerceTimestamp(observed)) return false;
  for (const key of IMPORTED_METRICS) {
    const metric = raw.metrics[key];
    if (!metric || typeof metric !== "object" || Array.isArray(metric)
      || !metricValue(metric.current, { count: key === "orders" })
      || !["ready", "insufficient_coverage", "insufficient_history"]
        .includes(metric.baselineStatus)) return false;
    if (hasImportedData === (metric.current === null)) return false;
  }
  if (hasImportedData && Number(raw.metrics.orders.current) === 0) return false;
  return true;
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const params = new URL(req.url ?? "/", "https://cafeos.local").searchParams;
    if (params.getAll("storeId").length !== 1
      || params.getAll("businessDate").length !== 1
      || [...params.keys()].some(k => !["storeId", "businessDate", "route"].includes(k))) {
      throw new AppHttpError(400, "SOURCE_BRIDGE_QUERY_INVALID", "Choose one Store and one date");
    }
    const storeId = requiredUuid(params.get("storeId"), "COMMERCE_STORE_INVALID", "Invalid Store");
    const date = optionalBusinessDate(params.get("businessDate"));
    if (!date || date !== params.get("businessDate") || !validCommerceBusinessDate(date))
      throw new AppHttpError(400, "BUSINESS_DATE_INVALID", "Choose an exact business date");

    // Signed caller JWT and invoker RLS must authorize BOTH independent RPCs.
    // No service role, cross-tenant join, client-provided prices or synthetic import.
    const [native, imported] = await Promise.all([
      supabaseJson("/rest/v1/rpc/commerce_daily_dashboard", {
        token: ctx.token, method: "POST",
        body: { p_tenant_id: ctx.tenant.id, p_store_id: storeId, p_business_date: date },
        mapError: commerceUpstreamError, ...deps
      }),
      supabaseJson("/rest/v1/rpc/store_health_aggregate", {
        token: ctx.token, method: "POST",
        body: {
          p_tenant_id: ctx.tenant.id, p_store_id: storeId,
          p_as_of_business_date: date
        }, ...deps
      })
    ]);
    if (!validDashboard(native, ctx.tenant.id, storeId, date)
      || !validImported(imported, ctx.tenant.id, storeId, date)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM",
        "Operating sources disagree with the requested Tenant, Store or date");
    }

    return appJson(res, 200, {
      tenant: ctx.tenant,
      store: { id: storeId, name: imported.store.name },
      businessDate: date,
      sourceBoundary: {
        status: "separate_not_deduplicated",
        reason: "Imported and first-party transactions may overlap; no canonical union or shared net-sales total is authorized."
      },
      sources: {
        cafeosPos: {
          source: "cafeos_pos", hasData: native.orderCount > 0,
          orderCount: native.orderCount, openOrderCount: native.openOrderCount,
          salesTotal: native.salesTotal, aov: native.aov,
          closed: native.closed
        },
        imports: {
          source: "imported_line_items",
          hasData: imported.coverage.currentHasData,
          asOfBusinessDate: imported.asOfBusinessDate,
          netSales: imported.metrics.netSales.current,
          orderCount: imported.metrics.orders.current,
          aov: imported.metrics.aov.current,
          baselineStatus: imported.metrics.netSales.baselineStatus,
          latestObservedTransactionAt: imported.freshness.latestObservedTransactionAt
        }
      }
    });
  } catch (error) { return appError(res, error); }
}
export default async function handler(req, res) { return handle(req, res); }
