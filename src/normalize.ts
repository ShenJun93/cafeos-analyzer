import type { CanonicalField, CanonicalLineItem } from "./types.js";

function numberFrom(value: string): number {
  const raw = value.trim().replace(/[₫đ\s]/gi, "");
  if (!raw) return Number.NaN;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ""));
  if (/^-?\d{1,3}(,\d{3})+$/.test(raw)) return Number(raw.replace(/,/g, ""));
  return Number(raw.replace(/,/g, ""));
}

function dateFrom(value: string): Date | null {
  const raw = value.trim();
  const vn = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (vn) {
    const [, dd, mm, yy, hh = "0", min = "0", ss = "0"] = vn;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === Number(mm) - 1 && d.getUTCDate() === Number(dd)) return d;
    return null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.valueOf()) ? null : d;
}

export function normalizeRows(
  rows: string[][],
  mapping: Partial<Record<CanonicalField, number>>
): { valid: CanonicalLineItem[]; invalid: number } {
  const required: CanonicalField[] = ["transaction_id", "occurred_at", "store", "product", "quantity", "net_amount"];
  for (const field of required) if (mapping[field] === undefined) throw new Error(`Missing required mapping: ${field}`);

  const valid: CanonicalLineItem[] = [];
  let invalid = 0;
  for (const row of rows) {
    const get = (field: CanonicalField) => row[mapping[field] as number]?.trim() ?? "";
    const quantity = numberFrom(get("quantity"));
    const netAmount = numberFrom(get("net_amount"));
    const parsedDate = dateFrom(get("occurred_at"));
    const requiredStrings = [get("transaction_id"), get("store"), get("product")];
    if (requiredStrings.some(v => !v) || !Number.isFinite(quantity) || !Number.isFinite(netAmount) || !parsedDate) {
      invalid++; continue;
    }
    const rawCustomer = mapping.customer_phone === undefined ? "" : get("customer_phone");
    const phoneLike = /^[+()\d.\-\s]+$/.test(rawCustomer);
    const customerKey = rawCustomer ? (phoneLike ? rawCustomer.replace(/\D/g, "") : rawCustomer) : "";
    valid.push({
      transactionId: get("transaction_id"),
      occurredAt: parsedDate.toISOString(),
      store: get("store"),
      product: get("product"),
      quantity,
      netAmount,
      customerKey: customerKey || undefined
    });
  }
  return { valid, invalid };
}
