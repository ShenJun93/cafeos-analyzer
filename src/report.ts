import type { FileAnalysisResult } from "./file.js";
import type { Insight, WorkbookAnalysisResult } from "./types.js";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function money(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value) + " ₫";
}

function pct(value: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function insightCard(x: Insight): string {
  return `<article class="card insight ${x.severity}">
    <div class="eyebrow">${esc(x.severity.toUpperCase())} · ${esc(x.type)}</div>
    <h3>${esc(x.store)} · ${esc(x.daypart)}</h3>
    <div class="delta">${pct(x.salesDeltaPct)}</div>
    <p>Net sales ${money(x.currentSales)} vs baseline ${money(x.baselineSales)}.</p>
    <p>Orders ${x.currentOrders} vs baseline ${x.baselineOrders.toFixed(1)} (${pct(x.orderDeltaPct)}).</p>
    <details><summary>Evidence</summary><code>${esc(x.evidenceDates.join(", "))}</code></details>
  </article>`;
}

export function renderHtmlReport(result: FileAnalysisResult, title = "CafeOS Analyzer"): string {
  const workbook = "workbook" in result ? result as WorkbookAnalysisResult : undefined;
  const m = result.metrics;
  const h = result.health;
  const workbookBlock = workbook ? `<section>
    <h2>Workbook</h2>
    <div class="card"><strong>Selected:</strong> ${esc(workbook.workbook.selectedSheet)}
    <span class="muted">(${esc(workbook.workbook.selectionSource)})</span>
    <table><thead><tr><th>Sheet</th><th>Rows</th><th>Required mapped</th><th>Optional</th></tr></thead><tbody>
    ${workbook.workbook.sheets.map(s => `<tr><td>${esc(s.name)}</td><td>${s.rowCount}</td><td>${s.mappedRequired}/6</td><td>${s.mappedOptional}</td></tr>`).join("")}
    </tbody></table></div>
  </section>` : "";
  const insights = result.insights.length
    ? result.insights.map(insightCard).join("")
    : `<div class="card"><p>No material store/daypart decline detected by v0.1 rules.</p></div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#18181b;background:#f5f5f4}body{margin:0}.wrap{max-width:1100px;margin:auto;padding:32px 20px 80px}
  h1{font-size:32px;margin:0 0 4px}h2{margin-top:34px}.muted{color:#71717a}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}.card{background:white;border:1px solid #e4e4e7;border-radius:14px;padding:18px;box-shadow:0 1px 2px #00000008}.metric b{font-size:26px;display:block;margin-top:5px}.eyebrow{font-size:12px;font-weight:700;color:#71717a}.delta{font-size:30px;font-weight:800}.insight.high{border-left:5px solid #991b1b}.insight.medium{border-left:5px solid #a16207}.ok{color:#166534}.off{color:#991b1b}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{text-align:left;border-bottom:1px solid #e4e4e7;padding:9px 6px;font-size:14px}code{white-space:normal}details{margin-top:10px}
  </style></head><body><main class="wrap"><h1>${esc(title)}</h1><p class="muted">Deterministic metrics first. Insights expose their baseline evidence.</p>
  <section><h2>Executive metrics</h2><div class="grid">
    <div class="card metric"><span>Net sales</span><b>${money(m.netSales)}</b></div>
    <div class="card metric"><span>Orders</span><b>${m.orders}</b></div>
    <div class="card metric"><span>AOV</span><b>${money(m.aov)}</b></div>
    <div class="card metric"><span>Customer ID coverage</span><b>${pct(m.identifiedCustomerCoverage)}</b></div>
    <div class="card metric"><span>Repeat rate</span><b>${pct(m.repeatRate)}</b></div>
  </div></section>
  <section><h2>Data health</h2><div class="grid">
    <div class="card metric"><span>Valid rows</span><b>${h.rows}</b></div>
    <div class="card metric"><span>Invalid rows</span><b>${h.invalidRows}</b></div>
    <div class="card metric"><span>Exact duplicates</span><b>${h.duplicateRows}</b></div>
    <div class="card"><strong>Capabilities</strong><p class="${result.capabilities.salesAnalytics ? "ok" : "off"}">Sales analytics: ${result.capabilities.salesAnalytics ? "READY" : "OFF"}</p><p class="${result.capabilities.customerRetention ? "ok" : "off"}">Customer retention: ${result.capabilities.customerRetention ? "READY" : "DISABLED"}</p><p class="off">Margin analytics: DISABLED</p></div>
  </div></section>
  ${workbookBlock}
  <section><h2>Attention</h2><div class="grid">${insights}</div></section>
  </main></body></html>`;
}
