import { type CanonicalAnalyzerValidationRecord, type ParticipantRoleClass, type PrivacyMode, type WtpBand } from './validation-record-contract.js';
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
export type InboundValidationRecord = CanonicalAnalyzerValidationRecord;
export interface InboundValidationDraft {
    status: 'DRAFT_NOT_SCOREABLE';
    id: string;
    source: CanonicalAnalyzerValidationRecord['source'];
    participantRoleClass: ParticipantRoleClass;
    permissionedSession: boolean;
    storeCount: number;
    storeBucket: CanonicalAnalyzerValidationRecord['storeBucket'];
    targetIcp: boolean;
    acquisitionSource?: CanonicalAnalyzerValidationRecord['acquisitionSource'];
    acquisitionMedium?: CanonicalAnalyzerValidationRecord['acquisitionMedium'];
    acquisitionCampaign?: CanonicalAnalyzerValidationRecord['acquisitionCampaign'];
    privacyMode?: PrivacyMode;
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
    wtpBand: WtpBand | null;
}
export interface InboundValidationDraftInput {
    id: string;
    source: string;
    participantRoleClass: ParticipantRoleClass;
    permissionedSession: boolean;
    storeCount: number;
    importSucceeded: boolean;
    acquisitionSource?: string;
    acquisitionMedium?: string;
    acquisitionCampaign?: string;
    privacyMode?: PrivacyMode;
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
    wtpBand?: WtpBand;
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
    participantRoleClass: ParticipantRoleClass;
    permissionedSession: boolean;
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
    wtpBand?: WtpBand;
    acquisitionSource?: string;
    acquisitionMedium?: string;
    acquisitionCampaign?: string;
    privacyMode?: PrivacyMode;
}
export declare function buildInboundValidationRecord(input: InboundValidationInput): InboundValidationRecord;
export declare function buildInboundValidationDraft(input: InboundValidationDraftInput): InboundValidationDraft;
export declare function finalizeInboundValidationDraft(draft: InboundValidationDraft, answers: InboundValidationAnswers): InboundValidationRecord;
export declare function summarizeAcquisitionFunnel(events: AcquisitionEvent[]): AcquisitionFunnelSummary;
export declare function acquisitionBreakdown(events: AcquisitionEvent[]): Record<string, number>;
