// Synthetic-only Supabase Storage recovery verifier.
// Matches source Storage metadata, restored metadata, and recovered OBJECT BYTES.
// It does not call Supabase, S3, a database, or any external service.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

function stop(code) {
  throw new Error('STOP_STORAGE_' + code);
}
function plainObject(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function requiredObject(value, code) {
  if (!plainObject(value)) stop(code);
  return value;
}
function safePathPart(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 &&
    value !== '.' && value !== '..' && !/[\\/\x00-\x1f\x7f]/u.test(value) &&
    value.trim() === value;
}
function safeObjectName(value) {
  if (typeof value !== 'string' || value.length > 900) return false;
  return value.split('/').every(safePathPart);
}
function distinctList(value, name) {
  if (!Array.isArray(value)) stop('INVALID_' + name);
  const list = [...value];
  if (list.length !== new Set(list).size) stop('DUPLICATE_' + name);
  return list;
}
function checkedBuckets(value) {
  const rows = distinctList(value, 'BUCKET_LIST');
  const found = new Map();
  for (const row of rows) {
    requiredObject(row, 'INVALID_BUCKET_ROW');
    if (!safePathPart(row.id) || !safePathPart(row.name) ||
        typeof row.public !== 'boolean' ||
        (row.owner_id !== null && typeof row.owner_id !== 'string') ||
        (row.file_size_limit !== null &&
          (!Number.isSafeInteger(row.file_size_limit) || row.file_size_limit < 0)) ||
        !Array.isArray(row.allowed_mime_types) ||
        row.allowed_mime_types.some(m => typeof m !== 'string' || !m.trim())) {
      stop('BAD_BUCKET_METADATA');
    }
    distinctList(row.allowed_mime_types, 'BUCKET_MIME_LIST');
    if (found.has(row.id)) stop('DUPLICATE_BUCKET');
    found.set(row.id, {
      id: row.id, name: row.name, public: row.public,
      owner_id: row.owner_id, file_size_limit: row.file_size_limit,
      allowed_mime_types: [...row.allowed_mime_types].sort()
    });
  }
  return found;
}
function checkedObjects(value, buckets) {
  const rows = distinctList(value, 'OBJECT_LIST');
  const found = new Map();
  for (const row of rows) {
    requiredObject(row, 'INVALID_OBJECT_ROW');
    requiredObject(row.metadata, 'INVALID_OBJECT_METADATA');
    if (typeof row.id !== 'string' || row.id.length === 0 ||
        !safePathPart(row.bucket_id) || !safeObjectName(row.name) ||
        !safePathPart(row.version) ||
        (row.owner_id !== null && typeof row.owner_id !== 'string') ||
        !Number.isSafeInteger(row.metadata.size) || row.metadata.size < 0 ||
        typeof row.metadata.mimetype !== 'string' || !row.metadata.mimetype ||
        !buckets.has(row.bucket_id)) {
      stop('BAD_OBJECT_METADATA');
    }
    const bucket = buckets.get(row.bucket_id);
    if (bucket.file_size_limit !== null && row.metadata.size > bucket.file_size_limit) {
      stop('OBJECT_EXCEEDS_BUCKET_LIMIT');
    }
    if (bucket.allowed_mime_types.length &&
        !bucket.allowed_mime_types.includes(row.metadata.mimetype)) {
      stop('OBJECT_MIME_NOT_ALLOWED');
    }
    const key = row.bucket_id + '/' + row.name;
    if (found.has(key)) stop('DUPLICATE_OBJECT_KEY');
    found.set(key, {
      id: row.id, bucket_id: row.bucket_id, name: row.name,
      version: row.version, owner_id: row.owner_id,
      metadata: { size: row.metadata.size, mimetype: row.metadata.mimetype }
    });
  }
  return found;
}
function checkedSnapshot(snapshot) {
  requiredObject(snapshot, 'INVALID_SNAPSHOT');
  const buckets = checkedBuckets(snapshot.buckets);
  const objects = checkedObjects(snapshot.objects, buckets);
  return { buckets, objects };
}
function checkSameMaps(a, b, kind) {
  if (a.size !== b.size) stop(kind + '_COUNT_DRIFT');
  for (const [key, value] of a) {
    if (!b.has(key)) stop(kind + '_MISSING_OR_RENAMED');
    if (JSON.stringify(value) !== JSON.stringify(b.get(key))) {
      stop(kind + '_ATTRIBUTE_DRIFT');
    }
  }
}
function checkedByteManifest(manifest, objects) {
  const rows = distinctList(manifest, 'BYTE_MANIFEST');
  const map = new Map();
  for (const row of rows) {
    requiredObject(row, 'INVALID_BYTE_MANIFEST_ROW');
    if (!safePathPart(row.bucket_id) || !safeObjectName(row.name) ||
        !safePathPart(row.version) || !/^[0-9a-f]{64}$/u.test(row.sha256)) {
      stop('INVALID_BYTE_MANIFEST');
    }
    const key = row.bucket_id + '/' + row.name;
    if (map.has(key)) stop('DUPLICATE_BYTE_MANIFEST_KEY');
    const expected = objects.get(key);
    if (!expected || expected.version !== row.version) {
      stop('BYTE_MANIFEST_OBJECT_OR_VERSION_DRIFT');
    }
    map.set(key, row.sha256);
  }
  if (map.size !== objects.size) stop('BYTE_MANIFEST_COUNT_DRIFT');
  return map;
}
async function listRecoveredFiles(root) {
  const paths = [];
  async function walk(dir, parentKey) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!safePathPart(entry.name)) stop('UNSAFE_RECOVERED_FILENAME');
      const fullPath = resolve(dir, entry.name);
      const key = parentKey ? parentKey + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) stop('SYMLINK_NOT_ALLOWED');
      if (entry.isDirectory()) await walk(fullPath, key);
      else if (entry.isFile()) paths.push(key);
      else stop('SPECIAL_RECOVERED_FILE_NOT_ALLOWED');
    }
  }
  await walk(root, '');
  return paths;
}
export async function verifySyntheticStorageRecovery({ source, restored, byteManifest, root }) {
  if (typeof root !== 'string' || !root || !root.startsWith('/dev/shm/')) {
    stop('SYNTHETIC_TMPFS_ROOT_REQUIRED');
  }
  const rootPath = resolve(root);
  const rootStat = await lstat(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) stop('INVALID_ROOT');
  const orig = checkedSnapshot(source);
  const next = checkedSnapshot(restored);
  checkSameMaps(orig.buckets, next.buckets, 'BUCKET');
  checkSameMaps(orig.objects, next.objects, 'OBJECT');
  const bytes = checkedByteManifest(byteManifest, orig.objects);
  const actual = await listRecoveredFiles(rootPath);
  if (actual.length !== bytes.size) stop('RECOVERED_FILE_COUNT_DRIFT');
  if (new Set(actual).size !== actual.length) stop('DUPLICATE_RECOVERED_PATH');
  for (const key of actual) {
    if (!bytes.has(key)) stop('UNEXPECTED_RECOVERED_OBJECT');
  }
  for (const [key, expectedSha] of bytes) {
    if (!actual.includes(key)) stop('MISSING_RECOVERED_OBJECT');
    const file = resolve(rootPath, ...key.split('/'));
    const rel = relative(rootPath, file);
    if (!rel || rel.startsWith('..' + sep) || rel === '..' || rel.startsWith(sep)) {
      stop('UNSAFE_RECOVERED_PATH');
    }
    const fh = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let actualSha;
    try {
      const stat = await fh.stat();
      if (!stat.isFile()) stop('RECOVERED_NOT_REGULAR_FILE');
      const obj = orig.objects.get(key);
      if (stat.size !== obj.metadata.size) stop('RECOVERED_BYTE_SIZE_DRIFT');
      const hash = createHash('sha256');
      for await (const chunk of fh.createReadStream({ autoClose: false })) hash.update(chunk);
      actualSha = hash.digest('hex');
    } finally {
      await fh.close();
    }
    if (actualSha !== expectedSha) stop('RECOVERED_SHA256_DRIFT');
  }
  return Object.freeze({ buckets: orig.buckets.size, objects: orig.objects.size });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sourcePath, restoredPath, manifestPath, root] = process.argv.slice(2);
  if (!sourcePath || !restoredPath || !manifestPath || !root ||
      process.argv.length !== 6 ||
      process.env.CAFEOS_SYNTHETIC_LOCAL !== '1' && process.env.GITHUB_ACTIONS !== 'true') {
    stop('SYNTHETIC_CLI_USAGE');
  }
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  const restored = JSON.parse(await readFile(restoredPath, 'utf8'));
  const byteManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const result = await verifySyntheticStorageRecovery({ source, restored, byteManifest, root });
  console.log('CAFEOS_STORAGE_SYNTHETIC_METADATA_BYTE_RECONCILIATION_PASS');
  console.log('SYNTHETIC_BUCKETS=' + result.buckets + ' OBJECTS=' + result.objects);
  console.log('REAL_SUPABASE_STORAGE_API_AND_RLS_NOT_TESTED');
}
