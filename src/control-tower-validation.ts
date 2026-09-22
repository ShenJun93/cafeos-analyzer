export const CT_PARTICIPANT_ROLES = ['owner_operator', 'hq_decision_maker', 'other'] as const;
export type CtParticipantRoleClass = typeof CT_PARTICIPANT_ROLES[number];

export const CT_PROVENANCE = [
  'synthetic_technical',
  'operator_synthetic_assisted',
  'merchant_data_permissioned'
] as const;
export type CtEvidenceProvenance = typeof CT_PROVENANCE[number];

export const CT_STORE_BUCKETS = ['1', '2', '3-5', '6-10', '11-15', '16+'] as const;
export type CtStoreBucket = typeof CT_STORE_BUCKETS[number];

export const CT_TRANSACTION_SOURCES = [
  'kiotviet_fnb',
  'sapo_fnb',
  'cukcuk',
  'pos365',
  'ipos',
  'haravan',
  'generic_excel_csv',
  'other_pos',
  'unknown'
] as const;
export type CtTransactionSourceKey = typeof CT_TRANSACTION_SOURCES[number];

export const CT_SOURCE_EVIDENCE_KINDS = [
  'operator_stated',
  'export_observed',
  'merchant_data_permissioned'
] as const;
export type CtSourceEvidenceKind = typeof CT_SOURCE_EVIDENCE_KINDS[number];

export const CT_ACQUISITION_SOURCES = ['seo', 'direct', 'other'] as const;
export const CT_ACQUISITION_MEDIA = ['organic', 'none', 'other'] as const;
export const CT_ACQUISITION_CAMPAIGNS = [
  'kiotviet-excel-analysis',
  'sapo-fnb-excel-analysis',
  'cafe-excel-analysis',
  'other'
] as const;

export type NullableEvidence = boolean | null;

export interface CtTransactionSourceItem {
  sourceKey: CtTransactionSourceKey;
  evidenceKind: CtSourceEvidenceKind;
  primary: boolean;
}

export interface ControlTowerValidationRecord {
  id: string;
  storeCount: number;
  storeBucket: CtStoreBucket;
  participantRoleClass: CtParticipantRoleClass | null;
  targetIcp: boolean;
  evidenceProvenance: CtEvidenceProvenance;

  permissionedSession: boolean;
  sessionPermissionReceiptId: string | null;
  merchantDataPermissionReceiptId: string | null;

  transactionSourcesReviewed: NullableEvidence;
  transactionSources: CtTransactionSourceItem[] | null;

  trustedDataReviewed: NullableEvidence;
  metricTrusted: NullableEvidence;
  dailyBriefReviewed: NullableEvidence;
  dailyBriefUseful: NullableEvidence;
  storeHealthReviewed: NullableEvidence;
  storeHealthUseful: NullableEvidence;
  attentionReviewed: NullableEvidence;
  actionCreated: NullableEvidence;
  returnReviewObserved: NullableEvidence;
  terminalActionReviewed: NullableEvidence;
  measurementAvailable: NullableEvidence;
  measurementChecked: NullableEvidence;
  nonCausalWordingUnderstood: NullableEvidence;
  repeatLoopAsked: NullableEvidence;
  repeatLoopIntent: NullableEvidence;
  continuousSyncAsked: NullableEvidence;
  continuousSyncIntent: NullableEvidence;
  workflowConceptReviewed: NullableEvidence;
  workflowConceptUnderstood: NullableEvidence;

  actionCreatedAt: string | null;
  actionSessionId: string | null;
  returnReviewObservedAt: string | null;
  returnSessionId: string | null;
  measurementCheckedAt: string | null;
  measurementSessionId: string | null;

  acquisitionSource?: typeof CT_ACQUISITION_SOURCES[number];
  acquisitionMedium?: typeof CT_ACQUISITION_MEDIA[number];
  acquisitionCampaign?: typeof CT_ACQUISITION_CAMPAIGNS[number];
}

export interface ControlTowerValidationDraft
  extends Omit<ControlTowerValidationRecord, 'targetIcp' | 'storeBucket'> {
  status: 'DRAFT_NOT_PUBLIC';
  storeBucket: CtStoreBucket;
  targetIcp: boolean;
}

