import { sourceScopedOrderIdentity } from "./metrics.js";
import { assertIanaTimeZone, businessDate, daypartForInstant } from "./time.js";
import type { CanonicalLineItem, Insight } from "./types.js";

export interface InsightTimeOptions {
  defaultStoreTimezone: string;
  storeTimezones?: Readonly<Record<string, string>>;
}

function priorWeekDate(date: string, weeks: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (weeks * 7));
  return d.toISOString().slice(0, 10);
}

export function detectStoreDaypartDeclines(
  items: CanonicalLineItem[],
  threshold = -0.2,
  options: InsightTimeOptions = { defaultStoreTimezone: "UTC" }
): Insight[] {
  const defaultStoreTimezone = assertIanaTimeZone(options.defaultStoreTimezone);
  const storeZones = new Map<string, string>();
  const timezoneForStore = (store: string): string => {
    const cached = storeZones.get(store);
    if (cached) return cached;
    const zone = assertIanaTimeZone(options.storeTimezones?.[store] ?? defaultStoreTimezone);
    storeZones.set(store, zone);
    return zone;
  };

  const buckets = new Map<string, { store: string; part: string; date: string; sales: number; orders: Set<string> }>();
  for (const item of items) {
    const zone = timezoneForStore(item.store);
    const date = businessDate(item.occurredAt, zone);
    const part = daypartForInstant(item.occurredAt, zone);
    const key = JSON.stringify([item.store, part, date]);
    const b = buckets.get(key) ?? { store: item.store, part, date, sales: 0, orders: new Set<string>() };
    b.sales += item.netAmount;
    b.orders.add(sourceScopedOrderIdentity(item));
    buckets.set(key, b);
  }

  const groups = new Map<string, { date: string; sales: number; orders: number }[]>();
  for (const value of buckets.values()) {
    const key = JSON.stringify([value.store, value.part]);
    const g = groups.get(key) ?? [];
    g.push({ date: value.date, sales: value.sales, orders: value.orders.size });
    groups.set(key, g);
  }

  const result: Insight[] = [];
  for (const [key, points] of groups) {
    if (points.length < 5) continue;
    points.sort((a, b) => a.date.localeCompare(b.date));
    const current = points.at(-1)!;
    const byDate = new Map(points.map(point => [point.date, point]));
    const baselineDates = [4, 3, 2, 1].map(weeks => priorWeekDate(current.date, weeks));
    const baselinePoints = baselineDates.map(date => byDate.get(date));
    if (baselinePoints.some(point => !point)) continue;
    const readyBaseline = baselinePoints as { date: string; sales: number; orders: number }[];

    const baselineSales = readyBaseline.reduce((s, p) => s + p.sales, 0) / readyBaseline.length;
    const baselineOrders = readyBaseline.reduce((s, p) => s + p.orders, 0) / readyBaseline.length;
    const salesDeltaPct = baselineSales ? current.sales / baselineSales - 1 : 0;
    if (salesDeltaPct > threshold) continue;
    const orderDeltaPct = baselineOrders ? current.orders / baselineOrders - 1 : 0;
    const [store, part] = JSON.parse(key) as [string, string];
    result.push({
      type: "STORE_DAYPART_SALES_DECLINE",
      severity: salesDeltaPct <= -0.3 ? "high" : "medium",
      store, daypart: part,
      currentSales: current.sales, baselineSales, salesDeltaPct,
      currentOrders: current.orders, baselineOrders, orderDeltaPct,
      evidenceDates: baselineDates.concat(current.date)
    });
  }
  return result.sort((a, b) => a.salesDeltaPct - b.salesDeltaPct);
}
