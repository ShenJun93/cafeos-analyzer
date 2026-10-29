import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { verifySyntheticStorageRecovery } from '../scripts/verify-cafeos-synthetic-storage-recovery.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = object => structuredClone(object);

test('Storage metadata, age-restored byte manifest and policy configuration must reconcile', async () => {
  const base = await mkdtemp('/dev/shm/cafeos-storage-meta-test.');
  const root = join(base, 'restored');
  const photo = Buffer.from([0, 0xff, 13, 10, 64, 80]);
  const menu = Buffer.from('espresso,125\ncoffee,250\n');
  const a = 'photos/product/photo.bin', b = 'menus/current/menu.csv';
  const source = {
    buckets: [
      { id: 'photos', name: 'Synthetic Photos', public: false, owner_id: 'owner-a',
        file_size_limit: 4096, allowed_mime_types: ['application/octet-stream'] },
      { id: 'menus', name: 'Synthetic Menus', public: false, owner_id: null,
        file_size_limit: 4096, allowed_mime_types: ['text/csv'] }
    ],
    objects: [
      { id: 'obj-photo', bucket_id: 'photos', name: 'product/photo.bin',
        version: 'v1-photo', owner_id: 'owner-a',
        metadata: { size: photo.length, mimetype: 'application/octet-stream' } },
      { id: 'obj-menu', bucket_id: 'menus', name: 'current/menu.csv',
        version: 'v2-menu', owner_id: null,
        metadata: { size: menu.length, mimetype: 'text/csv' } }
    ]
  };
  const byteManifest = [
    { bucket_id: 'photos', name: 'product/photo.bin', version: 'v1-photo', sha256: sha(photo) },
    { bucket_id: 'menus', name: 'current/menu.csv', version: 'v2-menu', sha256: sha(menu) }
  ];
  const restored = clone(source);
  const run = (override = {}) => verifySyntheticStorageRecovery({
    source, restored, byteManifest, root, ...override
  });
  const mustReject = async (overrides, pattern) =>
    assert.rejects(run(overrides), pattern);

  try {
    await mkdir(join(root, 'photos/product'), { recursive: true });
    await mkdir(join(root, 'menus/current'), { recursive: true });
    await writeFile(join(root, a), photo);
    await writeFile(join(root, b), menu);

    assert.deepEqual(await run(), { buckets: 2, objects: 2 });

    const invalid = (edit) => {
      const copy = clone(restored);
      edit(copy);
      return { restored: copy };
    };
    await mustReject(invalid(c => c.buckets[0].public = true), /STOP_STORAGE_BUCKET_ATTRIBUTE_DRIFT/);
    await mustReject(invalid(c => c.buckets[0].file_size_limit = 2048), /STOP_STORAGE_BUCKET_ATTRIBUTE_DRIFT/);
    await mustReject(invalid(c => c.buckets[1].allowed_mime_types = ['image/png']), /STOP_STORAGE_OBJECT_MIME_NOT_ALLOWED/);
    await mustReject(invalid(c => c.objects[0].version = 'v3-photo'), /STOP_STORAGE_OBJECT_ATTRIBUTE_DRIFT/);
    await mustReject(invalid(c => c.objects[0].owner_id = 'owner-b'), /STOP_STORAGE_OBJECT_ATTRIBUTE_DRIFT/);
    await mustReject(invalid(c => c.objects[0].id = 'wrong-object-id'), /STOP_STORAGE_OBJECT_ATTRIBUTE_DRIFT/);
    await mustReject(invalid(c => c.objects.pop()), /STOP_STORAGE_OBJECT_COUNT_DRIFT/);
    await mustReject(invalid(c => c.buckets.pop()), /STOP_STORAGE_BAD_OBJECT_METADATA/);
    await mustReject(invalid(c => c.objects[0].name = '../outside'), /STOP_STORAGE_BAD_OBJECT_METADATA/);
    await mustReject(invalid(c => c.objects[0].name = 'product\\outside'), /STOP_STORAGE_BAD_OBJECT_METADATA/);
    await mustReject(invalid(c => c.objects.push(clone(c.objects[0]))), /STOP_STORAGE_DUPLICATE_OBJECT_KEY/);
    await mustReject({ byteManifest: [{ ...byteManifest[0], sha256: sha(menu) }, byteManifest[1]] },
      /STOP_STORAGE_RECOVERED_SHA256_DRIFT/);
    await mustReject({ byteManifest: [{ ...byteManifest[0], version: 'stale' }, byteManifest[1]] },
      /STOP_STORAGE_BYTE_MANIFEST_OBJECT_OR_VERSION_DRIFT/);
    await mustReject({ byteManifest: [byteManifest[0]] }, /STOP_STORAGE_BYTE_MANIFEST_COUNT_DRIFT/);
    await mustReject({ root: '/tmp/not-allowed' }, /STOP_STORAGE_SYNTHETIC_TMPFS_ROOT_REQUIRED/);

    await writeFile(join(root, 'photos/extra.bin'), 'extra');
    await mustReject({}, /STOP_STORAGE_RECOVERED_FILE_COUNT_DRIFT/);
    await rm(join(root, 'photos/extra.bin'));
    await rm(join(root, b));
    await mustReject({}, /STOP_STORAGE_RECOVERED_FILE_COUNT_DRIFT/);
    await writeFile(join(root, b), menu);
    await writeFile(join(root, a), Buffer.from('corrupted'));
    await mustReject({}, /STOP_STORAGE_RECOVERED_BYTE_SIZE_DRIFT/);
    await writeFile(join(root, a), photo);

    await rm(join(root, a));
    await symlink(join(root, b), join(root, a));
    await mustReject({}, /STOP_STORAGE_SYMLINK_NOT_ALLOWED/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
