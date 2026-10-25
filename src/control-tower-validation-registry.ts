import {
  CONTROL_TOWER_ACQUISITION_CAMPAIGNS,
  CONTROL_TOWER_ACQUISITION_MEDIA,
  CONTROL_TOWER_ACQUISITION_SOURCES,
  CONTROL_TOWER_PARTICIPANT_ROLES,
  CONTROL_TOWER_PROVENANCES,
  CONTROL_TOWER_SOURCE_EVIDENCE_KINDS,
  CONTROL_TOWER_SOURCE_KEYS,
  CONTROL_TOWER_STORE_BUCKETS,
  assertControlTowerEvidenceDependencies,
  compareSourceEvidenceStrength,
  deriveControlTowerStoreBucket,
  deriveControlTowerTargetIcp,
  type CanonicalControlTowerValidationRecord,
  type ControlTowerTransactionSourceItem
} from './control-tower-validation.js';

const EVIDENCE_FIELDS = [
  'transactionSourcesReviewed',
  'trustedDataReviewed',
  'metricTrusted',
  'dailyBriefReviewed',
  'dailyBriefUseful',
  'storeHealthReviewed',
  'storeHealthUseful',
  'attentionReviewed',
  'actionCreated',
  'returnReviewObserved',
  'terminalActionReviewed',
  'measurementAvailable',
  'measurementChecked',
  'nonCausalWordingUnderstood',
  'repeatLoopAsked',
  'repeatLoopIntent',
  'continuousSyncAsked',
  'continuousSyncIntent',
  'workflowConceptReviewed',
  'workflowConceptUnderstood'
] as const;

const TEMPORAL_FIELDS = [
  'actionCreatedAt',
  'actionSessionId',
  'returnReviewObservedAt',
  'returnSessionId',
  'measurementCheckedAt',
  'measurementSessionId'
] as const;

const CANONICAL_FIELDS = [
  'id',
  'storeCount',
  'storeBucket',
  'participantRoleClass',
  'targetIcp',
  'evidenceProvenance',
  'permissionedSession',
  'sessionPermissionReceiptId',
  'merchantDataPermissionReceiptId',
  'transactionSourcesReviewed',
  'transactionSources',
  'trustedDataReviewed',
  'metricTrusted',
  'dailyBriefReviewed',
  'dailyBriefUseful',
  'storeHealthReviewed',
  'storeHealthUseful',
  'attentionReviewed',
  'actionCreated',
  'returnReviewObserved',
  'terminalActionReviewed',
  'measurementAvailable',
  'measurementChecked',
  'nonCausalWordingUnderstood',
  'repeatLoopAsked',
  'repeatLoopIntent',
  'continuousSyncAsked',
  'continuousSyncIntent',
  'workflowConceptReviewed',
  'workflowConceptUnderstood',
  'actionCreatedAt',
  'actionSessionId',
  'returnReviewObservedAt',
  'returnSessionId',
  'measurementCheckedAt',
  'measurementSessionId',
  'acquisitionSource',
  'acquisitionMedium',
  'acquisitionCampaign'
] as const;

const CANONICAL_FIELD_SET = new Set<string>(CANONICAL_FIELDS);
const SOURCE_ITEM_FIELDS = new Set(['sourceKey', 'evidenceKind', 'primary']);
const OPAQUE_ID = /^[A-Za-z0-9_-]{8,128}$/;

export interface ControlTowerValidationRegistry {
  version: 1;
  records: CanonicalControlTowerValidationRecord[];
}

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function assertOpaqueId(value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) {
    throw new Error(`${field} must be a bounded opaque identifier`);
  }
  if (
    /@|\.|\s/.test(value) ||
    /^(?:field|merchant|store|customer|user|email|phone|transaction|account)[-_]/i.test(value)
  ) {
    throw new Error(`${field} must not encode identity or descriptive data`);
  }
}

function assertEvidenceBool(value: unknown, field: string): void {
  if (value !== null && typeof value !== 'boolean') {
    throw new Error(`${field} must be boolean or null`);
  }
}

