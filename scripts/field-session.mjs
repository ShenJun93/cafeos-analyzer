import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { analyzeBytes } from '../dist/file.js';
import { buildCompatibilityProfile } from '../dist/validation.js';
import { buildInboundValidationDraft } from '../dist/acquisition.js';
import { renderHtmlReport } from '../dist/report.js';

function parseArgs(argv) {
  const [file, ...rest] = argv;
  const opts = {};
  for (const token of rest) {
    if (!token.startsWith('--') || !token.includes('=')) continue;
    const [k, ...v] = token.slice(2).split('=');
    opts[k] = v.join('=');
  }
  return { file, opts };
}

const { file, opts } = parseArgs(process.argv.slice(2));
if (!file || !opts.source || !opts.stores || !opts.out) {
  console.error('Usage: node scripts/field-session.mjs <file.csv|file.xlsx> --source=<pos> --stores=<n> --out=<folder> [--id=<id>] [--acquisition-source=<source>] [--acquisition-medium=<medium>] [--acquisition-campaign=<campaign>]');
  process.exit(2);
}
const storeCount = Number(opts.stores);
if (!Number.isInteger(storeCount) || storeCount < 1) throw new Error('--stores must be a positive integer');
const inputPath = resolve(file);
const outDir = resolve(opts.out);
const filename = basename(inputPath);
const data = new Uint8Array(await readFile(inputPath));
const fileSha256 = createHash('sha256').update(data).digest('hex');
await mkdir(outDir, { recursive: true });

const profile = buildCompatibilityProfile(filename, data);
await writeFile(`${outDir}/compatibility-profile.shareable.json`, JSON.stringify(profile, null, 2) + '\n');

let analysis = null;
let importError = null;
try {
  const result = analyzeBytes(filename, data);
  const { items, ...safe } = result;
  analysis = { ...safe, itemCount: items.length, localOnly: true, sourceFileSha256: fileSha256 };
  await writeFile(`${outDir}/analysis.local.json`, JSON.stringify(analysis, null, 2) + '\n');
  await writeFile(`${outDir}/operator-report.local.html`, renderHtmlReport(result, `CafeOS field session · ${filename}`), 'utf8');
} catch (error) {
  importError = error instanceof Error ? error.message : String(error);
  await writeFile(`${outDir}/import-error.local.txt`, importError + '\n');
}

const id = opts.id ?? `field-${fileSha256.slice(0, 12)}`;
const draft = buildInboundValidationDraft({
  id,
  source: opts.source,
  storeCount,
  importSucceeded: Boolean(analysis),
  acquisitionSource: opts['acquisition-source'],
  acquisitionMedium: opts['acquisition-medium'],
  acquisitionCampaign: opts['acquisition-campaign'],
  privacyMode: 'local-only'
});
await writeFile(`${outDir}/validation-record.draft.json`, JSON.stringify(draft, null, 2) + '\n');

const metrics = analysis?.metrics;
const reconciliation = `# Reconciliation worksheet\n\nSession: ${id}\nSource: ${opts.source}\nFile SHA-256: ${fileSha256}\n\n## CafeOS calculated\n\n- Import succeeded: ${Boolean(analysis)}\n- Net sales: ${metrics?.netSales ?? 'N/A'}\n- Orders: ${metrics?.orders ?? 'N/A'}\n- AOV: ${metrics?.aov ?? 'N/A'}\n\n## Source/POS totals — fill from the original report\n\n- Net sales: ______\n- Orders: ______\n- Same date range/filter confirmed: YES / NO\n\n## Reconciliation\n\n- Sales delta %: ______\n- Order delta: ______\n- Metric trusted after reconciliation: YES / NO\n\n## Operator evidence — fill only after showing the report\n\n- Insight reviewed: YES / NO\n- Useful/new insight: YES / NO\n- Wants repeat use: YES / NO\n- Wants continuous sync: YES / NO\n- Value demonstrated before WTP question: YES / NO\n- Willing to pay: YES / NO\n- WTP band: 0 / <500k / 500k-1m / 1m-2m / 2m+\n\nDo not put name, phone, email or raw customer data in the finalized validation record.\n`;
await writeFile(`${outDir}/RECONCILIATION.md`, reconciliation);

const readme = `# CafeOS field session\n\nThis folder is a local working package for one validation session.\n\nShareable by default:\n- compatibility-profile.shareable.json\n\nKeep local/private:\n- analysis.local.json (when import succeeds)\n- operator-report.local.html (when import succeeds; may contain store names/business metrics)\n- import-error.local.txt (when import fails)\n- RECONCILIATION.md\n- original merchant export (not copied into this folder)\n\nvalidation-record.draft.json is intentionally NOT scoreable because unanswered evidence fields are null. Complete the interview/reconciliation first, then convert it to the canonical boolean validation record before including it in the scorecard.\n`;
await writeFile(`${outDir}/README.md`, readme);

console.log(JSON.stringify({ id, filename, fileSha256, outDir, importSucceeded: Boolean(analysis), importError, targetIcp: draft.targetIcp }, null, 2));
if (!analysis) process.exitCode = 1;
