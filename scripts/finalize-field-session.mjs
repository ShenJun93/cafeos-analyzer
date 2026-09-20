import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { finalizeInboundValidationDraft } from '../dist/acquisition.js';

const [draftPathRaw, answersPathRaw, outputRaw] = process.argv.slice(2);
if (!draftPathRaw || !answersPathRaw || !outputRaw) {
  console.error('Usage: node scripts/finalize-field-session.mjs <validation-record.draft.json> <answers.json> <output.json>');
  process.exit(2);
}
const draft = JSON.parse(await readFile(resolve(draftPathRaw), 'utf8'));
const answers = JSON.parse(await readFile(resolve(answersPathRaw), 'utf8'));
const record = finalizeInboundValidationDraft(draft, answers);
await writeFile(resolve(outputRaw), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ id: record.id, targetIcp: record.targetIcp, output: resolve(outputRaw) }, null, 2));
