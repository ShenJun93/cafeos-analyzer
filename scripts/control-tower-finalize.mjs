import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { finalizeControlTowerValidationDraft } from '../dist/control-tower-validation.js';

const [draftRaw, answersRaw, outputRaw] = process.argv.slice(2);
if (!draftRaw || !answersRaw || !outputRaw) {
  console.error('Usage: node scripts/control-tower-finalize.mjs <draft.json> <answers.json> <canonical.json>');
  process.exit(2);
}

const draft = JSON.parse(await readFile(resolve(draftRaw), 'utf8'));
const answers = JSON.parse(await readFile(resolve(answersRaw), 'utf8'));
const record = finalizeControlTowerValidationDraft(draft, answers);
await writeFile(resolve(outputRaw), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({
  id: record.id,
  targetIcp: record.targetIcp,
  evidenceProvenance: record.evidenceProvenance,
  canonical: resolve(outputRaw)
}, null, 2));
