import type { FieldValidationRecord } from './validation-gates.js';

const REQUIRED_BOOLEAN_FIELDS = [
  'targetIcp','importAttempted','importSucceeded','reconciliationAttempted','metricTrusted',
  'insightReviewed','usefulNewInsight','repeatUseAsked','repeatUseIntent',
  'continuousSyncAsked','continuousSyncIntent','valueDemonstrated','wtpAsked','willingnessToPay'
] as const;

const FORBIDDEN_KEYS = new Set([
  'name','fullName','phone','email','customerPhone','customerEmail','contact','contactInfo',
  'rawFile','filePath','merchantName','storeName','address'
]);

export interface ValidationRegistry {
  version: 1;
  records: FieldValidationRecord[];
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

export function assertCanonicalValidationRecord(value: unknown): asserts value is FieldValidationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Validation record must be an object');
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.trim()) throw new Error('Validation record id is required');
  if (typeof r.source !== 'string' || !r.source.trim()) throw new Error('Validation record source is required');
  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (typeof r[field] !== 'boolean') throw new Error(`Validation record ${field} must be boolean`);
  }
  const forbidden = walkForbidden(value);
  if (forbidden.length) throw new Error(`Validation record contains forbidden PII/local fields: ${forbidden.join(', ')}`);
}

export function emptyValidationRegistry(): ValidationRegistry {
  return { version: 1, records: [] };
}

export function upsertValidationRecord(registry: ValidationRegistry, record: FieldValidationRecord): ValidationRegistry {
  assertCanonicalValidationRecord(record);
  if (registry.version !== 1 || !Array.isArray(registry.records)) throw new Error('Unsupported validation registry');
  const records = registry.records.filter(existing => existing.id !== record.id);
  return { version: 1, records: [...records, record] };
}