function assertNullableIso(value: unknown, field: string): void {
  if (value === null) return;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO date-time or null`);
  }
}

function assertTransactionSourceItem(value: unknown): asserts value is ControlTowerTransactionSourceItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('transaction source item must be an object');
  }
  const item = value as Record<string, unknown>;
  const unknown = Object.keys(item).filter(key => !SOURCE_ITEM_FIELDS.has(key));
  if (unknown.length) {
    throw new Error(`transaction source item contains unknown fields: ${unknown.join(', ')}`);
  }
  if (!includes(CONTROL_TOWER_SOURCE_KEYS, item.sourceKey)) {
    throw new Error('transaction source item sourceKey is invalid');
  }
  if (!includes(CONTROL_TOWER_SOURCE_EVIDENCE_KINDS, item.evidenceKind)) {
    throw new Error('transaction source item evidenceKind is invalid');
  }
  if (typeof item.primary !== 'boolean') {
    throw new Error('transaction source item primary must be boolean');
  }
}

export function assertCanonicalControlTowerValidationRecord(
  value: unknown
): asserts value is CanonicalControlTowerValidationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Control Tower validation record must be an object');
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter(key => !CANONICAL_FIELD_SET.has(key));
  if (unknown.length) {
    throw new Error(`Control Tower validation record contains unknown fields: ${unknown.join(', ')}`);
  }

  assertOpaqueId(record.id, 'id');

  if (!Number.isInteger(record.storeCount) || (record.storeCount as number) < 1) {
    throw new Error('storeCount must be a positive integer');
  }
  if (!includes(CONTROL_TOWER_STORE_BUCKETS, record.storeBucket)) {
    throw new Error('storeBucket is invalid');
  }
  const expectedBucket = deriveControlTowerStoreBucket(record.storeCount as number);
  if (record.storeBucket !== expectedBucket) {
    throw new Error(`storeBucket must equal derived bucket ${expectedBucket}`);
  }

  if (!includes(CONTROL_TOWER_PARTICIPANT_ROLES, record.participantRoleClass)) {
    throw new Error('participantRoleClass is invalid');
  }
  if (typeof record.targetIcp !== 'boolean') {
    throw new Error('targetIcp must be boolean');
  }
  const expectedTarget = deriveControlTowerTargetIcp(
    record.participantRoleClass as CanonicalControlTowerValidationRecord['participantRoleClass'],
    record.storeCount as number
  );
  if (record.targetIcp !== expectedTarget) {
    throw new Error('targetIcp does not match role/store eligibility');
  }

  if (!includes(CONTROL_TOWER_PROVENANCES, record.evidenceProvenance)) {
    throw new Error('evidenceProvenance is invalid');
  }
  if (typeof record.permissionedSession !== 'boolean') {
    throw new Error('permissionedSession must be boolean');
  }
  assertOpaqueId(record.sessionPermissionReceiptId, 'sessionPermissionReceiptId', true);
  assertOpaqueId(record.merchantDataPermissionReceiptId, 'merchantDataPermissionReceiptId', true);

  for (const field of EVIDENCE_FIELDS) {
    assertEvidenceBool(record[field], field);
  }

  if (record.transactionSources !== null) {
    if (!Array.isArray(record.transactionSources)) {
      throw new Error('transactionSources must be an array or null');
    }
    for (const item of record.transactionSources) assertTransactionSourceItem(item);
  }

  assertNullableIso(record.actionCreatedAt, 'actionCreatedAt');
  assertOpaqueId(record.actionSessionId, 'actionSessionId', true);
  assertNullableIso(record.returnReviewObservedAt, 'returnReviewObservedAt');
  assertOpaqueId(record.returnSessionId, 'returnSessionId', true);
  assertNullableIso(record.measurementCheckedAt, 'measurementCheckedAt');
  assertOpaqueId(record.measurementSessionId, 'measurementSessionId', true);

  if ('acquisitionSource' in record && !includes(CONTROL_TOWER_ACQUISITION_SOURCES, record.acquisitionSource)) {
    throw new Error('acquisitionSource is invalid');
  }
  if ('acquisitionMedium' in record && !includes(CONTROL_TOWER_ACQUISITION_MEDIA, record.acquisitionMedium)) {
    throw new Error('acquisitionMedium is invalid');
  }
  if ('acquisitionCampaign' in record && !includes(CONTROL_TOWER_ACQUISITION_CAMPAIGNS, record.acquisitionCampaign)) {
    throw new Error('acquisitionCampaign is invalid');
  }
  if (
    'acquisitionCampaign' in record &&
    (!('acquisitionSource' in record) || !('acquisitionMedium' in record))
  ) {
    throw new Error('acquisitionCampaign requires acquisitionSource and acquisitionMedium');
  }

  const canonical = record as unknown as CanonicalControlTowerValidationRecord;

  if (canonical.actionCreated !== true && (canonical.actionCreatedAt !== null || canonical.actionSessionId !== null)) {
    throw new Error('action temporal fields require actionCreated=true');
  }
  if (
    canonical.returnReviewObserved !== true &&
    (canonical.returnReviewObservedAt !== null || canonical.returnSessionId !== null)
  ) {
    throw new Error('return temporal fields require returnReviewObserved=true');
  }
  if (
    canonical.measurementChecked !== true &&
    (canonical.measurementCheckedAt !== null || canonical.measurementSessionId !== null)
  ) {
    throw new Error('measurement temporal fields require measurementChecked=true');
  }

  assertControlTowerEvidenceDependencies(canonical);
}

export function emptyControlTowerValidationRegistry(): ControlTowerValidationRegistry {
  return { version: 1, records: [] };
}

function immutableEventClass(
  record: CanonicalControlTowerValidationRecord
): string {
  return JSON.stringify({
    id: record.id,
    storeCount: record.storeCount,
    storeBucket: record.storeBucket,
    participantRoleClass: record.participantRoleClass,
    targetIcp: record.targetIcp,
    evidenceProvenance: record.evidenceProvenance,
    permissionedSession: record.permissionedSession,
    sessionPermissionReceiptId: record.sessionPermissionReceiptId,
    merchantDataPermissionReceiptId: record.merchantDataPermissionReceiptId
  });
}

function assertNoSourceDowngrade(
  existing: CanonicalControlTowerValidationRecord,
  next: CanonicalControlTowerValidationRecord
): void {
  const nextByKey = new Map(
    (next.transactionSources ?? []).map(item => [item.sourceKey, item])
  );
  for (const source of existing.transactionSources ?? []) {
    const candidate = nextByKey.get(source.sourceKey);
    if (!candidate) {
      throw new Error(`existing transaction source ${source.sourceKey} cannot be removed`);
    }
    if (compareSourceEvidenceStrength(candidate.evidenceKind, source.evidenceKind) < 0) {
      throw new Error(`transaction source ${source.sourceKey} evidence cannot be downgraded`);
    }
  }
}

export function upsertControlTowerValidationRecord(
  registry: ControlTowerValidationRegistry,
  record: CanonicalControlTowerValidationRecord
): ControlTowerValidationRegistry {
  assertCanonicalControlTowerValidationRecord(record);
  if (registry.version !== 1 || !Array.isArray(registry.records)) {
    throw new Error('Unsupported Control Tower validation registry');
  }
  for (const existing of registry.records) {
    assertCanonicalControlTowerValidationRecord(existing);
  }

  const index = registry.records.findIndex(existing => existing.id === record.id);
  if (index < 0) {
    return { version: 1, records: [...registry.records, record] };
  }

  const existing = registry.records[index];
  if (JSON.stringify(existing) === JSON.stringify(record)) return registry;

  if (immutableEventClass(existing) !== immutableEventClass(record)) {
    throw new Error('existing evidence ID cannot change provenance, permission, role, store or derived ICP');
  }
  assertNoSourceDowngrade(existing, record);

  const records = [...registry.records];
  records[index] = record;
  return { version: 1, records };
}
