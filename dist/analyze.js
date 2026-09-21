import { parseCsv } from "./csv.js";
import { mapHeaders } from "./mapping.js";
import { normalizeRows } from "./normalize.js";
import { computeDataHealth } from "./health.js";
import { computeCoreMetrics } from "./metrics.js";
import { detectStoreDaypartDeclines } from "./insights.js";
function validatedMapping(headers, override) {
    const mapping = { ...mapHeaders(headers), ...(override ?? {}) };
    const used = new Map();
    for (const [field, index] of Object.entries(mapping)) {
        if (index === undefined)
            continue;
        if (!Number.isInteger(index) || index < 0 || index >= headers.length)
            throw new Error(`Invalid mapping index for ${field}`);
        const prior = used.get(index);
        if (prior && prior !== field)
            throw new Error(`Column ${index} is mapped to both ${prior} and ${field}`);
        used.set(index, field);
    }
    return mapping;
}
export function analyzeCanonicalItems(items, invalidRows = 0, mapping = {}) {
    const health = computeDataHealth(items, invalidRows);
    const metrics = computeCoreMetrics(items);
    return {
        mapping,
        health,
        metrics,
        capabilities: {
            salesAnalytics: items.length > 0,
            customerRetention: metrics.identifiedCustomerCoverage >= 0.2,
            marginAnalytics: false
        },
        insights: detectStoreDaypartDeclines(items),
        items
    };
}
export function analyzeTable(rows, override, options) {
    if (rows.length < 2)
        throw new Error("Input must include a header and at least one data row");
    const mapping = validatedMapping(rows[0], override);
    const normalized = normalizeRows(rows.slice(1), mapping, options);
    return analyzeCanonicalItems(normalized.valid, normalized.invalid, mapping);
}
export function analyzeCsv(text, override, options) {
    return analyzeTable(parseCsv(text), override, options);
}
