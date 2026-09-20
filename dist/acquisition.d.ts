import type { FieldValidationRecord } from './validation-gates.js';
export type AcquisitionEventName = 'landing_view' | 'analyzer_opened' | 'upload_started' | 'report_completed' | 'compatibility_profile_downloaded' | 'feedback_record_downloaded';
export interface AcquisitionEvent {
    id: string;
    at: string;
    event: AcquisitionEventName;
    anonymousSessionId: string;
    source?: string;
    medium?: string;
    campaign?: string;
    referrerHost?: string;
}
export interface InboundValidationDraft {
    status: "DRAFT_NOT_SCOREABLE";
    id: string;
    source: string;
    storeCount: number;
    storeBucket: InboundValidationRecord["storeBucket"];
    targetIcp: boolean;
    acquisitionSource?: string;
    acquisitionMedium?: string;
    acquisitionCampaign?: string;
    privacyMode?: InboundValidationRecord["privacyMode"];
    importAttempted: boolean;
    importSucceeded: boolean;
    reconciliationAttempted: boolean | null;
    metricTrusted: boolean | null;
    insightReviewed: boolean | null;
    usefulNewInsight: boolean | null;
    repeatUseAsked: boolean | null;
    repeatUseIntent: boolean | null;
    continuousSyncAsked: boolean | null;
    continuousSyncIntent: boolean | null;
    valueDemonstrated: boolean | null;
    wtpAsked: boolean | null;
    willingnessToPay: boolean | null;
    wtpBand: InboundValidationInput["wtpBand"] | null;
}
export interface InboundValidationDraftInput {
    id: string;
    source: string;
    storeCount: number;
    importSucceeded: boolean;
    acquisitionSource?: string;
    acquisitionMedium?: string;
    acquisitionCampaign?: string;
    privacyMode?: InboundValidationRecord["privacyMode"];
}
export interface InboundValidationAnswers {
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
    wtpBand?: InboundValidationInput["wtpBand"];
}
export interface AcquisitionFunnelSummary {
    uniqueSessions: number;
    landingViews: number;
    analyzerOpened: number;
    uploadStarted: number;
    reportCompleted: number;
    profileDownloaded: number;
    feedbackDownloaded: number;
    landingToAnalyzer: number | null;
    analyzerToUpload: number | null;
    uploadToReport: number | null;
    reportToFeedback: number | null;
}
export interface InboundValidationInput {
    id: string;
    source: string;
    storeCount: number;
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
    wtpBand?: '0' | '<500k' | '500k-1m' | '1m-2m' | '2m+';
    acquisitionSource?: string;
    acquisitionMedium?: string;
    acquisitionCampaign?: string;
    privacyMode?: 'local-only' | 'profile' | 'pseudonymized' | 'permissioned-raw';
}
export interface InboundValidationRecord extends FieldValidationRecord {
    storeCount: number;
    storeBucket: '1' | '2' | '3-5' | '6-10' | '11-15' | '16+';
    acquisitionSource?: string;
    acquisitionMedium?: string;
    acquisitionCampaign?: string;
    privacyMode?: 'local-only' | 'profile' | 'pseudonymized' | 'permissioned-raw';
    wtpBand?: InboundValidationInput['wtpBand'];
}
export declare function buildInboundValidationRecord(input: InboundValidationInput): InboundValidationRecord;
export declare function buildInboundValidationDraft(input: InboundValidationDraftInput): InboundValidationDraft;
export declare function finalizeInboundValidationDraft(draft: InboundValidationDraft, answers: InboundValidationAnswers): InboundValidationRecord;
export declare function summarizeAcquisitionFunnel(events: AcquisitionEvent[]): AcquisitionFunnelSummary;
export declare function acquisitionBreakdown(events: AcquisitionEvent[]): Record<string, number>;
