import { writeFile } from 'node:fs/promises';
import { sourceFingerprint } from './source-fingerprint.mjs';
const stamp = await sourceFingerprint();
await writeFile('dist/.source-fingerprint.json', JSON.stringify(stamp, null, 2) + '\n');
console.log(`dist source fingerprint: ${stamp.sha256}`);
