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
  UUID_RE,
  commerceUpstreamError,
  requiredUuid,
  strictFields
} from "./_shared.mjs";

const ALLOWED_FIELDS = new Set(["storeId", "clientOrderKey", "channel", "items"]);
const CHANNELS = new Set(["counter", "takeaway", "pickup", "delivery"]);

function validReturnedTotal(value) {
  if ((typeof value !== "number" && typeof value !== "string")
      || (typeof value === "number" && !Number.isFinite(value))) return false;
  const raw = String(value);
  return /^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$/.test(raw)
    && Number(raw) > 0 && Number(raw) <= 1000000000000;
}

function normalizeItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new AppHttpError(400, "COMMERCE_ITEMS_INVALID", "Order items are invalid");
  }
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new AppHttpError(400, "COMMERCE_ITEMS_INVALID", "Order items are invalid");
    }
    strictFields(item, new Set(["menuItemId", "quantity"]));
    const menuItemId = typeof item.menuItemId === "string" ? item.menuItemId.trim() : "";
    // Match the trusted RPC's numeric(12,3) quantity contract before any
    // Number() coercion (true, arrays, exponents and excess precision must
    // never change what the cashier intended to submit).
    const rawQuantity = item.quantity;
    if ((typeof rawQuantity !== "number" && typeof rawQuantity !== "string")
        || (typeof rawQuantity === "number" && !Number.isFinite(rawQuantity))) {
      throw new AppHttpError(400, "COMMERCE_ITEMS_INVALID", "Order items are invalid");
    }
    const decimal = String(rawQuantity).trim();
    if (!/^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,3})?$/.test(decimal)) {
      throw new AppHttpError(400, "COMMERCE_ITEMS_INVALID", "Order items are invalid");
    }
    const quantity = Number(decimal);
    if (!UUID_RE.test(menuItemId) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
      throw new AppHttpError(400, "COMMERCE_ITEMS_INVALID", "Order items are invalid");
    }
    return { menuItemId, quantity };
  });
}

// The order RPC may return line items in a different order and may serialize
// SQL NUMERIC(12,3) as JSON numbers or decimal strings. Compare exact
// thousandths, not floating-point equality or array order. Distinct duplicate
// menu IDs remain valid only if all requested (ID,quantity) pairs are present.
function quantityMilli(value) {
  if ((typeof value !== "number" && typeof value !== "string")
      || (typeof value === "number" && !Number.isFinite(value))) return null;
  const match = /^(0|[1-9][0-9]*)(?:[.]([0-9]{1,3}))?$/.exec(String(value));
  if (!match) return null;
  const milli = BigInt(match[1]) * 1000n
    + BigInt((match[2] ?? "").padEnd(3, "0"));
  return milli > 0n && milli <= 1000000n ? String(milli) : null;
}

function returnedItemsMatchIntent(returned, requested) {
  if (!Array.isArray(returned) || returned.length !== requested.length) return false;
  const remaining = new Map();
  for (const item of requested) {
    const quantity = quantityMilli(item.quantity);
    if (quantity === null) return false;
    const key = item.menuItemId + ":" + quantity;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (const item of returned) {
    if (!item || typeof item !== "object" || Array.isArray(item)
        || typeof item.menuItemId !== "string" || !UUID_RE.test(item.menuItemId)) return false;
    const quantity = quantityMilli(item.quantity);
    if (quantity === null) return false;
    const key = item.menuItemId + ":" + quantity;
    const remainingCount = remaining.get(key) ?? 0;
    if (remainingCount === 0) return false;
    if (remainingCount === 1) remaining.delete(key);
    else remaining.set(key, remainingCount - 1);
  }
  return remaining.size === 0;
}

export async function handle(req, res, deps = {}) {
  if (!onlyPost(req, res)) return;
  try {
    const ctx = requireCommerceWriteRole(await appContext(req, deps));
    const body = requestJsonObject(req);
    strictFields(body, ALLOWED_FIELDS);

    const storeId = requiredUuid(body.storeId, "COMMERCE_STORE_INVALID", "Invalid Store");
    // An idempotency key is an opaque string; never coerce arrays/objects/numbers into identifiers.
    const clientOrderKey = typeof body.clientOrderKey === "string" ? body.clientOrderKey.trim() : "";
    if (!clientOrderKey || clientOrderKey.length > 128) {
      throw new AppHttpError(400, "COMMERCE_CLIENT_ORDER_KEY_INVALID", "Client order key is invalid");
    }
    // A JSON array such as ["counter"] must not become a valid channel by
    // String() coercion before the trusted Create Order RPC.
    const channel = typeof body.channel === "string" ? body.channel.trim() : "";
    if (!CHANNELS.has(channel)) {
      throw new AppHttpError(400, "COMMERCE_CHANNEL_INVALID", "Order channel is invalid");
    }
    const items = normalizeItems(body.items);

    const payload = await supabaseJson("/rest/v1/rpc/commerce_create_order", {
      token: ctx.token,
      method: "POST",
      body: {
        p_tenant_id: ctx.tenant.id,
        p_store_id: storeId,
        p_client_order_key: clientOrderKey,
        p_channel: channel,
        p_items: items
      },
      mapError: commerceUpstreamError,
      ...deps
    });
    // Do not publish success based only on a 2xx RPC response. A retried
    // idempotency key must resolve to the same Tenant, Store and request.
    // If a write committed but transport evidence is malformed, the browser
    // retains the exact intent/key for safe reconciliation rather than
    // generating a replacement order with a fresh key.
    const confirmed = payload?.order;
    if (!confirmed || typeof confirmed !== "object" || Array.isArray(confirmed)
        || typeof confirmed.id !== "string" || !UUID_RE.test(confirmed.id)
        || confirmed.tenantId !== ctx.tenant.id
        || confirmed.storeId !== storeId
        || confirmed.clientOrderKey !== clientOrderKey
        || confirmed.channel !== channel
        || !["open", "paid", "voided"].includes(confirmed.status)
        || typeof confirmed.orderNumber !== "string" || !confirmed.orderNumber.trim()
        || !validReturnedTotal(confirmed.total)
        || !returnedItemsMatchIntent(payload.items, items)) {
      throw new AppHttpError(502, "SUPABASE_UPSTREAM",
        "Commerce order service returned inconsistent order evidence");
    }
    return appJson(res, 201, { tenant: ctx.tenant, ...payload });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
