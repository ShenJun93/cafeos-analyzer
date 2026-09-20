import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'release/cafeos-field-kit');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const dir of ['dist','scripts','web','field-kit']) await cp(resolve(dir), resolve(out, dir), { recursive: true });
for (const file of ['README.md','AGENTS.md']) await cp(resolve(file), resolve(out, file));
await mkdir(resolve(out, 'docs'), { recursive: true });
for (const file of [
  'WINDOWS_FIELD_KIT.md','FIELD_VALIDATION_PROTOCOL.md','FIELD_SESSION_RUNBOOK.md',
  'FIELD_VALIDATION_RECORD.md','REAL_DATA_INTAKE.md','VALIDATION.md'
]) await cp(resolve('docs', file), resolve(out, 'docs', file));
await mkdir(resolve(out, 'fixtures'), { recursive: true });
await cp(resolve('fixtures/known-anomaly.csv'), resolve(out, 'fixtures/known-anomaly.csv'));
await writeFile(resolve(out, 'FIELD_KIT_BUILD.txt'), [
  'CafeOS Analyzer field kit',
  'Runtime: Node.js 20+',
  'No npm install required for packaged validation build.',
  'Run field-kit/START_CAFEOS.cmd on Windows.',
  ''
].join('\n'));
console.log(out);
