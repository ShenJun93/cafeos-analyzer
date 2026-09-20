import { performance } from "node:perf_hooks";
import { analyzeCsv } from "../dist/analyze.js";

const n = 100_000;
const lines = ["occurred_at,transaction_id,store,product,quantity,net_amount,customer_phone"];
for (let i = 0; i < n; i++) {
  const store = `Q${(i % 5) + 1}`;
  const day = String((i % 28) + 1).padStart(2, "0");
  const hour = String(7 + (i % 14)).padStart(2, "0");
  const phone = i % 2 === 0 ? `000${String(i).padStart(7, "0")}` : "";
  lines.push(`2026-08-${day}T${hour}:00:00Z,O-${i},${store},Latte,1,50000,${phone}`);
}
const csv = lines.join("\n");
const started = performance.now();
const result = analyzeCsv(csv);
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({
  rows: result.health.rows,
  orders: result.metrics.orders,
  netSales: result.metrics.netSales,
  inputMiB: Number((Buffer.byteLength(csv) / 1024 / 1024).toFixed(1)),
  elapsedMs: Math.round(elapsedMs)
}, null, 2));
