import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertCanonicalControlTowerValidationRecord,
  emptyControlTowerValidationRegistry,
  upsertControlTowerValidationRecord
} from "../dist/control-tower-validation-registry.js";
import { summarizeControlTowerValidation } from "../dist/control-tower-validation.js";

const [command, registryRaw, recordRaw] = process.argv.slice(2);
if (!command || !registryRaw || !["add", "summary"].includes(command)) {
  console.error(
    "Usage: node scripts/control-tower-registry.mjs <add|summary> <registry.json> [canonical-record.json]"
  );
  process.exit(2);
}

const registryPath = resolve(registryRaw);

async function loadRegistry() {
  try {
    return JSON.parse(await readFile(registryPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return emptyControlTowerValidationRegistry();
    throw error;
  }
}

if (command === "add") {
  if (!recordRaw) throw new Error("add requires canonical-record.json");
  const record = JSON.parse(await readFile(resolve(recordRaw), "utf8"));
  assertCanonicalControlTowerValidationRecord(record);
  const next = upsertControlTowerValidationRecord(await loadRegistry(), record);
  await writeFile(registryPath, JSON.stringify(next, null, 2) + "\n");
  console.log(JSON.stringify({
    registry: registryPath,
    records: next.records.length,
    added: record.id
  }, null, 2));
} else {
  const registry = await loadRegistry();
  if (registry.version !== 1 || !Array.isArray(registry.records)) {
    throw new Error("Unsupported Control Tower validation registry");
  }
  for (const record of registry.records) assertCanonicalControlTowerValidationRecord(record);
  process.stdout.write(JSON.stringify(summarizeControlTowerValidation(registry.records), null, 2) + "\n");
}
