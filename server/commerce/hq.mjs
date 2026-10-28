// Read-only HQ overview of CafeOS-native commerce on ONE explicit business date.
// Authenticated/tenant-scoped; never blends imported Analyzer/Control Tower facts.
import { AppHttpError, appContext, appError, appJson, onlyGet,
  requireCommerceManagerRole, supabaseJson } from "../../api/_app-auth.mjs";
import { UUID_RE, commerceReturnedCents, commerceReturnedCount,
  commerceUpstreamError, optionalBusinessDate } from "./_shared.mjs";
import { validDashboard } from "./dashboard.mjs";

const MAX_STORES = 25;
function centsText(value) {
  return (value / 100n).toString() + "." + (value % 100n).toString().padStart(2, "0");
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = requireCommerceManagerRole(await appContext(req, deps));
    const url = new URL(req.url ?? "/", "https://cafeos.local");
    const rawDate = url.searchParams.get("businessDate");
    if (url.searchParams.getAll("businessDate").length !== 1
        || rawDate !== rawDate?.trim()) {
      throw new AppHttpError(400, "BUSINESS_DATE_INVALID", "Choose one exact HQ date");
    }
    const businessDate = optionalBusinessDate(rawDate);
    if (!businessDate) throw new AppHttpError(400, "BUSINESS_DATE_REQUIRED", "Choose HQ business date");
    if ([...url.searchParams.keys()].some(k => k !== "businessDate" && k !== "route")) {
      throw new AppHttpError(400, "COMMERCE_HQ_QUERY_INVALID", "Unsupported HQ query");
    }

    // RLS is enforced by the caller's own JWT on both Store listing and RPCs.
    // The 26th lookahead Store must fail rather than silently truncating totals.
    const query = new URLSearchParams({
      select: "id,tenant_id,name,active",
      tenant_id: "eq." + ctx.tenant.id,
      active: "eq.true", order: "name.asc,id.asc", limit: String(MAX_STORES + 1)
    });
    const stores = await supabaseJson("/rest/v1/stores?" + query, { token: ctx.token, ...deps });
    if (!Array.isArray(stores) || stores.length > MAX_STORES
      || stores.some(row => !row || typeof row !== "object" || Array.isArray(row)
        || typeof row.id !== "string" || !UUID_RE.test(row.id)
        || row.tenant_id !== ctx.tenant.id || row.active !== true
        || typeof row.name !== "string" || !row.name.trim() || row.name.length > 300)
      || new Set(stores.map(x => x.id.toLowerCase())).size !== stores.length) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid or truncated HQ Store directory");
    }

    const rows = [];
    for (let start = 0; start < stores.length; start += 4) {
      const batch = stores.slice(start, start + 4);
      const dashboards = await Promise.all(batch.map(store =>
        supabaseJson("/rest/v1/rpc/commerce_daily_dashboard", {
          token: ctx.token, method: "POST",
          body: { p_tenant_id: ctx.tenant.id, p_store_id: store.id, p_business_date: businessDate },
          mapError: commerceUpstreamError, ...deps
        })
      ));
      for (let i = 0; i < batch.length; i++) {
        if (!validDashboard(dashboards[i], ctx.tenant.id, batch[i].id, businessDate)) {
          throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Inconsistent HQ Store financial evidence");
        }
        rows.push({ store: batch[i], dashboard: dashboards[i] });
      }
    }

    let sales = 0n, payments = 0n, orders = 0, openOrders = 0, closedStores = 0;
    const methodTotals = new Map();
    const perStore = [];
    for (const { store, dashboard: d } of rows) {
      const sc = commerceReturnedCents(d.salesTotal), pc = commerceReturnedCents(d.paymentTotal);
      if (sc === null || pc === null || !commerceReturnedCount(d.orderCount)
        || !commerceReturnedCount(d.openOrderCount)) {
        throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid HQ money or order count");
      }
      sales += sc; payments += pc;
      orders += d.orderCount; openOrders += d.openOrderCount;
      if (d.closed) closedStores++;
      for (const [method, amount] of Object.entries(d.paymentMix)) {
        methodTotals.set(method, (methodTotals.get(method) ?? 0n) + commerceReturnedCents(amount));
      }
      perStore.push({
        id: store.id, name: store.name, businessDate,
        status: d.closed ? "closed" : "open",
        orderCount: d.orderCount, openOrderCount: d.openOrderCount,
        salesTotal: centsText(sc), paymentTotal: centsText(pc)
      });
    }
    if (sales !== payments ||
      [...methodTotals.values()].reduce((a, b) => a + b, 0n) !== payments) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "HQ totals failed settlement check");
    }
    return appJson(res, 200, {
      tenant: ctx.tenant,
      overview: {
        source: "cafeos_pos", businessDate,
        storeCount: stores.length, closedStoreCount: closedStores,
        orderCount: orders, openOrderCount: openOrders,
        salesTotal: centsText(sales), paymentTotal: centsText(payments),
        aov: orders ? centsText((sales + BigInt(Math.floor(orders / 2))) / BigInt(orders)) : null,
        paymentMix: Object.fromEntries([...methodTotals].sort(([a], [b]) => a.localeCompare(b))
          .map(([method, cents]) => [method, centsText(cents)])),
        stores: perStore
      }
    });
  } catch (error) { return appError(res, error); }
}
export default async function handler(req, res) { return handle(req, res); }
