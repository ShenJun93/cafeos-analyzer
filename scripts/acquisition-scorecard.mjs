import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { acquisitionBreakdown, summarizeAcquisitionFunnel } from '../dist/acquisition.js';
import { evaluateFieldValidation } from '../dist/validation-gates.js';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/acquisition-scorecard.mjs <evidence.json>');
  process.exit(2);
}
const payload = JSON.parse(await readFile(resolve(input), 'utf8'));
const events = Array.isArray(payload.events) ? payload.events : [];
const records = Array.isArray(payload.records) ? payload.records : [];
process.stdout.write(JSON.stringify({
  acquisition: summarizeAcquisitionFunnel(events),
  sources: acquisitionBreakdown(events),
  fieldValidation: evaluateFieldValidation(records)
}, null, 2) + '\n');
