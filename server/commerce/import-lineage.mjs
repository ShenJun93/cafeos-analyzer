// Read-only source namespace evidence for ONE Store's local business date.
// This does not match imported transaction_id against POS order IDs/numbers.
import {
  AppHttpError, appContext, appError, appJson, onlyGet,
  requireCommerceManagerRole, supabaseJson
} from "../../api/_app-auth.mjs";
import { UUID_RE, optionalBusinessDate, requiredUuid, validCommerceTimestamp } from "./_shared.mjs";

const MAX_ROWS = 500;
const DAY_MS = 86400000;

function localDate(instant, formatter) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant))
    .filter(p => p.type === "year" || p.type === "month" || p.type === "day")
    .map(p => [p.type, p.value]));
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function startUtcForLocalDay(day, formatter) {
  const noon = Date.parse(day + "T00:00:00.000Z");
  let low = noon - 2 * DAY_MS;
  let high = noon + 2 * DAY_MS;
  // A civil date is monotonically ordered through ordinary DST transitions;
  // binary-search earliest UTC millisecond carrying the requested date.
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (localDate(middle, formatter) >= day) high = middle;
    else low = middle;
  }
  return high;
}

export function storeDayUtcBounds(day, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) {
    throw new AppHttpError(400, "BUSINESS_DATE_INVALID", "Invalid business date");
  }
  if (typeof timezone !== "string" || !timezone || timezone.length > 100) {
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid Store timezone");
  }
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
    });
  } catch {
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid Store timezone");
  }
  const nextDay = new Date(Date.parse(day + "T00:00:00.000Z") + DAY_MS)
    .toISOString().slice(0, 10);
  const start = startUtcForLocalDay(day, formatter);
  const end = startUtcForLocalDay(nextDay, formatter);
  if (!(end > start) || localDate(start, formatter) !== day
    || localDate(end - 1, formatter) !== day) {
    throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Store business date cannot be resolved");
  }
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(), formatter
  };
}

// Verify the entire RLS-scoped filtered result, not just the returned prefix.
// A PostgREST db-max-rows cap may truncate a requested 501-row lookahead.
export function exactLineagePage(rows, contentRange) {
  const limit = () => new AppHttpError(422, "IMPORT_LINEAGE_LIMIT",
    "Import line count exceeds the bounded audit; no incomplete result is published");
  const invalid = () => new AppHttpError(502, "SUPABASE_UPSTREAM",
    "Incomplete or unverifiable source lineage result");
  if (!Array.isArray(rows)) throw invalid();
  if (rows.length > MAX_ROWS) throw limit();
  if (typeof contentRange !== "string") throw invalid();
  if (contentRange === "*/0" && rows.length === 0) return 0;
  const match = /^(\\d+)-(\\d+)\/(\\d+)$/.exec(contentRange);
  if (!match) throw invalid();
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger)) throw invalid();
  if (total > MAX_ROWS) throw limit();
  if (start !== 0 || end !== rows.length - 1 || total !== rows.length) {
    throw invalid();
  }
  return total;
}

function validatedStore(row, tenantId, storeId) {
  return row && typeof row === "object" && !Array.isArray(row)
    && row.id === storeId && row.tenant_id === tenantId
    && row.active === true && typeof row.name === "string"
    && row.name.trim().length > 0 && row.name.length <= 300;
}

