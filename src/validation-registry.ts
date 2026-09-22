import {
  ACQUISITION_CAMPAIGNS,
  ACQUISITION_MEDIA,
  ACQUISITION_SOURCES,
  ANALYZER_SOURCE_CLASSES,
  PARTICIPANT_ROLE_CLASSES,
  PRIVACY_MODES,
  STORE_BUCKETS,
  WTP_BANDS,
  assertAnalyzerEvidenceDependencies,
  deriveAnalyzerStoreBucket,
  deriveAnalyzerTargetIcp,
  type CanonicalAnalyzerValidationRecord
} from './validation-record-contract.js';

const REQUIRED_BOOLEAN_FIELDS = [
  'permissionedSession',
  'targetIcp',
  'importAttempted',
  'importSucceeded',
  'reconciliationAttempted',
  'metricTrusted',
  'insightReviewed',
  'usefulNewInsight',
  'repeatUseAsked',
  'repeatUseIntent',
  'continuousSyncAsked',
  'continuousSyncIntent',
  'valueDemonstrated',
  'wtpAsked',
  'willingnessToPay'
] as const;

const CANONICAL_FIELDS = [
  'id',
  'source',
  'participantRoleClass',
  'permissionedSession',
  'targetIcp',
  'importAttempted',
  'importSucceeded',
  'reconciliationAttempted',
  'metricTrusted',
  'insightReviewed',
  'usefulNewInsight',
  'repeatUseAsked',
  'repeatUseIntent',
  'continuousSyncAsked',
  'continuousSyncIntent',
  'valueDemonstrated',
  'wtpAsked',
  'willingnessToPay',
  'storeCount',
  'storeBucket',
  'acquisitionSource',
  'acquisitionMedium',
  'acquisitionCampaign',
  'privacyMode',
  'wtpBand'
] as const;

const CANONICAL_FIELD_SET = new Set<string>(CANONICAL_FIELDS);

const FORBIDDEN_KEYS = new Set([
  'name',
  'fullName',
  'phone',
  'email',
  'customerPhone',
  'customerEmail',
  'contact',
  'contactInfo',
  'rawFile',
  'filePath',
  'merchantName',
  'storeName',
  'address',
  'sourceFileSha256',
  'referrer',
  'referrerUrl',
  'query',
  'queryString'
]);

export interface ValidationRegistry {
  version: 1;
  records: CanonicalAnalyzerValidationRecord[];
}

function walkForbidden(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.has(key)) found.push(next);
    found.push(...walkForbidden(child, next));
  }
  return found;
}

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function assertOptionalEnum<T extends readonly string[]>(
  record: Record<string, unknown>,
  field: string,
  values: T
): void {
  if (!(field in record)) return;
  if (!includes(values, record[field])) {
    throw new Error(`Validation record ${field} is invalid`);
  }
}

function canonicalFingerprint(record: CanonicalAnalyzerValidationRecord): string {
  return JSON.stringify(CANONICAL_FIELDS.map(field => [field, record[field as keyof CanonicalAnalyzerValidationRecord] ?? null]));
}

export function assertCanonicalValidationRecord(
  value: unknown
): asserts value is CanonicalAnalyzerValidationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Validation record must be an object');
  }
  const r = value as Record<string, unknown>;

  const unknown = Object.keys(r).filter(key => !CANONICAL_FIELD_SET.has(key));
  if (unknown.length) {
    throw new Error(`Validation record contains unknown canonical fields: ${unknown.join(', ')}`);
  }

  if (
    typeof r.id !== 'string' ||
    r.id.length < 8 ||
    r.id.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(r.id)
  ) {
    throw new Error('Validation record id must be an opaque bounded identifier');
  }
  if (/^field-[0-9a-f]{12}$/i.test(r.id)) {
    throw new Error('Validation record id must not be derived from a source-file hash');
  }

  if (!includes(ANALYZER_SOURCE_CLASSES, r.source)) {
    throw new Error('Validation record source must be a normalized source class');
  }
  if (!includes(PARTICIPANT_ROLE_CLASSES, r.participantRoleClass)) {
    throw new Error('Validation record participantRoleClass is invalid');
  }

  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (typeof r[field] !== 'boolean') {
      throw new Error(`Validation record ${field} must be boolean`);
    }
  }

  if (!Number.isInteger(r.storeCount) || (r.storeCount as number) < 1) {
    throw new Error('Validation record storeCount must be a positive integer');
  }
  if (!includes(STORE_BUCKETS, r.storeBucket)) {
    throw new Error('Validation record storeBucket is invalid');
  }

  const expectedBucket = deriveAnalyzerStoreBucket(r.storeCount as number);
  if (r.storeBucket !== expectedBucket) {
    throw new Error(`Validation record storeBucket must equal derived bucket ${expectedBucket}`);
  }
  const expectedTarget = deriveAnalyzerTargetIcp(
    r.participantRoleClass as CanonicalAnalyzerValidationRecord['participantRoleClass'],
    r.storeCount as number
  );
  if (r.targetIcp !== expectedTarget) {
    throw new Error('Validation record targetIcp does not match role/store eligibility');
  }

  assertOptionalEnum(r, 'acquisitionSource', ACQUISITION_SOURCES);
  assertOptionalEnum(r, 'acquisitionMedium', ACQUISITION_MEDIA);
  assertOptionalEnum(r, 'acquisitionCampaign', ACQUISITION_CAMPAIGNS);
  assertOptionalEnum(r, 'privacyMode', PRIVACY_MODES);
  assertOptionalEnum(r, 'wtpBand', WTP_BANDS);

  if ('acquisitionCampaign' in r && (!('acquisitionSource' in r) || !('acquisitionMedium' in r))) {
    throw new Error('Validation record acquisitionCampaign requires source and medium');
  }

  const forbidden = walkForbidden(value);
  if (forbidden.length) {
    throw new Error(`Validation record contains forbidden PII/local fields: ${forbidden.join(', ')}`);
  }

  assertAnalyzerEvidenceDependencies(r as unknown as CanonicalAnalyzerValidationRecord);
}

export function emptyValidationRegistry(): ValidationRegistry {
  return { version: 1, records: [] };
}

export function upsertValidationRecord(
  registry: ValidationRegistry,
  record: CanonicalAnalyzerValidationRecord
): ValidationRegistry {
  assertCanonicalValidationRecord(record);
  if (registry.version !== 1 || !Array.isArray(registry.records)) {
    throw new Error('Unsupported validation registry');
  }

  for (const existing of registry.records) assertCanonicalValidationRecord(existing);

  const existing = registry.records.find(item => item.id === record.id);
  if (!existing) return { version: 1, records: [...registry.records, record] };

  if (canonicalFingerprint(existing) === canonicalFingerprint(record)) return registry;

  throw new Error(`Validation record id ${record.id} already exists with different canonical evidence`);
}
