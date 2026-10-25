export declare const CONTROL_TOWER_STORE_BUCKETS: readonly ['1', '2', '3-5', '6-10', '11-15', '16+'];
export type ControlTowerStoreBucket = typeof CONTROL_TOWER_STORE_BUCKETS[number];
export declare const CONTROL_TOWER_PARTICIPANT_ROLES: readonly ['owner_operator', 'hq_decision_maker', 'other'];
export type ControlTowerParticipantRoleClass = typeof CONTROL_TOWER_PARTICIPANT_ROLES[number];
export declare const CONTROL_TOWER_PROVENANCES: readonly ['synthetic_technical', 'operator_synthetic_assisted', 'merchant_data_permissioned'];
export type ControlTowerEvidenceProvenance = typeof CONTROL_TOWER_PROVENANCES[number];
export declare const CONTROL_TOWER_SOURCE_KEYS: readonly ['kiotviet_fnb', 'sapo_fnb', 'cukcuk', 'pos365', 'ipos', 'haravan', 'generic_excel_csv', 'other_pos', 'unknown'];
export type ControlTowerTransactionSourceKey = typeof CONTROL_TOWER_SOURCE_KEYS[number];
export declare const CONTROL_TOWER_SOURCE_EVIDENCE_KINDS: readonly ['operator_stated', 'export_observed', 'merchant_data_permissioned'];
export type ControlTowerSourceEvidenceKind = typeof CONTROL_TOWER_SOURCE_EVIDENCE_KINDS[number];
export declare const CONTROL_TOWER_ACQUISITION_SOURCES: readonly ['seo', 'direct', 'other'];
export type ControlTowerAcquisitionSource = typeof CONTROL_TOWER_ACQUISITION_SOURCES[number];
export declare const CONTROL_TOWER_ACQUISITION_MEDIA: readonly ['organic', 'none', 'other'];
export type ControlTowerAcquisitionMedium = typeof CONTROL_TOWER_ACQUISITION_MEDIA[number];
export declare const CONTROL_TOWER_ACQUISITION_CAMPAIGNS: readonly ['kiotviet-excel-analysis', 'sapo-fnb-excel-analysis', 'cafe-excel-analysis', 'other'];
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
export interface ControlTowerValidationDraft extends Omit<CanonicalControlTowerValidationRecord, 'storeBucket' | 'targetIcp' | 'participantRoleClass'> {
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
export declare function deriveControlTowerStoreBucket(storeCount: number): ControlTowerStoreBucket;
export declare function deriveControlTowerTargetIcp(participantRoleClass: ControlTowerParticipantRoleClass, storeCount: number): boolean;
export declare function createControlTowerValidationDraft(input: {
    id: string;
    storeCount: number;
    participantRoleClass?: ControlTowerParticipantRoleClass | null;
    evidenceProvenance: ControlTowerEvidenceProvenance;
}): ControlTowerValidationDraft;
export declare function finalizeControlTowerValidationDraft(draft: ControlTowerValidationDraft): CanonicalControlTowerValidationRecord;
export declare function assertControlTowerEvidenceDependencies(record: CanonicalControlTowerValidationRecord): void;
export declare function summarizeControlTowerValidation(records: CanonicalControlTowerValidationRecord[]): ControlTowerValidationSummary;
export declare function compareSourceEvidenceStrength(left: ControlTowerSourceEvidenceKind, right: ControlTowerSourceEvidenceKind): number;
