import { readFile } from "node:fs/promises";

const baseUrl = (process.argv[2] ?? "https://cafeos-analyzer.vercel.app").replace(/\/$/, "");

async function getOk(path) {
  const response = await fetch(baseUrl + path, { redirect: "follow" });
  if (response.status !== 200) throw new Error(`GET ${path} expected 200, got ${response.status}`);
  console.log(`PASS GET ${path} -> 200`);
  return response;
}

await getOk("/");
await getOk("/analyzer");

const healthResponse = await getOk("/api/health");
const health = await healthResponse.json();
if (health.mode !== "public-validation") throw new Error(`health mode mismatch: ${health.mode}`);
if (health.persistence !== "none") throw new Error(`health persistence mismatch: ${health.persistence}`);
if (health.maxUploadBytes !== 4 * 1024 * 1024) throw new Error(`health upload limit mismatch: ${health.maxUploadBytes}`);
console.log("PASS health contract");

const fixture = await readFile(new URL("../fixtures/known-anomaly.csv", import.meta.url));
const analyzeResponse = await fetch(baseUrl + "/api/analyze?filename=known-anomaly.csv", {
  method: "POST",
  headers: { "content-type": "application/octet-stream" },
  body: fixture
});
if (analyzeResponse.status !== 200) {
  throw new Error(`POST /api/analyze expected 200, got ${analyzeResponse.status}: ${await analyzeResponse.text()}`);
}
const analysis = await analyzeResponse.json();
if (analysis.metrics?.orders !== 97) throw new Error(`orders mismatch: ${analysis.metrics?.orders}`);
if (analysis.metrics?.netSales !== 4_850_000) throw new Error(`netSales mismatch: ${analysis.metrics?.netSales}`);
if (analysis.itemCount !== 97) throw new Error(`itemCount mismatch: ${analysis.itemCount}`);
console.log("PASS live known fixture -> 97 orders / 4,850,000 VND / 97 items");

const oversized = new Uint8Array(4 * 1024 * 1024 + 1);
const oversizedResponse = await fetch(baseUrl + "/api/inspect?filename=too-large.csv", {
  method: "POST",
  headers: { "content-type": "application/octet-stream" },
  body: oversized
});
if (oversizedResponse.status !== 413) {
  throw new Error(`oversized request expected 413, got ${oversizedResponse.status}: ${await oversizedResponse.text()}`);
}
console.log("PASS >4 MiB request -> 413");

console.log(`LIVE VERIFY PASS ${baseUrl}`);
