import { AppHttpError } from "../../api/_app-auth.mjs";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function strictFields(body, allowed) {
  if (Object.keys(body).some(key => !allowed.has(key))) {
    throw new AppHttpError(400, "BODY_FIELD_FORBIDDEN", "Unsupported commerce field");
  }
}

export function requiredUuid(value, code, message) {
  // A one-element JSON array stringifies to its member. Never let an array or
  // object silently become a valid Store or Order id in a money-moving RPC.
  if (typeof value !== "string") throw new AppHttpError(400, code, message);
  const normalized = value.trim();
  if (!UUID_RE.test(normalized)) throw new AppHttpError(400, code, message);
  // PostgreSQL UUID output is canonical lowercase. Normalize once before
  // constructing RPC bodies and comparing commit/recovery acknowledgements.
  return normalized.toLowerCase();
}

export function optionalBusinessDate(value) {
  if (value === undefined || value === null || value === "") return null;
  // Query parameters arrive as strings; JSON body fields must be strings too.
  if (typeof value !== "string") {
    throw new AppHttpError(400, "BUSINESS_DATE_INVALID", "Invalid business date");
  }
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppHttpError(400, "BUSINESS_DATE_INVALID", "Invalid business date");
  }
  const parsed = new Date(raw + "T00:00:00.000Z");
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new AppHttpError(400, "BUSINESS_DATE_INVALID", "Invalid business date");
  }
  return raw;
}

export function commerceUpstreamError({ payload }) {
  const message = String(payload?.message ?? payload?.error ?? "").trim();
  const code = /^COMMERCE_[A-Z0-9_]+$/.test(message) ? message : null;
  if (!code) return null;

  if (code.endsWith("_ROLE_FORBIDDEN") || code === "COMMERCE_ROLE_FORBIDDEN") {
    return new AppHttpError(403, code, "Commerce role does not allow this operation");
  }
  if (code.endsWith("_NOT_FOUND")) {
    return new AppHttpError(404, code, "Commerce object was not found in this tenant");
  }
  if ([
    "COMMERCE_IDEMPOTENCY_CONFLICT",
    "COMMERCE_DAY_CLOSED",
    "COMMERCE_ORDER_NOT_OPEN",
    "COMMERCE_CLOSE_OPEN_ORDERS"
  ].includes(code)) {
    return new AppHttpError(409, code, "Commerce state conflict");
  }
  return new AppHttpError(400, code, "Commerce request was rejected");
}

// Read-only financial proof of values returned by Commerce SQL RPCs. SQL
// NUMERIC can arrive from PostgREST as a number or decimal string. Never
// accept NaN, exponent notation, negative amounts, or hidden sub-cent values.
export function commerceReturnedCents(value) {
  if ((typeof value !== "number" && typeof value !== "string")
      || (typeof value === "number" && !Number.isFinite(value))) return null;
  const match = /^(0|[1-9][0-9]{0,15})(?:[.]([0-9]{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n
    + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents <= 100000000000000n ? cents : null;
}

// These read-only browse rows are presented to cashiers before recovering an
// open order or reprinting a paid receipt. Validate the entire 21-row page,
// including the lookahead row, rather than publishing a plausible 20-row prefix.
// Caller-supplied tenant/store filters are necessary but not sufficient proof.
function validCommerceListTimestamp(value) {
  return typeof value === "string"
    && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:[.]\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function validCommerceListDate(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validCommerceOrderListRow(row, { tenantId, storeId, status }) {
  if (!row || typeof row !== "object" || Array.isArray(row)
      || typeof row.id !== "string" || !UUID_RE.test(row.id)
      || row.tenant_id !== tenantId
      || row.store_id !== storeId || row.status !== status
      || typeof row.order_number !== "string"
      || !row.order_number.trim() || row.order_number.length > 100) return false;
  const cents = commerceReturnedCents(row.total);
  if (cents === null || cents <= 0n) return false;
  if (status === "open") {
    return validCommerceListTimestamp(row.created_at)
      && ["counter", "takeaway", "pickup", "delivery"].includes(row.channel);
  }
  return status === "paid" && validCommerceListTimestamp(row.paid_at)
    && validCommerceListDate(row.business_date);
}

export function commerceReturnedCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 0 && value <= 2147483647;
}

// Decimal validation must not multiply binary floats by 100. Valid inputs such
// as 0.29 / 2.55 are not always exactly representable in IEEE-754.
export function parseCommerceMoney(value, { code, message, max, allowZero = false }) {
  if ((typeof value !== "number" && typeof value !== "string")
      || (typeof value === "number" && !Number.isFinite(value))) {
    throw new AppHttpError(400, code, message);
  }
  const decimal = String(value).trim();
  if (!/^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$/.test(decimal)) {
    throw new AppHttpError(400, code, message);
  }
  const amount = Number(decimal);
  if (!Number.isFinite(amount) || amount > max || (!allowZero && amount <= 0)) {
    throw new AppHttpError(400, code, message);
  }
  return amount;
}
