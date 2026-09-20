import { readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { analyzeBytes } from "../dist/file.js";
import { renderHtmlReport } from "../dist/report.js";

const args = process.argv.slice(2);
if (!args[0]) {
  console.error("Usage: node scripts/analyze-file.mjs <file.csv|file.xlsx> [--sheet NAME] [--out report.html]");
  process.exit(2);
}
const file = args[0];
const sheetIndex = args.indexOf("--sheet");
const outIndex = args.indexOf("--out");
const sheet = sheetIndex >= 0 ? args[sheetIndex + 1] : undefined;
const out = outIndex >= 0 ? args[outIndex + 1] : `${basename(file, extname(file))}.report.html`;
const data = new Uint8Array(await readFile(file));
const result = analyzeBytes(file, data, sheet);
await writeFile(out, renderHtmlReport(result, `CafeOS · ${basename(file)}`), "utf8");
console.log(JSON.stringify({
  file,
  out,
  rows: result.health.rows,
  orders: result.metrics.orders,
  netSales: result.metrics.netSales,
  insights: result.insights.length,
  selectedSheet: "workbook" in result ? result.workbook.selectedSheet : undefined
}, null, 2));
