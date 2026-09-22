export interface FieldValidationRecord {
    id: string;
    source: string;
    targetIcp: boolean;
    permissionedSession: boolean;
    importAttempted: boolean;
    importSucceeded: boolean;
    reconciliationAttempted: boolean;
    metricTrusted: boolean;
    insightReviewed: boolean;
    usefulNewInsight: boolean;
    repeatUseAsked: boolean;
    repeatUseIntent: boolean;
    continuousSyncAsked: boolean;
    continuousSyncIntent: boolean;
    valueDemonstrated: boolean;
    wtpAsked: boolean;
    willingnessToPay: boolean;
}
export interface ValidationGateMetric {
    numerator: number;
    denominator: number;
    rate: number | null;
    threshold: number;
    pass: boolean | null;
}
export interface FieldValidationScorecard {
    targetRecords: number;
    minimumTargetRecords: number;
    sampleReady: boolean;
    importSuccess: ValidationGateMetric;
    metricTrust: ValidationGateMetric;
    usefulNewInsight: ValidationGateMetric;
    repeatUseIntent: ValidationGateMetric;
    continuousSyncIntent: ValidationGateMetric;
    willingnessToPay: ValidationGateMetric;
    overall: "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";
}
export declare function evaluateFieldValidation(records: FieldValidationRecord[], minimumTargetRecords?: number): FieldValidationScorecard;
