import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildControlTowerValidationDraft } from '../dist/control-tower-validation.js';

function argsOf(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--') || !arg.includes('=')) throw new Error(`Expected --key=value argument, got: ${arg}`);
    const [key, ...rest] = arg.slice(2).split('=');
    out[key] = rest.join('=');
  }
  return out;
}

const args = argsOf(process.argv.slice(2));
const outputDir = resolve(args.out ?? '');
if (!args.out) throw new Error('--out is required');

const stores = Number(args.stores);
if (!Number.isInteger(stores) || stores < 1) throw new Error('--stores must be a positive integer');

const role = args.role === 'none' ? null : args.role;
const permissioned = args.permissioned === 'true' ? true : args.permissioned === 'false' ? false : null;
if (permissioned === null) throw new Error('--permissioned must be true or false');

const draft = buildControlTowerValidationDraft({
  id: args.id || randomUUID(),
  storeCount: stores,
  participantRoleClass: role,
  evidenceProvenance: args.provenance,
  permissionedSession: permissioned,
  sessionPermissionReceiptId: args['session-permission-receipt'] || null,
  merchantDataPermissionReceiptId: args['merchant-data-permission-receipt'] || null
});

await mkdir(outputDir, { recursive: true });
const draftPath = resolve(outputDir, 'control-tower-validation.draft.json');
await writeFile(draftPath, JSON.stringify(draft, null, 2) + '\n');
console.log(JSON.stringify({
  status: draft.status,
  id: draft.id,
  targetIcp: draft.targetIcp,
  evidenceProvenance: draft.evidenceProvenance,
  draft: draftPath
}, null, 2));
