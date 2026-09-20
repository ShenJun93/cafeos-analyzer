function daypart(date) {
    const hour = date.getUTCHours();
    if (hour < 11)
        return "morning";
    if (hour < 17)
        return "afternoon";
    return "evening";
}
function dayKey(date) { return date.toISOString().slice(0, 10); }
export function detectStoreDaypartDeclines(items, threshold = -0.2) {
    const buckets = new Map();
    for (const item of items) {
        const d = new Date(item.occurredAt);
        const key = `${item.store}|${daypart(d)}|${dayKey(d)}`;
        const b = buckets.get(key) ?? { sales: 0, orders: new Set() };
        b.sales += item.netAmount;
        b.orders.add(item.transactionId);
        buckets.set(key, b);
    }
    const groups = new Map();
    for (const [key, value] of buckets) {
        const [store, part, date] = key.split("|");
        const g = groups.get(`${store}|${part}`) ?? [];
        g.push({ date, sales: value.sales, orders: value.orders.size });
        groups.set(`${store}|${part}`, g);
    }
    const result = [];
    for (const [key, points] of groups) {
        if (points.length < 5)
            continue;
        points.sort((a, b) => a.date.localeCompare(b.date));
        const current = points.at(-1);
        const baselinePoints = points.slice(-5, -1);
        const baselineSales = baselinePoints.reduce((s, p) => s + p.sales, 0) / baselinePoints.length;
        const baselineOrders = baselinePoints.reduce((s, p) => s + p.orders, 0) / baselinePoints.length;
        const salesDeltaPct = baselineSales ? current.sales / baselineSales - 1 : 0;
        if (salesDeltaPct > threshold)
            continue;
        const orderDeltaPct = baselineOrders ? current.orders / baselineOrders - 1 : 0;
        const [store, part] = key.split("|");
        result.push({
            type: "STORE_DAYPART_SALES_DECLINE",
            severity: salesDeltaPct <= -0.3 ? "high" : "medium",
            store, daypart: part,
            currentSales: current.sales, baselineSales, salesDeltaPct,
            currentOrders: current.orders, baselineOrders, orderDeltaPct,
            evidenceDates: baselinePoints.map(p => p.date).concat(current.date)
        });
    }
    return result.sort((a, b) => a.salesDeltaPct - b.salesDeltaPct);
}
