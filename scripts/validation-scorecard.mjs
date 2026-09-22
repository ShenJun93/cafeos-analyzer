import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertCanonicalValidationRecord } from "../dist/validation-registry.js";
import { evaluateFieldValidation } from "../dist/validation-gates.js";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/validation-scorecard.mjs <records.json>");
  process.exit(2);
}
const records = JSON.parse(await readFile(resolve(input), "utf8"));
if (!Array.isArray(records)) throw new Error("Validation records JSON must be an array");
for (const record of records) assertCanonicalValidationRecord(record);
process.stdout.write(JSON.stringify(evaluateFieldValidation(records), null, 2) + "\n");
