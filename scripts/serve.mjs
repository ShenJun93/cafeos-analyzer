import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { analyzeBytes, inspectBytes } from "../dist/file.js";
import { buildCompatibilityProfile } from "../dist/validation.js";
import { inspectXlsx } from "../dist/xlsx.js";

const PORT = Number(process.env.PORT ?? 4173);
const MAX_BYTES = 20 * 1024 * 1024;
const indexHtml = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const freeAnalyzerHtml = await readFile(new URL("../web/free-analyzer.html", import.meta.url), "utf8");
const sampleReportHtml = await readFile(new URL("../web/sample-report.html", import.meta.url), "utf8");
const feedbackHtml = await readFile(new URL("../web/feedback.html", import.meta.url), "utf8");

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw Object.assign(new Error("File exceeds 20MB limit"), { status: 413 });
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(indexHtml);
    }
    if (req.method === "GET" && url.pathname === "/free-cafe-sales-analyzer") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(freeAnalyzerHtml);
    }
    if (req.method === "GET" && url.pathname === "/sample-report") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(sampleReportHtml);
    }
    if (req.method === "GET" && url.pathname === "/feedback") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(feedbackHtml);
    }
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, service: "cafeos-analyzer", persistence: "none", maxUploadBytes: MAX_BYTES });
    if (req.method === "POST" && url.pathname === "/api/inspect") {
      const filename = url.searchParams.get("filename") ?? "upload.csv";
      const data = await body(req);
      return json(res, 200, inspectBytes(filename, data));
    }
    if (req.method === "POST" && url.pathname === "/api/profile") {
      const filename = url.searchParams.get("filename") ?? "upload.csv";
      const data = await body(req);
      return json(res, 200, buildCompatibilityProfile(filename, data));
    }
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const filename = url.searchParams.get("filename") ?? "upload.csv";
      const sheet = url.searchParams.get("sheet") ?? undefined;
      const mappingRaw = url.searchParams.get("mapping");
      let mapping;
      if (mappingRaw) {
        try { mapping = JSON.parse(mappingRaw); }
        catch { return json(res, 400, { error: "Invalid mapping JSON" }); }
      }
      const data = await body(req);
      if (extname(filename).toLowerCase() === ".xlsx" && !sheet) {
        const inspection = inspectXlsx(data);
        if (inspection.ambiguous) return json(res, 409, { code: "AMBIGUOUS_SHEETS", workbook: inspection });
      }
      const result = analyzeBytes(filename, data, sheet, mapping);
      const { items, ...safeResult } = result;
      return json(res, 200, { ...safeResult, itemCount: items.length });
    }
    json(res, 404, { error: "Not found" });
  } catch (error) {
    const status = Number(error?.status ?? 422);
    json(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`CafeOS validation UI: http://127.0.0.1:${PORT}`));
