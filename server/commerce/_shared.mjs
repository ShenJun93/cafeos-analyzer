import { AppHttpError } from "../../api/_app-auth.mjs";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function strictFields(body, allowed) {
  if (Object.keys(body).some(key => !allowed.has(key))) {
    throw new AppHttpError(400, "BODY_FIELD_FORBIDDEN", "Unsupported commerce field");
  }
}

export function requiredUuid(value, code, message) {
  const normalized = String(value ?? "").trim();
  if (!UUID_RE.test(normalized)) throw new AppHttpError(400, code, message);
  return normalized;
}

export function optionalBusinessDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value).trim();
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
