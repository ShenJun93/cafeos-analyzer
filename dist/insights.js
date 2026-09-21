import { orderIdentity } from "./metrics.js";
import { daypartForInstant, localBusinessClock, previousSameWeekdayDates } from "./time.js";
function itemTimezone(item) {
    return item.storeTimezone ?? item.sourceTimezone ?? "UTC";
}
export function detectStoreDaypartDeclines(items, threshold = -0.2) {
    const buckets = new Map();
    for (const item of items) {
        const timezone = itemTimezone(item);
        const local = localBusinessClock(item.occurredAt, timezone);
        const part = daypartForInstant(item.occurredAt, timezone);
        const key = `${item.store}|${part}|${local.date}`;
        const bucket = buckets.get(key) ?? { sales: 0, orders: new Set() };
        bucket.sales += item.netAmount;
        bucket.orders.add(orderIdentity(item));
        buckets.set(key, bucket);
    }
    const groups = new Map();
    for (const [key, value] of buckets) {
        const [store, part, date] = key.split("|");
        const group = groups.get(`${store}|${part}`) ?? [];
        group.push({ date, sales: value.sales, orders: value.orders.size });
        groups.set(`${store}|${part}`, group);
    }
    const result = [];
    for (const [key, points] of groups) {
        if (points.length < 5)
            continue;
        points.sort((a, b) => a.date.localeCompare(b.date));
        const current = points.at(-1);
        const byDate = new Map(points.map(point => [point.date, point]));
        const requiredBaselineDates = previousSameWeekdayDates(current.date, 4);
        const baselinePoints = requiredBaselineDates.map(date => byDate.get(date));
        if (baselinePoints.some(point => !point))
            continue;
        const readyBaseline = baselinePoints;
        const baselineSales = readyBaseline.reduce((sum, point) => sum + point.sales, 0) / readyBaseline.length;
        const baselineOrders = readyBaseline.reduce((sum, point) => sum + point.orders, 0) / readyBaseline.length;
        const salesDeltaPct = baselineSales ? current.sales / baselineSales - 1 : 0;
        if (salesDeltaPct > threshold)
            continue;
        const orderDeltaPct = baselineOrders ? current.orders / baselineOrders - 1 : 0;
        const [store, part] = key.split("|");
        result.push({
            type: "STORE_DAYPART_SALES_DECLINE",
            severity: salesDeltaPct <= -0.3 ? "high" : "medium",
            store,
            daypart: part,
            currentSales: current.sales,
            baselineSales,
            salesDeltaPct,
            currentOrders: current.orders,
            baselineOrders,
            orderDeltaPct,
            evidenceDates: [...requiredBaselineDates].reverse().concat(current.date)
        });
    }
    return result.sort((a, b) => a.salesDeltaPct - b.salesDeltaPct);
}
