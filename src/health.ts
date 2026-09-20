import type { CanonicalLineItem, DataHealth } from "./types.js";
import { computeCoreMetrics } from "./metrics.js";

export function computeDataHealth(items: CanonicalLineItem[], invalidRows: number): DataHealth {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const x of items) {
    const key = `${x.transactionId}|${x.product}|${x.quantity}|${x.netAmount}`;
    if (seen.has(key)) duplicates++; else seen.add(key);
  }
  const metrics = computeCoreMetrics(items);
  return { rows: items.length, invalidRows, duplicateRows: duplicates, customerOrderCoverage: metrics.identifiedCustomerCoverage };
}
