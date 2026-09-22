import {
  CT_SOURCE_EVIDENCE_KINDS,
  assertControlTowerValidationRecord,
  summarizeControlTowerValidation,
  type ControlTowerPublicSummary,
  type ControlTowerValidationRecord,
  type CtSourceEvidenceKind
} from './control-tower-validation.js';

export interface ControlTowerValidationRegistry {
  version: 1;
  records: ControlTowerValidationRecord[];
}

const IMMUTABLE_EVENT_FIELDS = [
  'id',
  'storeCount',
  'storeBucket',
  'participantRoleClass',
  'targetIcp',
  'evidenceProvenance',
  'permissionedSession'
] as const;

const IMMUTABLE_ONCE_SET = [
  'sessionPermissionReceiptId',
  'merchantDataPermissionReceiptId',
  'actionCreatedAt',
  'actionSessionId',
  'returnReviewObservedAt',
  'returnSessionId',
  'measurementCheckedAt',
  'measurementSessionId'
] as const;

const SOURCE_STRENGTH: Record<CtSourceEvidenceKind, number> = {
  operator_stated: 1,
  export_observed: 2,
  merchant_data_permissioned: 3
};

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function emptyControlTowerValidationRegistry(): ControlTowerValidationRegistry {
  return { version: 1, records: [] };
}

export function assertControlTowerValidationRegistry(
  value: unknown
): asserts value is ControlTowerValidationRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Control Tower registry must be an object');
  }
  const registry = value as Record<string, unknown>;
  const unknown = Object.keys(registry).filter(key => !['version', 'records'].includes(key));
  if (unknown.length) throw new Error(`Unknown Control Tower registry fields: ${unknown.join(', ')}`);
  if (registry.version !== 1 || !Array.isArray(registry.records)) {
    throw new Error('Unsupported Control Tower validation registry');
  }
  for (const record of registry.records) assertControlTowerValidationRecord(record);
}

function assertNoSourceDowngrade(
  previous: ControlTowerValidationRecord,
  next: ControlTowerValidationRecord
): void {
  const oldSources = new Map((previous.transactionSources ?? []).map(item => [item.sourceKey, item]));
  const newSources = new Map((next.transactionSources ?? []).map(item => [item.sourceKey, item]));

  for (const [sourceKey, oldItem] of oldSources) {
    const newItem = newSources.get(sourceKey);
    if (!newItem) throw new Error(`Control Tower source evidence cannot remove source ${sourceKey}`);
    if (SOURCE_STRENGTH[newItem.evidenceKind] < SOURCE_STRENGTH[oldItem.evidenceKind]) {
      throw new Error(`Control Tower source evidence cannot downgrade ${sourceKey}`);
    }
    if (oldItem.primary && !newItem.primary) {
      throw new Error(`Control Tower source evidence cannot remove established primary flag for ${sourceKey}`);
    }
  }
}

function assertSameEvent(
  previous: ControlTowerValidationRecord,
  next: ControlTowerValidationRecord
): void {
  for (const field of IMMUTABLE_EVENT_FIELDS) {
    if (!same(previous[field], next[field])) {
      throw new Error(`Control Tower record ${previous.id} cannot change immutable field ${field}`);
    }
  }

  for (const field of IMMUTABLE_ONCE_SET) {
    const before = previous[field];
    const after = next[field];
    if (before !== null && before !== after) {
      throw new Error(`Control Tower record ${previous.id} cannot change established field ${field}`);
    }
  }

  if (previous.transactionSourcesReviewed === true && next.transactionSourcesReviewed !== true) {
    throw new Error('Control Tower transaction source review cannot be downgraded');
  }

  assertNoSourceDowngrade(previous, next);
}

export function upsertControlTowerValidationRecord(
  registry: ControlTowerValidationRegistry,
  record: ControlTowerValidationRecord
): ControlTowerValidationRegistry {
  assertControlTowerValidationRegistry(registry);
  assertControlTowerValidationRecord(record);

  const index = registry.records.findIndex(existing => existing.id === record.id);
  if (index < 0) return { version: 1, records: [...registry.records, record] };

  const previous = registry.records[index];
  if (same(previous, record)) return registry;

  assertSameEvent(previous, record);
  const records = registry.records.slice();
  records[index] = record;
  return { version: 1, records };
}

export function summarizeControlTowerRegistry(
  registry: ControlTowerValidationRegistry
): ControlTowerPublicSummary {
  assertControlTowerValidationRegistry(registry);
  return summarizeControlTowerValidation(registry.records);
}

export function sourceEvidenceStrength(kind: CtSourceEvidenceKind): number {
  if (!CT_SOURCE_EVIDENCE_KINDS.includes(kind)) throw new Error('Unknown source evidence kind');
  return SOURCE_STRENGTH[kind];
}
