import { access, readFile } from 'node:fs/promises';
import { sourceFingerprint } from './source-fingerprint.mjs';

const required = [
  'dist/file.js',
  'dist/validation.js',
  'dist/xlsx.js',
  'api/analyze.mjs',
  'api/inspect.mjs',
  'api/profile.mjs',
  'api/health.mjs',
  'api/_app-auth.mjs',
  'api/app/session.mjs',
  'api/app/stores.mjs',
  'api/app/attention.mjs',
  'api/app/brief.mjs',
  'public/index.html',
  'public/analyzer.html',
  'public/sample-report.html',
  'public/feedback.html',
  'public/phan-tich-file-kiotviet-cafe.html',
  'public/phan-tich-file-sapo-fnb.html',
  'public/phan-tich-doanh-thu-quan-cafe-excel.html',
  'public/robots.txt',
  'public/sitemap.xml'
];
for (const path of required) await access(path);
const expected = JSON.parse(await readFile('dist/.source-fingerprint.json', 'utf8'));
const actual = await sourceFingerprint();
if (expected.sha256 !== actual.sha256) throw new Error('Committed dist is stale: source fingerprint does not match');
const analyzer = await readFile('public/analyzer.html', 'utf8');
if (!/tối đa 4MB/i.test(analyzer)) throw new Error('Public analyzer must disclose the 4MB preview limit');
if (/tối đa 20MB/i.test(analyzer)) throw new Error('Public analyzer must not advertise local-only 20MB limit');
console.log(`deploy artifact verified: ${required.length} required files present`);