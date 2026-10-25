import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { finalizeControlTowerValidationDraft } from "../dist/control-tower-validation.js";
import { assertCanonicalControlTowerValidationRecord } from "../dist/control-tower-validation-registry.js";

const [draftRaw, outputRaw] = process.argv.slice(2);
if (!draftRaw || !outputRaw) {
  console.error("Usage: node scripts/control-tower-finalize.mjs <draft.json> <canonical-record.json>");
  process.exit(2);
}

const draft = JSON.parse(await readFile(resolve(draftRaw), "utf8"));
const record = finalizeControlTowerValidationDraft(draft);
assertCanonicalControlTowerValidationRecord(record);

const output = resolve(outputRaw);
await writeFile(output, JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify({
  canonicalRecord: output,
  id: record.id,
  targetIcp: record.targetIcp,
  evidenceProvenance: record.evidenceProvenance
}, null, 2));
