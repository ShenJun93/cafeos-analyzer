export const CONTROL_TOWER_STORE_BUCKETS = ['1', '2', '3-5', '6-10', '11-15', '16+'] as const;
export type ControlTowerStoreBucket = typeof CONTROL_TOWER_STORE_BUCKETS[number];

export const CONTROL_TOWER_PARTICIPANT_ROLES = [
  'owner_operator',
  'hq_decision_maker',
  'other'
] as const;
export type ControlTowerParticipantRoleClass = typeof CONTROL_TOWER_PARTICIPANT_ROLES[number];

export const CONTROL_TOWER_PROVENANCES = [
  'synthetic_technical',
  'operator_synthetic_assisted',
  'merchant_data_permissioned'
] as const;
export type ControlTowerEvidenceProvenance = typeof CONTROL_TOWER_PROVENANCES[number];

export const CONTROL_TOWER_SOURCE_KEYS = [
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
export type ControlTowerTransactionSourceKey = typeof CONTROL_TOWER_SOURCE_KEYS[number];

export const CONTROL_TOWER_SOURCE_EVIDENCE_KINDS = [
  'operator_stated',
  'export_observed',
  'merchant_data_permissioned'
] as const;
export type ControlTowerSourceEvidenceKind = typeof CONTROL_TOWER_SOURCE_EVIDENCE_KINDS[number];

export const CONTROL_TOWER_ACQUISITION_SOURCES = ['seo', 'direct', 'other'] as const;
export type ControlTowerAcquisitionSource = typeof CONTROL_TOWER_ACQUISITION_SOURCES[number];

export const CONTROL_TOWER_ACQUISITION_MEDIA = ['organic', 'none', 'other'] as const;
export type ControlTowerAcquisitionMedium = typeof CONTROL_TOWER_ACQUISITION_MEDIA[number];

export const CONTROL_TOWER_ACQUISITION_CAMPAIGNS = [
  'kiotviet-excel-analysis',
  'sapo-fnb-excel-analysis',
  'cafe-excel-analysis',
  'other'
] as const;
export type ControlTowerAcquisitionCampaign = typeof CONTROL_TOWER_ACQUISITION_CAMPAIGNS[number];

export type ControlTowerEvidenceBool = boolean | null;

export interface ControlTowerTransactionSourceItem {
  sourceKey: ControlTowerTransactionSourceKey;
  evidenceKind: ControlTowerSourceEvidenceKind;
  primary: boolean;
}

export interface CanonicalControlTowerValidationRecord {
  id: string;
  storeCount: number;
  storeBucket: ControlTowerStoreBucket;
  participantRoleClass: ControlTowerParticipantRoleClass;
  targetIcp: boolean;
  evidenceProvenance: ControlTowerEvidenceProvenance;

  permissionedSession: boolean;
  sessionPermissionReceiptId: string | null;
  merchantDataPermissionReceiptId: string | null;

  transactionSourcesReviewed: ControlTowerEvidenceBool;
  transactionSources: ControlTowerTransactionSourceItem[] | null;

  trustedDataReviewed: ControlTowerEvidenceBool;
  metricTrusted: ControlTowerEvidenceBool;
  dailyBriefReviewed: ControlTowerEvidenceBool;
  dailyBriefUseful: ControlTowerEvidenceBool;
  storeHealthReviewed: ControlTowerEvidenceBool;
  storeHealthUseful: ControlTowerEvidenceBool;
  attentionReviewed: ControlTowerEvidenceBool;
  actionCreated: ControlTowerEvidenceBool;
  returnReviewObserved: ControlTowerEvidenceBool;
  terminalActionReviewed: ControlTowerEvidenceBool;
  measurementAvailable: ControlTowerEvidenceBool;
  measurementChecked: ControlTowerEvidenceBool;
  nonCausalWordingUnderstood: ControlTowerEvidenceBool;
  repeatLoopAsked: ControlTowerEvidenceBool;
  repeatLoopIntent: ControlTowerEvidenceBool;
  continuousSyncAsked: ControlTowerEvidenceBool;
  continuousSyncIntent: ControlTowerEvidenceBool;
  workflowConceptReviewed: ControlTowerEvidenceBool;
  workflowConceptUnderstood: ControlTowerEvidenceBool;

  actionCreatedAt: string | null;
  actionSessionId: string | null;
  returnReviewObservedAt: string | null;
  returnSessionId: string | null;
  measurementCheckedAt: string | null;
  measurementSessionId: string | null;

  acquisitionSource?: ControlTowerAcquisitionSource;
  acquisitionMedium?: ControlTowerAcquisitionMedium;
  acquisitionCampaign?: ControlTowerAcquisitionCampaign;
}

export interface ControlTowerValidationDraft
  extends Omit<CanonicalControlTowerValidationRecord, 'storeBucket' | 'targetIcp' | 'participantRoleClass'> {
  participantRoleClass: ControlTowerParticipantRoleClass | null;
}

export interface ControlTowerEvidenceMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface ControlTowerValidationSummary {
  status: 'COLLECTING_EVIDENCE';
  operatorSyntheticAssisted: {
    targetPermissionedRecords: number;
    workflowConceptUnderstanding: ControlTowerEvidenceMetric;
    nonCausalUnderstanding: ControlTowerEvidenceMetric;
    repeatLoopIntent: ControlTowerEvidenceMetric;
    continuousSyncIntent: ControlTowerEvidenceMetric;
  };
  merchantDataPermissioned: {
    targetPermissionedRecords: number;
    dataTrust: ControlTowerEvidenceMetric;
    dailyBriefUseful: ControlTowerEvidenceMetric;
    storeHealthUseful: ControlTowerEvidenceMetric;
    actionConversion: ControlTowerEvidenceMetric;
    returnReview: ControlTowerEvidenceMetric;
    terminalReview: ControlTowerEvidenceMetric;
    measurementCheck: ControlTowerEvidenceMetric;
    nonCausalUnderstanding: ControlTowerEvidenceMetric;
    repeatLoopIntent: ControlTowerEvidenceMetric;
    continuousSyncIntent: ControlTowerEvidenceMetric;
    completeLoopObserved: number;
  };
  transactionSourcePrevalence: {
    reviewedSessions: number;
    sources: Record<ControlTowerTransactionSourceKey, {
      sessions: number;
      rate: number | null;
      evidenceKinds: Record<ControlTowerSourceEvidenceKind, number>;
    }>;
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

const SOURCE_EVIDENCE_STRENGTH: Record<ControlTowerSourceEvidenceKind, number> = {
  operator_stated: 1,
  export_observed: 2,
  merchant_data_permissioned: 3
};

export function deriveControlTowerStoreBucket(storeCount: number): ControlTowerStoreBucket {
  if (!Number.isInteger(storeCount) || storeCount < 1) throw new Error('storeCount must be a positive integer');
  if (storeCount === 1) return '1';
  if (storeCount === 2) return '2';
  if (storeCount <= 5) return '3-5';
  if (storeCount <= 10) return '6-10';
  if (storeCount <= 15) return '11-15';
  return '16+';
}

export function deriveControlTowerTargetIcp(
  participantRoleClass: ControlTowerParticipantRoleClass,
  storeCount: number
): boolean {
  const roleEligible =
    participantRoleClass === 'owner_operator' ||
    participantRoleClass === 'hq_decision_maker';
  return roleEligible && storeCount >= 3 && storeCount <= 15;
}

function emptyEvidence(): Pick<ControlTowerValidationDraft, typeof EVIDENCE_FIELDS[number]> {
  return Object.fromEntries(EVIDENCE_FIELDS.map(field => [field, null])) as
    Pick<ControlTowerValidationDraft, typeof EVIDENCE_FIELDS[number]>;
}

export function createControlTowerValidationDraft(input: {
  id: string;
  storeCount: number;
  participantRoleClass?: ControlTowerParticipantRoleClass | null;
  evidenceProvenance: ControlTowerEvidenceProvenance;
}): ControlTowerValidationDraft {
  deriveControlTowerStoreBucket(input.storeCount);
  return {
    id: input.id,
    storeCount: input.storeCount,
    participantRoleClass: input.participantRoleClass ?? null,
    evidenceProvenance: input.evidenceProvenance,
    permissionedSession: false,
    sessionPermissionReceiptId: null,
    merchantDataPermissionReceiptId: null,
    transactionSources: null,
    ...emptyEvidence(),
    actionCreatedAt: null,
    actionSessionId: null,
    returnReviewObservedAt: null,
    returnSessionId: null,
    measurementCheckedAt: null,
    measurementSessionId: null
  };
}

export function finalizeControlTowerValidationDraft(
  draft: ControlTowerValidationDraft
): CanonicalControlTowerValidationRecord {
  if (draft.participantRoleClass === null) {
    throw new Error('participantRoleClass must be established before finalization');
  }
  const record: CanonicalControlTowerValidationRecord = {
    ...draft,
    participantRoleClass: draft.participantRoleClass,
    storeBucket: deriveControlTowerStoreBucket(draft.storeCount),
    targetIcp: deriveControlTowerTargetIcp(draft.participantRoleClass, draft.storeCount)
  };
  assertControlTowerEvidenceDependencies(record);
  return record;
}

function requireTrue(value: ControlTowerEvidenceBool, message: string): void {
  if (value !== true) throw new Error(message);
}

function requireTimestampAfter(
  candidate: string | null,
  baseline: string | null,
  label: string
): void {
  if (!candidate || !baseline) throw new Error(`${label} requires timestamps`);
  const candidateMs = Date.parse(candidate);
  const baselineMs = Date.parse(baseline);
  if (!Number.isFinite(candidateMs) || !Number.isFinite(baselineMs)) {
    throw new Error(`${label} timestamps must be valid ISO date-times`);
  }
  if (candidateMs <= baselineMs) {
    throw new Error(`${label} must occur after action creation`);
  }
}

export function assertControlTowerEvidenceDependencies(
  record: CanonicalControlTowerValidationRecord
): void {
  if (record.metricTrusted === true) {
    requireTrue(record.trustedDataReviewed, 'metricTrusted requires trustedDataReviewed');
  }
  if (record.dailyBriefUseful === true) {
    requireTrue(record.dailyBriefReviewed, 'dailyBriefUseful requires dailyBriefReviewed');
    requireTrue(record.metricTrusted, 'dailyBriefUseful requires metricTrusted');
  }
  if (record.storeHealthUseful === true) {
    requireTrue(record.storeHealthReviewed, 'storeHealthUseful requires storeHealthReviewed');
    requireTrue(record.metricTrusted, 'storeHealthUseful requires metricTrusted');
  }
  if (record.actionCreated === true) {
    requireTrue(record.attentionReviewed, 'actionCreated requires attentionReviewed');
    if (!record.actionCreatedAt || !record.actionSessionId) {
      throw new Error('actionCreated requires actionCreatedAt and actionSessionId');
    }
  }
  if (record.returnReviewObserved === true) {
    requireTrue(record.actionCreated, 'returnReviewObserved requires actionCreated');
    requireTimestampAfter(
      record.returnReviewObservedAt,
      record.actionCreatedAt,
      'returnReviewObserved'
    );
    if (!record.returnSessionId || !record.actionSessionId) {
      throw new Error('returnReviewObserved requires returnSessionId and actionSessionId');
    }
    if (record.returnSessionId === record.actionSessionId) {
      throw new Error('returnReviewObserved requires a distinct later session');
    }
  }
  if (record.terminalActionReviewed === true) {
    requireTrue(record.returnReviewObserved, 'terminalActionReviewed requires returnReviewObserved');
  }
  if (record.measurementChecked === true) {
    requireTrue(record.measurementAvailable, 'measurementChecked requires measurementAvailable');
    requireTrue(record.actionCreated, 'measurementChecked requires actionCreated');
    requireTimestampAfter(
      record.measurementCheckedAt,
      record.actionCreatedAt,
      'measurementChecked'
    );
    if (!record.measurementSessionId) {
      throw new Error('measurementChecked requires measurementSessionId');
    }
  }
  if (record.nonCausalWordingUnderstood === true) {
    requireTrue(record.measurementChecked, 'nonCausalWordingUnderstood requires measurementChecked');
  }
  if (record.repeatLoopIntent === true) {
    requireTrue(record.repeatLoopAsked, 'repeatLoopIntent requires repeatLoopAsked');
  }
  if (record.continuousSyncIntent === true) {
    requireTrue(record.continuousSyncAsked, 'continuousSyncIntent requires continuousSyncAsked');
  }
  if (record.workflowConceptUnderstood === true) {
    requireTrue(record.workflowConceptReviewed, 'workflowConceptUnderstood requires workflowConceptReviewed');
  }

  if (record.permissionedSession && !record.sessionPermissionReceiptId) {
    throw new Error('permissionedSession requires sessionPermissionReceiptId');
  }
  if (!record.permissionedSession && record.sessionPermissionReceiptId) {
    throw new Error('sessionPermissionReceiptId requires permissionedSession');
  }
  if (record.evidenceProvenance === 'merchant_data_permissioned') {
    if (!record.permissionedSession) {
      throw new Error('merchant_data_permissioned requires permissionedSession');
    }
    if (!record.merchantDataPermissionReceiptId) {
      throw new Error('merchant_data_permissioned requires merchantDataPermissionReceiptId');
    }
  } else if (record.merchantDataPermissionReceiptId) {
    throw new Error('merchantDataPermissionReceiptId requires merchant_data_permissioned provenance');
  }

  if (record.transactionSourcesReviewed === true && record.transactionSources === null) {
    throw new Error('transactionSourcesReviewed requires a source array');
  }
  if (record.transactionSourcesReviewed !== true && record.transactionSources !== null) {
    throw new Error('transactionSources require transactionSourcesReviewed=true');
  }
  if (record.transactionSources) {
    const seen = new Set<ControlTowerTransactionSourceKey>();
    let primaryCount = 0;
    for (const source of record.transactionSources) {
      if (seen.has(source.sourceKey)) {
        throw new Error(`duplicate transaction source: ${source.sourceKey}`);
      }
      seen.add(source.sourceKey);
      if (source.primary) primaryCount += 1;
      if (
        source.evidenceKind === 'merchant_data_permissioned' &&
        record.evidenceProvenance !== 'merchant_data_permissioned'
      ) {
        throw new Error('merchant-data source evidence requires merchant_data_permissioned provenance');
      }
    }
    if (primaryCount > 1) throw new Error('transactionSources allow at most one primary source');
  }

  if (record.evidenceProvenance === 'operator_synthetic_assisted') {
    const forbiddenPositive = [
      record.metricTrusted,
      record.dailyBriefUseful,
      record.storeHealthUseful,
      record.actionCreated,
      record.returnReviewObserved,
      record.terminalActionReviewed,
      record.measurementChecked
    ];
    if (forbiddenPositive.some(value => value === true)) {
      throw new Error('operator_synthetic_assisted cannot record merchant-data workflow positives');
    }
  }
}

function metric(numerator: number, denominator: number): ControlTowerEvidenceMetric {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator
  };
}

function countMetric<T>(
  records: T[],
  eligible: (record: T) => boolean,
  positive: (record: T) => boolean
): ControlTowerEvidenceMetric {
  const denominatorRecords = records.filter(eligible);
  return metric(denominatorRecords.filter(positive).length, denominatorRecords.length);
}

function baseTarget(record: CanonicalControlTowerValidationRecord): boolean {
  return record.targetIcp && record.permissionedSession;
}

export function summarizeControlTowerValidation(
  records: CanonicalControlTowerValidationRecord[]
): ControlTowerValidationSummary {
  const e1 = records.filter(
    record =>
      baseTarget(record) &&
      record.evidenceProvenance === 'operator_synthetic_assisted'
  );
  const e2 = records.filter(
    record =>
      baseTarget(record) &&
      record.evidenceProvenance === 'merchant_data_permissioned'
  );

  const sourceEligible = records.filter(
    record =>
      baseTarget(record) &&
      (record.evidenceProvenance === 'operator_synthetic_assisted' ||
        record.evidenceProvenance === 'merchant_data_permissioned') &&
      record.transactionSourcesReviewed === true
  );

  const sources = Object.fromEntries(
    CONTROL_TOWER_SOURCE_KEYS.map(sourceKey => [
      sourceKey,
      {
        sessions: 0,
        rate: sourceEligible.length === 0 ? null : 0,
        evidenceKinds: {
          operator_stated: 0,
          export_observed: 0,
          merchant_data_permissioned: 0
        }
      }
    ])
  ) as ControlTowerValidationSummary['transactionSourcePrevalence']['sources'];

  for (const record of sourceEligible) {
    for (const source of record.transactionSources ?? []) {
      const summary = sources[source.sourceKey];
      summary.sessions += 1;
      summary.evidenceKinds[source.evidenceKind] += 1;
    }
  }
  for (const sourceKey of CONTROL_TOWER_SOURCE_KEYS) {
    sources[sourceKey].rate =
      sourceEligible.length === 0 ? null : sources[sourceKey].sessions / sourceEligible.length;
  }

  return {
    status: 'COLLECTING_EVIDENCE',
    operatorSyntheticAssisted: {
      targetPermissionedRecords: e1.length,
      workflowConceptUnderstanding: countMetric(
        e1,
        record => record.workflowConceptReviewed === true,
        record => record.workflowConceptUnderstood === true
      ),
      nonCausalUnderstanding: countMetric(
        e1,
        record => record.nonCausalWordingUnderstood !== null,
        record => record.nonCausalWordingUnderstood === true
      ),
      repeatLoopIntent: countMetric(
        e1,
        record => record.repeatLoopAsked === true,
        record => record.repeatLoopIntent === true
      ),
      continuousSyncIntent: countMetric(
        e1,
        record => record.continuousSyncAsked === true,
        record => record.continuousSyncIntent === true
      )
    },
    merchantDataPermissioned: {
      targetPermissionedRecords: e2.length,
      dataTrust: countMetric(
        e2,
        record => record.trustedDataReviewed === true,
        record => record.metricTrusted === true
      ),
      dailyBriefUseful: countMetric(
        e2,
        record => record.dailyBriefReviewed === true && record.metricTrusted === true,
        record => record.dailyBriefUseful === true
      ),
      storeHealthUseful: countMetric(
        e2,
        record => record.storeHealthReviewed === true && record.metricTrusted === true,
        record => record.storeHealthUseful === true
      ),
      actionConversion: countMetric(
        e2,
        record => record.attentionReviewed === true,
        record => record.actionCreated === true
      ),
      returnReview: countMetric(
        e2,
        record => record.actionCreated === true && record.returnReviewObserved !== null,
        record => record.returnReviewObserved === true
      ),
      terminalReview: countMetric(
        e2,
        record => record.returnReviewObserved === true && record.terminalActionReviewed !== null,
        record => record.terminalActionReviewed === true
      ),
      measurementCheck: countMetric(
        e2,
        record => record.measurementAvailable === true,
        record => record.measurementChecked === true
      ),
      nonCausalUnderstanding: countMetric(
        e2,
        record => record.measurementChecked === true,
        record => record.nonCausalWordingUnderstood === true
      ),
      repeatLoopIntent: countMetric(
        e2,
        record => record.repeatLoopAsked === true,
        record => record.repeatLoopIntent === true
      ),
      continuousSyncIntent: countMetric(
        e2,
        record => record.continuousSyncAsked === true,
        record => record.continuousSyncIntent === true
      ),
      completeLoopObserved: e2.filter(
        record =>
          record.metricTrusted === true &&
          (record.dailyBriefUseful === true || record.storeHealthUseful === true) &&
          record.actionCreated === true &&
          record.returnReviewObserved === true &&
          record.measurementChecked === true
      ).length
    },
    transactionSourcePrevalence: {
      reviewedSessions: sourceEligible.length,
      sources
    }
  };
}

export function compareSourceEvidenceStrength(
  left: ControlTowerSourceEvidenceKind,
  right: ControlTowerSourceEvidenceKind
): number {
  return SOURCE_EVIDENCE_STRENGTH[left] - SOURCE_EVIDENCE_STRENGTH[right];
}
