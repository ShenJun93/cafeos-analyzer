import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(p.replaceAll('\\','/'));
  }
  return out;
}

export async function sourceFingerprint() {
  const files = [...await walk('src'), 'tsconfig.json'].sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file); hash.update('\0'); hash.update(await readFile(file)); hash.update('\0');
  }
  return { sha256: hash.digest('hex'), files };
}
