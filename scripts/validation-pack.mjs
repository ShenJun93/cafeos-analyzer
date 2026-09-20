import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { buildShareableValidationPack } from "../dist/validation.js";

const input = process.argv[2];
const output = process.argv[3];
const sheetArg = process.argv.find(x => x.startsWith("--sheet="));
const sheetName = sheetArg?.slice("--sheet=".length);
const key = process.env.CAFEOS_VALIDATION_HMAC_KEY;
if (!input || !output) {
  console.error("Usage: CAFEOS_VALIDATION_HMAC_KEY=<secret> node scripts/validation-pack.mjs <input.csv|xlsx> <output-dir> [--sheet=NAME]");
  process.exit(2);
}
if (!key) {
  console.error("CAFEOS_VALIDATION_HMAC_KEY is required and must be at least 16 characters.");
  process.exit(2);
}
const inputPath = resolve(input);
const outputDir = resolve(output);
const data = new Uint8Array(await readFile(inputPath));
const pack = buildShareableValidationPack(basename(inputPath), data, key, sheetName);
await mkdir(outputDir, { recursive: true });
const stem = basename(inputPath, extname(inputPath)).replace(/[^a-zA-Z0-9_-]+/g, "_") || "validation";
await writeFile(join(outputDir, `${stem}.profile.json`), JSON.stringify(pack.profile, null, 2) + "\n");
await writeFile(join(outputDir, `${stem}.analysis.json`), JSON.stringify({
  version: pack.version,
  privacyMode: pack.privacyMode,
  health: pack.health,
  metrics: pack.metrics,
  capabilities: pack.capabilities,
  insights: pack.insights
}, null, 2) + "\n");
await writeFile(join(outputDir, `${stem}.sanitized.csv`), pack.sanitizedCanonicalCsv);
console.log(`Wrote shareable validation pack to ${outputDir}`);
