// Multi-store Source Coverage: compare evidence presence, never unify money.
// Read-only HQ view for one explicitly selected business date, per-Tenant JWT.
import {
  AppHttpError, appContext, appError, appJson, onlyGet,
  requireCommerceManagerRole, supabaseJson
} from "../../api/_app-auth.mjs";
import { UUID_RE, optionalBusinessDate } from "./_shared.mjs";
import { validDashboard } from "./dashboard.mjs";
import { validImported } from "./source-bridge.mjs";

const MAX_STORES = 25;
const PARALLEL_STORES = 3;

function validStore(row, tenantId) {
  return row && typeof row === "object" && !Array.isArray(row)
    && typeof row.id === "string" && UUID_RE.test(row.id)
    && row.tenant_id === tenantId && row.active === true
    && typeof row.name === "string" && row.name.trim().length > 0
    && row.name.length <= 300;
}

function classification(pos, imports) {
  if (pos && imports) return "both_present_overlap_unresolved";
  if (pos) return "pos_only_observed";
  if (imports) return "imports_only_observed";
  return "neither_observed";
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = requireCommerceManagerRole(await appContext(req, deps));
    const query = new URL(req.url ?? "/", "https://cafeos.local").searchParams;
    if (query.getAll("businessDate").length !== 1
      || [...query.keys()].some(k => !["businessDate", "route"].includes(k))) {
      throw new AppHttpError(400, "SOURCE_COVERAGE_QUERY_INVALID",
        "Exactly one business date is required");
    }
    const date = optionalBusinessDate(query.get("businessDate"));
    if (!date || date !== query.get("businessDate")) {
      throw new AppHttpError(400, "BUSINESS_DATE_INVALID", "Invalid business date");
    }

    // The authenticated JWT enforces RLS on Store discovery and BOTH RPCs.
    // Fetch one extra row to reject truncated tenant coverage rather than
    // displaying misleading "all stores" counts.
    const list = new URLSearchParams({
      select: "id,tenant_id,name,active",
      tenant_id: "eq." + ctx.tenant.id, active: "eq.true",
      order: "name.asc,id.asc", limit: String(MAX_STORES + 1)
    });
    const stores = await supabaseJson("/rest/v1/stores?" + list, {
      token: ctx.token, ...deps
    });
    if (!Array.isArray(stores) || stores.length > MAX_STORES
      || stores.some(row => !validStore(row, ctx.tenant.id))
      || new Set(stores.map(row => row.id.toLowerCase())).size !== stores.length) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM",
        "Source coverage Store directory is inconsistent or truncated");
    }

    const rows = [];
    for (let offset = 0; offset < stores.length; offset += PARALLEL_STORES) {
      const batch = stores.slice(offset, offset + PARALLEL_STORES);
      // Entire response fails if ONE source for ONE Store cannot be verified;
      // no partial cross-store coverage is ever displayed.
      const parts = await Promise.all(batch.map(async store => {
        const [pos, imports] = await Promise.all([
          supabaseJson("/rest/v1/rpc/commerce_daily_dashboard", {
            token: ctx.token, method: "POST",
            body: {
              p_tenant_id: ctx.tenant.id, p_store_id: store.id,
              p_business_date: date
            }, ...deps
          }),
          supabaseJson("/rest/v1/rpc/store_health_aggregate", {
            token: ctx.token, method: "POST",
            body: {
              p_tenant_id: ctx.tenant.id, p_store_id: store.id,
              p_as_of_business_date: date
            }, ...deps
          })
        ]);
        if (!validDashboard(pos, ctx.tenant.id, store.id, date)
          || !validImported(imports, ctx.tenant.id, store.id, date)
          || imports.store.name !== store.name) {
          throw new AppHttpError(502, "SUPABASE_UPSTREAM",
            "A Store source returned inconsistent evidence");
        }
        const posHasData = pos.orderCount > 0;
        const importHasData = imports.coverage.currentHasData;
        return {
          storeId: store.id, storeName: store.name, businessDate: date,
          status: classification(posHasData, importHasData),
          pos: {
            source: "cafeos_pos",
            hasData: posHasData, salesTotal: pos.salesTotal,
            paidOrders: pos.orderCount, openOrders: pos.openOrderCount,
            closed: pos.closed
          },
          imports: {
            source: "imported_line_items",
            hasData: importHasData,
            netSales: imports.metrics.netSales.current,
            orders: imports.metrics.orders.current,
            baselineStatus: imports.metrics.netSales.baselineStatus
          }
        };
      }));
      rows.push(...parts);
    }

    const counts = {
      bothPresent: rows.filter(r => r.status === "both_present_overlap_unresolved").length,
      posOnly: rows.filter(r => r.status === "pos_only_observed").length,
      importsOnly: rows.filter(r => r.status === "imports_only_observed").length,
      neither: rows.filter(r => r.status === "neither_observed").length
    };
    return appJson(res, 200, {
      tenant: ctx.tenant,
      report: {
        sourceBoundary: "separate_not_deduplicated",
        businessDate: date, activeStoreCount: rows.length, counts,
        reconciliation: {
          status: "not_proven",
          sharedTransactionIdentity: "not_verified",
          deduplication: "not_performed",
          combinedSales: null
        },
        stores: rows
      }
    });
  } catch (error) {
    return appError(res, error);
  }
}
export default async function handler(req, res) {
  return handle(req, res);
}
