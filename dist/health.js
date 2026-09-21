import { computeCoreMetrics, orderIdentity } from "./metrics.js";
export function computeDataHealth(items, invalidRows) {
    const seen = new Set();
    let duplicates = 0;
    for (const x of items) {
        const key = `${orderIdentity(x)}|${x.product}|${x.quantity}|${x.netAmount}`;
        if (seen.has(key))
            duplicates++;
        else
            seen.add(key);
    }
    const metrics = computeCoreMetrics(items);
    return { rows: items.length, invalidRows, duplicateRows: duplicates, customerOrderCoverage: metrics.identifiedCustomerCoverage };
}
