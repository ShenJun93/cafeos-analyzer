import { readFile } from "node:fs/promises";
import { analyzeCsv } from "../dist/analyze.js";

const path = process.argv[2];
if (!path) throw new Error("Usage: node scripts/analyze-fixture.mjs <csv-path>");
const text = await readFile(path, "utf8");
const result = analyzeCsv(text);
console.log(JSON.stringify({ mapping: result.mapping, health: result.health, metrics: result.metrics, insights: result.insights }, null, 2));
