import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertControlTowerValidationRegistry,
  emptyControlTowerValidationRegistry,
  summarizeControlTowerRegistry,
  upsertControlTowerValidationRecord
} from '../dist/control-tower-validation-registry.js';
import { assertControlTowerValidationRecord } from '../dist/control-tower-validation.js';

const [command, registryRaw, recordRaw] = process.argv.slice(2);
if (!command || !registryRaw || !['add', 'summary'].includes(command)) {
  console.error('Usage: node scripts/control-tower-registry.mjs <add|summary> <registry.json> [canonical-record.json]');
  process.exit(2);
}

const registryPath = resolve(registryRaw);
async function loadRegistry() {
  try {
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    assertControlTowerValidationRegistry(registry);
    return registry;
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyControlTowerValidationRegistry();
    throw error;
  }
}

if (command === 'add') {
  if (!recordRaw) throw new Error('add requires canonical-record.json');
  const record = JSON.parse(await readFile(resolve(recordRaw), 'utf8'));
  assertControlTowerValidationRecord(record);
  const next = upsertControlTowerValidationRecord(await loadRegistry(), record);
  await writeFile(registryPath, JSON.stringify(next, null, 2) + '\n');
  console.log(JSON.stringify({ registry: registryPath, records: next.records.length, added: record.id }, null, 2));
} else {
  const summary = summarizeControlTowerRegistry(await loadRegistry());
  console.log(JSON.stringify(summary, null, 2));
}