export type ControlTowerEvidenceAnswers = Partial<Pick<
  ControlTowerValidationRecord,
  | 'transactionSourcesReviewed'
  | 'transactionSources'
  | 'trustedDataReviewed'
  | 'metricTrusted'
  | 'dailyBriefReviewed'
  | 'dailyBriefUseful'
  | 'storeHealthReviewed'
  | 'storeHealthUseful'
  | 'attentionReviewed'
  | 'actionCreated'
  | 'returnReviewObserved'
  | 'terminalActionReviewed'
  | 'measurementAvailable'
  | 'measurementChecked'
  | 'nonCausalWordingUnderstood'
  | 'repeatLoopAsked'
  | 'repeatLoopIntent'
  | 'continuousSyncAsked'
  | 'continuousSyncIntent'
  | 'workflowConceptReviewed'
  | 'workflowConceptUnderstood'
  | 'actionCreatedAt'
  | 'actionSessionId'
  | 'returnReviewObservedAt'
  | 'returnSessionId'
  | 'measurementCheckedAt'
  | 'measurementSessionId'
  | 'acquisitionSource'
  | 'acquisitionMedium'
  | 'acquisitionCampaign'
>>;

export interface EvidenceRate {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface SourcePrevalenceItem {
  sessions: number;
  rate: number | null;
  evidenceKinds: Record<CtSourceEvidenceKind, number>;
}

export interface ControlTowerPublicSummary {
  status: 'COLLECTING_EVIDENCE';
  operatorSyntheticAssisted: {
    targetPermissionedRecords: number;
    workflowConceptUnderstanding: EvidenceRate;
    repeatLoopIntent: EvidenceRate;
    nonCausalUnderstanding: EvidenceRate;
  };
  merchantDataPermissioned: {
    targetPermissionedRecords: number;
    dataTrust: EvidenceRate;
    dailyBriefUsefulness: EvidenceRate;
    storeHealthUsefulness: EvidenceRate;
    actionConversion: EvidenceRate;
    returnReview: EvidenceRate;
    terminalReview: EvidenceRate;
    measurementCheck: EvidenceRate;
    nonCausalUnderstanding: EvidenceRate;
    repeatLoopIntent: EvidenceRate;
    continuousSyncIntent: EvidenceRate;
    completeLoopObserved: number;
  };
  transactionSourcePrevalence: {
    reviewedSessions: number;
    sources: Partial<Record<CtTransactionSourceKey, SourcePrevalenceItem>>;
  };
}

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

const OPAQUE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function deriveCtStoreBucket(storeCount: number): CtStoreBucket {
  if (!Number.isInteger(storeCount) || storeCount < 1) throw new Error('storeCount must be a positive integer');
  if (storeCount <= 1) return '1';
  if (storeCount === 2) return '2';
  if (storeCount <= 5) return '3-5';
  if (storeCount <= 10) return '6-10';
  if (storeCount <= 15) return '11-15';
  return '16+';
}

export function deriveCtTargetIcp(
  participantRoleClass: CtParticipantRoleClass | null,
  storeCount: number
): boolean {
  const roleEligible =
    participantRoleClass === 'owner_operator' ||
    participantRoleClass === 'hq_decision_maker';
  return roleEligible && storeCount >= 3 && storeCount <= 15;
}

export function isOpaqueCtId(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_ID.test(value);
}

function normalizedAcquisition(
  source?: string,
  medium?: string,
  campaign?: string
): Pick<ControlTowerValidationRecord, 'acquisitionSource' | 'acquisitionMedium' | 'acquisitionCampaign'> | {} {
  const s = String(source ?? '').trim().toLowerCase();
  const m = String(medium ?? '').trim().toLowerCase();
  const c = String(campaign ?? '').trim().toLowerCase();
  if (!s && !m && !c) return {};
  if (
    s === 'seo' &&
    m === 'organic' &&
    (CT_ACQUISITION_CAMPAIGNS as readonly string[]).includes(c) &&
    c !== 'other'
  ) {
    return {
      acquisitionSource: 'seo',
      acquisitionMedium: 'organic',
      acquisitionCampaign: c as ControlTowerValidationRecord['acquisitionCampaign']
    };
  }
  if ((s === 'direct' || !s) && (m === 'none' || !m) && !c) {
    return { acquisitionSource: 'direct', acquisitionMedium: 'none' };
  }
  return { acquisitionSource: 'other', acquisitionMedium: 'other', acquisitionCampaign: 'other' };
}

export function normalizeCtTransactionSources(
  sources: CtTransactionSourceItem[] | null
): CtTransactionSourceItem[] | null {
  if (sources === null) return null;
  const strength: Record<CtSourceEvidenceKind, number> = {
    operator_stated: 1,
    export_observed: 2,
    merchant_data_permissioned: 3
  };
  const bySource = new Map<CtTransactionSourceKey, CtTransactionSourceItem>();
  for (const item of sources) {
    const previous = bySource.get(item.sourceKey);
    if (!previous || strength[item.evidenceKind] > strength[previous.evidenceKind]) {
      bySource.set(item.sourceKey, { ...item });
    } else if (previous && item.primary) {
      previous.primary = true;
    }
  }
  return [...bySource.values()].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}

export function buildControlTowerValidationDraft(input: {
  id: string;
  storeCount: number;
  participantRoleClass: CtParticipantRoleClass | null;
  evidenceProvenance: CtEvidenceProvenance;
  permissionedSession: boolean;
  sessionPermissionReceiptId?: string | null;
  merchantDataPermissionReceiptId?: string | null;
}): ControlTowerValidationDraft {
  const emptyEvidence = Object.fromEntries(EVIDENCE_FIELDS.map(field => [field, null])) as
    Pick<ControlTowerValidationRecord, typeof EVIDENCE_FIELDS[number]>;
  return {
    status: 'DRAFT_NOT_PUBLIC',
    id: input.id,
    storeCount: input.storeCount,
    storeBucket: deriveCtStoreBucket(input.storeCount),
    participantRoleClass: input.participantRoleClass,
    targetIcp: deriveCtTargetIcp(input.participantRoleClass, input.storeCount),
    evidenceProvenance: input.evidenceProvenance,
    permissionedSession: input.permissionedSession,
    sessionPermissionReceiptId: input.sessionPermissionReceiptId ?? null,
    merchantDataPermissionReceiptId: input.merchantDataPermissionReceiptId ?? null,
    ...emptyEvidence,
    transactionSources: null,
    actionCreatedAt: null,
    actionSessionId: null,
    returnReviewObservedAt: null,
    returnSessionId: null,
    measurementCheckedAt: null,
    measurementSessionId: null
  };
}

export function finalizeControlTowerValidationDraft(
  draft: ControlTowerValidationDraft,
  answers: ControlTowerEvidenceAnswers
): ControlTowerValidationRecord {
  if (draft.status !== 'DRAFT_NOT_PUBLIC') throw new Error('Expected a Control Tower validation draft');
  const record: ControlTowerValidationRecord = {
    id: draft.id,
    storeCount: draft.storeCount,
    storeBucket: deriveCtStoreBucket(draft.storeCount),
    participantRoleClass: draft.participantRoleClass,
    targetIcp: deriveCtTargetIcp(draft.participantRoleClass, draft.storeCount),
    evidenceProvenance: draft.evidenceProvenance,
    permissionedSession: draft.permissionedSession,
    sessionPermissionReceiptId: draft.sessionPermissionReceiptId,
    merchantDataPermissionReceiptId: draft.merchantDataPermissionReceiptId,
    transactionSourcesReviewed: answers.transactionSourcesReviewed ?? draft.transactionSourcesReviewed,
    transactionSources: normalizeCtTransactionSources(answers.transactionSources ?? draft.transactionSources),
    trustedDataReviewed: answers.trustedDataReviewed ?? draft.trustedDataReviewed,
    metricTrusted: answers.metricTrusted ?? draft.metricTrusted,
    dailyBriefReviewed: answers.dailyBriefReviewed ?? draft.dailyBriefReviewed,
    dailyBriefUseful: answers.dailyBriefUseful ?? draft.dailyBriefUseful,
    storeHealthReviewed: answers.storeHealthReviewed ?? draft.storeHealthReviewed,
    storeHealthUseful: answers.storeHealthUseful ?? draft.storeHealthUseful,
    attentionReviewed: answers.attentionReviewed ?? draft.attentionReviewed,
    actionCreated: answers.actionCreated ?? draft.actionCreated,
    returnReviewObserved: answers.returnReviewObserved ?? draft.returnReviewObserved,
    terminalActionReviewed: answers.terminalActionReviewed ?? draft.terminalActionReviewed,
    measurementAvailable: answers.measurementAvailable ?? draft.measurementAvailable,
    measurementChecked: answers.measurementChecked ?? draft.measurementChecked,
    nonCausalWordingUnderstood: answers.nonCausalWordingUnderstood ?? draft.nonCausalWordingUnderstood,
    repeatLoopAsked: answers.repeatLoopAsked ?? draft.repeatLoopAsked,
    repeatLoopIntent: answers.repeatLoopIntent ?? draft.repeatLoopIntent,
    continuousSyncAsked: answers.continuousSyncAsked ?? draft.continuousSyncAsked,
    continuousSyncIntent: answers.continuousSyncIntent ?? draft.continuousSyncIntent,
    workflowConceptReviewed: answers.workflowConceptReviewed ?? draft.workflowConceptReviewed,
    workflowConceptUnderstood: answers.workflowConceptUnderstood ?? draft.workflowConceptUnderstood,
    actionCreatedAt: answers.actionCreatedAt ?? draft.actionCreatedAt,
    actionSessionId: answers.actionSessionId ?? draft.actionSessionId,
    returnReviewObservedAt: answers.returnReviewObservedAt ?? draft.returnReviewObservedAt,
    returnSessionId: answers.returnSessionId ?? draft.returnSessionId,
    measurementCheckedAt: answers.measurementCheckedAt ?? draft.measurementCheckedAt,
    measurementSessionId: answers.measurementSessionId ?? draft.measurementSessionId,
    ...normalizedAcquisition(
      answers.acquisitionSource ?? draft.acquisitionSource,
      answers.acquisitionMedium ?? draft.acquisitionMedium,
      answers.acquisitionCampaign ?? draft.acquisitionCampaign
    )
  };
  assertControlTowerValidationRecord(record);
  return record;
}

function assertNullableBoolean(record: Record<string, unknown>, field: string): void {
  const value = record[field];
  if (value !== null && typeof value !== 'boolean') throw new Error(`${field} must be boolean or null`);
}

function assertEnum(values: readonly string[], value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`${field} is invalid`);
}

