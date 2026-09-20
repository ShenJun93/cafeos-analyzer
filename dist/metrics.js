export function computeCoreMetrics(items) {
    const orders = new Map();
    const customerOrders = new Map();
    let netSales = 0;
    for (const item of items) {
        netSales += item.netAmount;
        const prior = orders.get(item.transactionId);
        orders.set(item.transactionId, { customer: prior?.customer ?? item.customerKey });
        if (item.customerKey) {
            const set = customerOrders.get(item.customerKey) ?? new Set();
            set.add(item.transactionId);
            customerOrders.set(item.customerKey, set);
        }
    }
    const orderCount = orders.size;
    const identifiedOrders = [...orders.values()].filter(o => o.customer).length;
    const identifiedCustomers = customerOrders.size;
    const repeatCustomers = [...customerOrders.values()].filter(s => s.size >= 2).length;
    return {
        netSales,
        orders: orderCount,
        aov: orderCount ? netSales / orderCount : 0,
        identifiedOrders,
        identifiedCustomerCoverage: orderCount ? identifiedOrders / orderCount : 0,
        identifiedCustomers,
        repeatCustomers,
        repeatRate: identifiedCustomers ? repeatCustomers / identifiedCustomers : 0
    };
}
