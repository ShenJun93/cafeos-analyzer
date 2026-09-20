import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { analyzeFileBatch } from "../dist/batch.js";

const inputs = process.argv.slice(2).filter(x => !x.startsWith("--"));
if (!inputs.length) {
  console.error("Usage: node scripts/analyze-batch.mjs <file1.csv|xlsx> <file2...>");
  process.exit(2);
}
const files = await Promise.all(inputs.map(async input => {
  const path = resolve(input);
  return { filename: basename(path), data: new Uint8Array(await readFile(path)) };
}));
const result = analyzeFileBatch(files);
process.stdout.write(JSON.stringify({ batch: result.batch, health: result.health, metrics: result.metrics, capabilities: result.capabilities, insights: result.insights }, null, 2) + "\n");
