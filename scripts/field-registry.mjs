import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertCanonicalValidationRecord, emptyValidationRegistry, upsertValidationRecord } from '../dist/validation-registry.js';
import { evaluateFieldValidation } from '../dist/validation-gates.js';

const [command, registryRaw, recordRaw] = process.argv.slice(2);
if (!command || !registryRaw || !['add','score'].includes(command)) {
  console.error('Usage: node scripts/field-registry.mjs <add|score> <registry.json> [canonical-record.json]');
  process.exit(2);
}
const registryPath = resolve(registryRaw);
async function loadRegistry() {
  try { return JSON.parse(await readFile(registryPath, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return emptyValidationRegistry();
    throw error;
  }
}
if (command === 'add') {
  if (!recordRaw) throw new Error('add requires canonical-record.json');
  const record = JSON.parse(await readFile(resolve(recordRaw), 'utf8'));
  assertCanonicalValidationRecord(record);
  const next = upsertValidationRecord(await loadRegistry(), record);
  await writeFile(registryPath, JSON.stringify(next, null, 2) + '\n');
  console.log(JSON.stringify({ registry: registryPath, records: next.records.length, added: record.id }, null, 2));
} else {
  const registry = await loadRegistry();
  for (const record of registry.records ?? []) assertCanonicalValidationRecord(record);
  console.log(JSON.stringify(evaluateFieldValidation(registry.records ?? []), null, 2));
}