function assertNullableOpaqueId(value: unknown, field: string): void {
  if (value === null) return;
  if (!isOpaqueCtId(value)) throw new Error(`${field} must be a bounded opaque identifier`);
}

function assertNullableInstant(value: unknown, field: string): void {
  if (value === null) return;
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO UTC instant`);
  }
}

const CANONICAL_FIELDS = new Set([
  'id','storeCount','storeBucket','participantRoleClass','targetIcp','evidenceProvenance',
  'permissionedSession','sessionPermissionReceiptId','merchantDataPermissionReceiptId',
  'transactionSourcesReviewed','transactionSources',
  'trustedDataReviewed','metricTrusted','dailyBriefReviewed','dailyBriefUseful',
  'storeHealthReviewed','storeHealthUseful','attentionReviewed','actionCreated',
  'returnReviewObserved','terminalActionReviewed','measurementAvailable','measurementChecked',
  'nonCausalWordingUnderstood','repeatLoopAsked','repeatLoopIntent','continuousSyncAsked',
  'continuousSyncIntent','workflowConceptReviewed','workflowConceptUnderstood',
  'actionCreatedAt','actionSessionId','returnReviewObservedAt','returnSessionId',
  'measurementCheckedAt','measurementSessionId',
  'acquisitionSource','acquisitionMedium','acquisitionCampaign'
]);

export function assertControlTowerValidationRecord(
  value: unknown
): asserts value is ControlTowerValidationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Control Tower validation record must be an object');
  }
  const r = value as Record<string, unknown>;
  const unknown = Object.keys(r).filter(key => !CANONICAL_FIELDS.has(key));
  if (unknown.length) throw new Error(`Unknown Control Tower validation fields: ${unknown.join(', ')}`);

  if (!isOpaqueCtId(r.id)) throw new Error('id must be a bounded opaque identifier');
  if (!Number.isInteger(r.storeCount) || (r.storeCount as number) < 1) throw new Error('storeCount must be a positive integer');
  assertEnum(CT_STORE_BUCKETS, r.storeBucket, 'storeBucket');
  assertEnum(CT_PARTICIPANT_ROLES, r.participantRoleClass, 'participantRoleClass', true);
  assertEnum(CT_PROVENANCE, r.evidenceProvenance, 'evidenceProvenance');
  if (typeof r.targetIcp !== 'boolean') throw new Error('targetIcp must be boolean');
  if (typeof r.permissionedSession !== 'boolean') throw new Error('permissionedSession must be boolean');

  const expectedBucket = deriveCtStoreBucket(r.storeCount as number);
  if (r.storeBucket !== expectedBucket) throw new Error(`storeBucket must equal derived bucket ${expectedBucket}`);
  const expectedTarget = deriveCtTargetIcp(
    r.participantRoleClass as CtParticipantRoleClass | null,
    r.storeCount as number
  );
  if (r.targetIcp !== expectedTarget) throw new Error('targetIcp does not match role/store eligibility');

  assertNullableOpaqueId(r.sessionPermissionReceiptId, 'sessionPermissionReceiptId');
  assertNullableOpaqueId(r.merchantDataPermissionReceiptId, 'merchantDataPermissionReceiptId');
  if (r.permissionedSession && !isOpaqueCtId(r.sessionPermissionReceiptId)) {
    throw new Error('permissionedSession requires sessionPermissionReceiptId');
  }
  if (
    r.evidenceProvenance === 'merchant_data_permissioned' &&
    (!r.permissionedSession || !isOpaqueCtId(r.merchantDataPermissionReceiptId))
  ) {
    throw new Error('merchant_data_permissioned requires permissioned session and merchantDataPermissionReceiptId');
  }

  for (const field of EVIDENCE_FIELDS) assertNullableBoolean(r, field);

  if (r.transactionSources !== null && !Array.isArray(r.transactionSources)) {
    throw new Error('transactionSources must be an array or null');
  }
  if (r.transactionSourcesReviewed === true && !Array.isArray(r.transactionSources)) {
    throw new Error('transactionSourcesReviewed=true requires transactionSources array');
  }
  if (r.transactionSourcesReviewed !== true && r.transactionSources !== null) {
    throw new Error('transactionSources require transactionSourcesReviewed=true');
  }
  if (Array.isArray(r.transactionSources)) {
    let primaryCount = 0;
    const seen = new Set<string>();
    for (const raw of r.transactionSources) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('transaction source item must be an object');
      const item = raw as Record<string, unknown>;
      const nestedUnknown = Object.keys(item).filter(key => !['sourceKey','evidenceKind','primary'].includes(key));
      if (nestedUnknown.length) throw new Error(`Unknown transaction source fields: ${nestedUnknown.join(', ')}`);
      assertEnum(CT_TRANSACTION_SOURCES, item.sourceKey, 'transactionSources.sourceKey');
      assertEnum(CT_SOURCE_EVIDENCE_KINDS, item.evidenceKind, 'transactionSources.evidenceKind');
      if (typeof item.primary !== 'boolean') throw new Error('transactionSources.primary must be boolean');
      if (seen.has(item.sourceKey as string)) throw new Error('duplicate transaction sourceKey');
      seen.add(item.sourceKey as string);
      if (item.primary) primaryCount++;
      if (
        item.evidenceKind === 'merchant_data_permissioned' &&
        r.evidenceProvenance !== 'merchant_data_permissioned'
      ) {
        throw new Error('merchant_data_permissioned source evidence requires merchant_data_permissioned provenance');
      }
    }
    if (primaryCount > 1) throw new Error('at most one transaction source may be primary');
  }

  if (r.metricTrusted === true && r.trustedDataReviewed !== true) {
    throw new Error('metricTrusted requires trustedDataReviewed');
  }
  if (r.dailyBriefUseful === true && (r.dailyBriefReviewed !== true || r.metricTrusted !== true)) {
    throw new Error('dailyBriefUseful requires dailyBriefReviewed and metricTrusted');
  }
  if (r.storeHealthUseful === true && (r.storeHealthReviewed !== true || r.metricTrusted !== true)) {
    throw new Error('storeHealthUseful requires storeHealthReviewed and metricTrusted');
  }
  if (r.actionCreated === true && r.attentionReviewed !== true) throw new Error('actionCreated requires attentionReviewed');
  if (r.returnReviewObserved === true && r.actionCreated !== true) throw new Error('returnReviewObserved requires actionCreated');
  if (r.terminalActionReviewed === true && r.returnReviewObserved !== true) {
    throw new Error('terminalActionReviewed requires returnReviewObserved');
  }
  if (r.measurementChecked === true && (r.measurementAvailable !== true || r.actionCreated !== true)) {
    throw new Error('measurementChecked requires measurementAvailable and actionCreated');
  }
  if (r.nonCausalWordingUnderstood === true && r.measurementChecked !== true) {
    throw new Error('nonCausalWordingUnderstood requires measurementChecked');
  }
  if (r.repeatLoopIntent === true && r.repeatLoopAsked !== true) throw new Error('repeatLoopIntent requires repeatLoopAsked');
  if (r.continuousSyncIntent === true && r.continuousSyncAsked !== true) {
    throw new Error('continuousSyncIntent requires continuousSyncAsked');
  }
  if (r.workflowConceptUnderstood === true && r.workflowConceptReviewed !== true) {
    throw new Error('workflowConceptUnderstood requires workflowConceptReviewed');
  }

  for (const field of ['actionCreatedAt','returnReviewObservedAt','measurementCheckedAt']) {
    assertNullableInstant(r[field], field);
  }
  for (const field of ['actionSessionId','returnSessionId','measurementSessionId']) {
    assertNullableOpaqueId(r[field], field);
  }

  if (r.actionCreated === true) {
    if (r.actionCreatedAt === null || r.actionSessionId === null) {
      throw new Error('actionCreated requires actionCreatedAt and actionSessionId');
    }
  }
  if (r.returnReviewObserved === true) {
    if (r.returnReviewObservedAt === null || r.returnSessionId === null) {
      throw new Error('returnReviewObserved requires return timestamp and session');
    }
    if (Date.parse(r.returnReviewObservedAt as string) <= Date.parse(r.actionCreatedAt as string)) {
      throw new Error('return review must occur after action creation');
    }
    if (r.returnSessionId === r.actionSessionId) throw new Error('return review requires a distinct session');
  }
  if (r.measurementChecked === true) {
    if (r.measurementCheckedAt === null || r.measurementSessionId === null) {
      throw new Error('measurementChecked requires measurement timestamp and session');
    }
    if (Date.parse(r.measurementCheckedAt as string) <= Date.parse(r.actionCreatedAt as string)) {
      throw new Error('measurement check must occur after action creation');
    }
  }

  if ('acquisitionSource' in r) assertEnum(CT_ACQUISITION_SOURCES, r.acquisitionSource, 'acquisitionSource');
  if ('acquisitionMedium' in r) assertEnum(CT_ACQUISITION_MEDIA, r.acquisitionMedium, 'acquisitionMedium');
  if ('acquisitionCampaign' in r) assertEnum(CT_ACQUISITION_CAMPAIGNS, r.acquisitionCampaign, 'acquisitionCampaign');
  if ('acquisitionCampaign' in r && (!('acquisitionSource' in r) || !('acquisitionMedium' in r))) {
    throw new Error('acquisitionCampaign requires acquisitionSource and acquisitionMedium');
  }
}

function metric(records: ControlTowerValidationRecord[], denominator: (r: ControlTowerValidationRecord) => boolean, numerator: (r: ControlTowerValidationRecord) => boolean): EvidenceRate {
  const eligible = records.filter(denominator);
  const n = eligible.filter(numerator).length;
  return { numerator: n, denominator: eligible.length, rate: eligible.length === 0 ? null : n / eligible.length };
}

export function summarizeControlTowerValidation(
  input: readonly ControlTowerValidationRecord[]
): ControlTowerPublicSummary {
  const records = [...input];
  for (const record of records) assertControlTowerValidationRecord(record);

  const targetPermissioned = records.filter(r => r.targetIcp && r.permissionedSession);
  const e1 = targetPermissioned.filter(r => r.evidenceProvenance === 'operator_synthetic_assisted');
  const e2 = targetPermissioned.filter(r => r.evidenceProvenance === 'merchant_data_permissioned');

  const sourceEligible = targetPermissioned.filter(r =>
    r.evidenceProvenance !== 'synthetic_technical' &&
    r.transactionSourcesReviewed === true
  );
  const sourceAccumulator = new Map<CtTransactionSourceKey, {
    sessions: number;
    evidenceKinds: Record<CtSourceEvidenceKind, number>;
  }>();
  for (const record of sourceEligible) {
    for (const item of record.transactionSources ?? []) {
      const current = sourceAccumulator.get(item.sourceKey) ?? {
        sessions: 0,
        evidenceKinds: { operator_stated: 0, export_observed: 0, merchant_data_permissioned: 0 }
      };
      current.sessions++;
      current.evidenceKinds[item.evidenceKind]++;
      sourceAccumulator.set(item.sourceKey, current);
    }
  }
  const sources: Partial<Record<CtTransactionSourceKey, SourcePrevalenceItem>> = {};
  for (const key of CT_TRANSACTION_SOURCES) {
    const item = sourceAccumulator.get(key);
    if (!item) continue;
    sources[key] = {
      sessions: item.sessions,
      rate: sourceEligible.length === 0 ? null : item.sessions / sourceEligible.length,
      evidenceKinds: item.evidenceKinds
    };
  }

  return {
    status: 'COLLECTING_EVIDENCE',
    operatorSyntheticAssisted: {
      targetPermissionedRecords: e1.length,
      workflowConceptUnderstanding: metric(e1, r => r.workflowConceptReviewed === true, r => r.workflowConceptUnderstood === true),
      repeatLoopIntent: metric(e1, r => r.repeatLoopAsked === true, r => r.repeatLoopIntent === true),
      nonCausalUnderstanding: metric(e1, r => r.measurementChecked === true, r => r.nonCausalWordingUnderstood === true)
    },
    merchantDataPermissioned: {
      targetPermissionedRecords: e2.length,
      dataTrust: metric(e2, r => r.trustedDataReviewed === true, r => r.metricTrusted === true),
      dailyBriefUsefulness: metric(e2, r => r.dailyBriefReviewed === true && r.metricTrusted === true, r => r.dailyBriefUseful === true),
      storeHealthUsefulness: metric(e2, r => r.storeHealthReviewed === true && r.metricTrusted === true, r => r.storeHealthUseful === true),
      actionConversion: metric(e2, r => r.attentionReviewed === true, r => r.actionCreated === true),
      returnReview: metric(e2, r => r.actionCreated === true && r.returnReviewObserved !== null, r => r.returnReviewObserved === true),
      terminalReview: metric(e2, r => r.returnReviewObserved === true && r.terminalActionReviewed !== null, r => r.terminalActionReviewed === true),
      measurementCheck: metric(e2, r => r.measurementAvailable === true, r => r.measurementChecked === true),
      nonCausalUnderstanding: metric(e2, r => r.measurementChecked === true, r => r.nonCausalWordingUnderstood === true),
      repeatLoopIntent: metric(e2, r => r.repeatLoopAsked === true, r => r.repeatLoopIntent === true),
      continuousSyncIntent: metric(e2, r => r.continuousSyncAsked === true, r => r.continuousSyncIntent === true),
      completeLoopObserved: e2.filter(r =>
        r.metricTrusted === true &&
        (r.dailyBriefUseful === true || r.storeHealthUseful === true) &&
        r.actionCreated === true &&
        r.returnReviewObserved === true &&
        r.measurementChecked === true
      ).length
    },
    transactionSourcePrevalence: {
      reviewedSessions: sourceEligible.length,
      sources
    }
  };
}