export function summarizeNamespaceRows(rows, { tenantId, storeId, day, formatter }) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) {
    throw new AppHttpError(422, "IMPORT_LINEAGE_LIMIT",
      "Import line count exceeds the bounded audit; no incomplete result is published");
  }
  const seen = new Set(), namespaces = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)
      || typeof row.id !== "string" || !UUID_RE.test(row.id)
      || row.tenant_id !== tenantId || row.store_id !== storeId
      || typeof row.source_namespace !== "string"
      || !row.source_namespace.trim()
      || row.source_namespace.trim() !== row.source_namespace
      || row.source_namespace.length > 128
      || typeof row.transaction_id !== "string"
      || !row.transaction_id.trim()
      || row.transaction_id.length > 256
      || !validCommerceTimestamp(row.occurred_at)
      || localDate(Date.parse(row.occurred_at), formatter) !== day
      || seen.has(row.id)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM",
        "Untrusted source lineage or Store-local timestamp");
    }
    seen.add(row.id);
    let slot = namespaces.get(row.source_namespace);
    if (!slot) {
      slot = { sourceNamespace: row.source_namespace, lineItemCount: 0, transactionIds: new Set() };
      namespaces.set(row.source_namespace, slot);
    }
    slot.lineItemCount++;
    // Identity is scoped TO THE NAMESPACE. A reused external ID across
    // namespaces must never be called a duplicate.
    slot.transactionIds.add(row.transaction_id);
  }
  const breakdown = [...namespaces.values()].sort((a, b) =>
    a.sourceNamespace < b.sourceNamespace ? -1 :
      a.sourceNamespace > b.sourceNamespace ? 1 : 0
  ).map(slot => ({
    sourceNamespace: slot.sourceNamespace,
    lineItemCount: slot.lineItemCount,
    sourceScopedTransactionCount: slot.transactionIds.size
  }));
  return {
    observedLineItemCount: rows.length,
    observedNamespaceCount: breakdown.length,
    namespaces: breakdown
  };
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = requireCommerceManagerRole(await appContext(req, deps));
    const query = new URL(req.url ?? "/", "https://cafeos.local").searchParams;
    if (query.getAll("storeId").length !== 1
      || query.getAll("businessDate").length !== 1
      || [...query.keys()].some(k => !["route", "storeId", "businessDate"].includes(k))) {
      throw new AppHttpError(400, "IMPORT_LINEAGE_QUERY_INVALID",
        "Choose one Store and one business date");
    }
    const storeId = requiredUuid(query.get("storeId"),
      "COMMERCE_STORE_INVALID", "Invalid Store");
    const day = optionalBusinessDate(query.get("businessDate"));
    if (!day || day !== query.get("businessDate")) {
      throw new AppHttpError(400, "BUSINESS_DATE_INVALID", "Invalid business date");
    }
    const storeQuery = new URLSearchParams({
      select: "id,tenant_id,name,active,timezone",
      tenant_id: "eq." + ctx.tenant.id, id: "eq." + storeId, limit: "2"
    });
    const storeRows = await supabaseJson("/rest/v1/stores?" + storeQuery, {
      token: ctx.token, ...deps
    });
    if (!Array.isArray(storeRows) || storeRows.length > 1
      || (storeRows.length === 1 && !validatedStore(storeRows[0], ctx.tenant.id, storeId))) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM", "Invalid Store directory evidence");
    }
    if (!storeRows.length) {
      throw new AppHttpError(404, "COMMERCE_STORE_NOT_FOUND", "Store not found");
    }
    const store = storeRows[0];
    const { start, end, formatter } = storeDayUtcBounds(day, store.timezone);
    const lineQuery = new URLSearchParams({
      select: "id,tenant_id,store_id,source_namespace,transaction_id,occurred_at",
      tenant_id: "eq." + ctx.tenant.id, store_id: "eq." + storeId,
      and: "(occurred_at.gte." + start + ",occurred_at.lt." + end + ")",
      order: "occurred_at.asc,id.asc", limit: String(MAX_ROWS + 1)
    });
    const page = await supabaseJson("/rest/v1/transaction_line_items?" + lineQuery, {
      token: ctx.token, ...deps,
      headers: { prefer: "count=exact" }, includeResponseMeta: true
    });
    const exactCount = exactLineagePage(page.data, page.contentRange);
    const summary = summarizeNamespaceRows(page.data, {
      tenantId: ctx.tenant.id, storeId, day, formatter
    });
    return appJson(res, 200, {
      tenant: ctx.tenant,
      store: { id: storeId, name: store.name, timezone: store.timezone },
      businessDate: day,
      boundedUtcRange: { start, end },
      sourceBoundary: {
        status: "import_namespace_observation_only",
        transactionIdentity: "tenant_store_source_namespace_transaction_id",
        comparedToPos: false,
        deduplication: "not_performed",
        combinedSales: null,
        transactionIdsExposed: false
      },
      completeness: {
        status: "bounded_read_only",
        maxLineItems: MAX_ROWS,
        exactResponseVerified: true,
        exactMatchedLineItemCount: exactCount,
        noRowLimitReached: true
      },
      ...summary
    });
  } catch (error) {
    return appError(res, error);
  }
}
export default async function handler(req, res) {
  return handle(req, res);
}
