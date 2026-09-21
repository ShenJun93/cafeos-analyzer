import { assertValidTimeZone, parseSourceTimestamp } from "./time.js";
function numberFrom(value) {
    const raw = value.trim().replace(/[₫đ\s]/gi, "");
    if (!raw)
        return Number.NaN;
    if (/^-?\d{1,3}(\.\d{3})+$/.test(raw))
        return Number(raw.replace(/\./g, ""));
    if (/^-?\d{1,3}(,\d{3})+$/.test(raw))
        return Number(raw.replace(/,/g, ""));
    return Number(raw.replace(/,/g, ""));
}
export function normalizeRows(rows, mapping, options = {}) {
    const required = ["transaction_id", "occurred_at", "store", "product", "quantity", "net_amount"];
    for (const field of required)
        if (mapping[field] === undefined)
            throw new Error(`Missing required mapping: ${field}`);
    const sourceTimezone = assertValidTimeZone(options.sourceTimezone ?? "UTC");
    const sourceNamespace = String(options.sourceNamespace ?? "analyzer-single-source").trim() || "analyzer-single-source";
    const defaultStoreTimezone = assertValidTimeZone(options.defaultStoreTimezone ?? sourceTimezone);
    const valid = [];
    let invalid = 0;
    for (const row of rows) {
        const get = (field) => row[mapping[field]]?.trim() ?? "";
        const quantity = numberFrom(get("quantity"));
        const netAmount = numberFrom(get("net_amount"));
        const parsedDate = parseSourceTimestamp(get("occurred_at"), sourceTimezone);
        const requiredStrings = [get("transaction_id"), get("store"), get("product")];
        if (requiredStrings.some(v => !v) || !Number.isFinite(quantity) || !Number.isFinite(netAmount) || !parsedDate) {
            invalid++;
            continue;
        }
        const store = get("store");
        const storeTimezone = assertValidTimeZone(options.storeTimezones?.[store] ?? defaultStoreTimezone);
        const rawCustomer = mapping.customer_phone === undefined ? "" : get("customer_phone");
        const phoneLike = /^[+()\d.\-\s]+$/.test(rawCustomer);
        const customerKey = rawCustomer ? (phoneLike ? rawCustomer.replace(/\D/g, "") : rawCustomer) : "";
        valid.push({
            transactionId: get("transaction_id"),
            occurredAt: parsedDate.toISOString(),
            sourceNamespace,
            sourceTimezone,
            storeTimezone,
            store,
            product: get("product"),
            quantity,
            netAmount,
            customerKey: customerKey || undefined
        });
    }
    return { valid, invalid };
}
