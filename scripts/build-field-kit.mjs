import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'release/cafeos-field-kit');

const runtimeScripts = [
  'serve.mjs',
  'field-session.mjs',
  'finalize-field-session.mjs',
  'field-registry.mjs'
];

const runtimeWeb = [
  'index.html',
  'free-analyzer.html',
  'sample-report.html',
  'feedback.html'
];

const fieldKitFiles = [
  'START_CAFEOS.cmd',
  'RUN_FIELD_SESSION.cmd',
  'FINALIZE_FIELD_SESSION.cmd',
  'SCORE_VALIDATION.cmd',
  'windows/start-cafeos.ps1',
  'windows/run-field-session.ps1',
  'windows/finalize-field-session.ps1'
];

const docs = [
  'WINDOWS_FIELD_KIT.md',
  'FIELD_VALIDATION_PROTOCOL.md',
  'FIELD_SESSION_RUNBOOK.md',
  'VALIDATION.md'
];

async function copyRelative(sourcePath, destinationPath = sourcePath) {
  const destination = resolve(out, destinationPath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(sourcePath), destination);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await cp(resolve('dist'), resolve(out, 'dist'), { recursive: true });

for (const file of runtimeScripts) await copyRelative(`scripts/${file}`);
for (const file of runtimeWeb) await copyRelative(`web/${file}`);
for (const file of fieldKitFiles) await copyRelative(`field-kit/${file}`);
for (const file of docs) await copyRelative(`docs/${file}`);
await copyRelative('fixtures/known-anomaly.csv');

await writeFile(
  resolve(out, 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2) + '\n'
);

await writeFile(resolve(out, 'README.md'), [
  '# CafeOS Analyzer field kit',
  '',
  'Local validation bundle for permissioned CafeOS Analyzer field sessions.',
  '',
  '- Runtime: Node.js 20+.',
  '- No npm install is required.',
  '- Run field-kit/START_CAFEOS.cmd to start the local Analyzer on Windows.',
  '- Use RUN_FIELD_SESSION.cmd only after explicit merchant-file processing permission.',
  '- Use FINALIZE_FIELD_SESSION.cmd to finalize bounded anonymous validation evidence.',
  '- SCORE_VALIDATION.cmd reads the local field-validation-registry.json.',
  '- Original merchant exports, field-sessions and registry files remain local and are not bundled.',
  '- Do not upload raw merchant files or local/private session artifacts to GitHub.',
  ''
].join('\n'));

await writeFile(resolve(out, 'FIELD_KIT_BUILD.txt'), [
  'CafeOS Analyzer field kit',
  'Runtime: Node.js 20+',
  'No npm install required for packaged validation build.',
  'Explicit ESM package boundary included.',
  'Runtime scripts are allowlisted; deployment/admin tooling is excluded.',
  'Run field-kit/START_CAFEOS.cmd on Windows.',
  ''
].join('\n'));

console.log(out);
