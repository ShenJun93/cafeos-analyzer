import {
  PARTICIPANT_ROLE_CLASSES,
  assertAnalyzerEvidenceDependencies,
  deriveAnalyzerStoreBucket,
  deriveAnalyzerTargetIcp,
  normalizeAcquisitionAttribution,
  normalizeAnalyzerSource,
  type CanonicalAnalyzerValidationRecord,
  type ParticipantRoleClass,
  type PrivacyMode,
  type WtpBand
} from './validation-record-contract.js';

export type AcquisitionEventName =
  | 'landing_view'
  | 'analyzer_opened'
  | 'upload_started'
  | 'report_completed'
  | 'compatibility_profile_downloaded'
  | 'feedback_record_downloaded';

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

const rate = (a: number, b: number): number | null => b === 0 ? null : a / b;

function assertRoleAndPermission(role: ParticipantRoleClass, permissionedSession: boolean): void {
  if (!PARTICIPANT_ROLE_CLASSES.includes(role)) {
    throw new Error('participantRoleClass must be owner_operator or other');
  }
  if (typeof permissionedSession !== 'boolean') {
    throw new Error('permissionedSession must be boolean');
  }
}

function attributionFields(input: {
  acquisitionSource?: string;
  acquisitionMedium?: string;
  acquisitionCampaign?: string;
}): Pick<CanonicalAnalyzerValidationRecord, 'acquisitionSource' | 'acquisitionMedium' | 'acquisitionCampaign'> | {} {
  return normalizeAcquisitionAttribution(
    input.acquisitionSource,
    input.acquisitionMedium,
    input.acquisitionCampaign
  );
}

export function buildInboundValidationRecord(input: InboundValidationInput): InboundValidationRecord {
  if (!Number.isInteger(input.storeCount) || input.storeCount < 1) {
    throw new Error('storeCount must be a positive integer');
  }
  assertRoleAndPermission(input.participantRoleClass, input.permissionedSession);

  const record: InboundValidationRecord = {
    id: input.id,
    source: normalizeAnalyzerSource(input.source),
    participantRoleClass: input.participantRoleClass,
    permissionedSession: input.permissionedSession,
    targetIcp: deriveAnalyzerTargetIcp(input.participantRoleClass, input.storeCount),
    importAttempted: input.importAttempted,
    importSucceeded: input.importSucceeded,
    reconciliationAttempted: input.reconciliationAttempted,
    metricTrusted: input.metricTrusted,
    insightReviewed: input.insightReviewed,
    usefulNewInsight: input.usefulNewInsight,
    repeatUseAsked: input.repeatUseAsked,
    repeatUseIntent: input.repeatUseIntent,
    continuousSyncAsked: input.continuousSyncAsked,
    continuousSyncIntent: input.continuousSyncIntent,
    valueDemonstrated: input.valueDemonstrated,
    wtpAsked: input.wtpAsked,
    willingnessToPay: input.willingnessToPay,
    storeCount: input.storeCount,
    storeBucket: deriveAnalyzerStoreBucket(input.storeCount),
    ...attributionFields(input),
    ...(input.privacyMode === undefined ? {} : { privacyMode: input.privacyMode }),
    ...(input.wtpBand === undefined ? {} : { wtpBand: input.wtpBand })
  };

  assertAnalyzerEvidenceDependencies(record);
  return record;
}

export function buildInboundValidationDraft(input: InboundValidationDraftInput): InboundValidationDraft {
  if (!Number.isInteger(input.storeCount) || input.storeCount < 1) {
    throw new Error('storeCount must be a positive integer');
  }
  assertRoleAndPermission(input.participantRoleClass, input.permissionedSession);

  return {
    status: 'DRAFT_NOT_SCOREABLE',
    id: input.id,
    source: normalizeAnalyzerSource(input.source),
    participantRoleClass: input.participantRoleClass,
    permissionedSession: input.permissionedSession,
    storeCount: input.storeCount,
    storeBucket: deriveAnalyzerStoreBucket(input.storeCount),
    targetIcp: deriveAnalyzerTargetIcp(input.participantRoleClass, input.storeCount),
    ...attributionFields(input),
    ...(input.privacyMode === undefined ? {} : { privacyMode: input.privacyMode }),
    importAttempted: true,
    importSucceeded: input.importSucceeded,
    reconciliationAttempted: null,
    metricTrusted: null,
    insightReviewed: null,
    usefulNewInsight: null,
    repeatUseAsked: null,
    repeatUseIntent: null,
    continuousSyncAsked: null,
    continuousSyncIntent: null,
    valueDemonstrated: null,
    wtpAsked: null,
    willingnessToPay: null,
    wtpBand: null
  };
}

export function finalizeInboundValidationDraft(
  draft: InboundValidationDraft,
  answers: InboundValidationAnswers
): InboundValidationRecord {
  if (draft.status !== 'DRAFT_NOT_SCOREABLE') throw new Error('Expected a field-session draft');
  return buildInboundValidationRecord({
    id: draft.id,
    source: draft.source,
    participantRoleClass: draft.participantRoleClass,
    permissionedSession: draft.permissionedSession,
    storeCount: draft.storeCount,
    importAttempted: draft.importAttempted,
    importSucceeded: draft.importSucceeded,
    reconciliationAttempted: answers.reconciliationAttempted,
    metricTrusted: answers.metricTrusted,
    insightReviewed: answers.insightReviewed,
    usefulNewInsight: answers.usefulNewInsight,
    repeatUseAsked: answers.repeatUseAsked,
    repeatUseIntent: answers.repeatUseIntent,
    continuousSyncAsked: answers.continuousSyncAsked,
    continuousSyncIntent: answers.continuousSyncIntent,
    valueDemonstrated: answers.valueDemonstrated,
    wtpAsked: answers.wtpAsked,
    willingnessToPay: answers.willingnessToPay,
    wtpBand: answers.wtpBand,
    acquisitionSource: draft.acquisitionSource,
    acquisitionMedium: draft.acquisitionMedium,
    acquisitionCampaign: draft.acquisitionCampaign,
    privacyMode: draft.privacyMode
  });
}

export function summarizeAcquisitionFunnel(events: AcquisitionEvent[]): AcquisitionFunnelSummary {
  const uniqueSessions = new Set(events.map(event => event.anonymousSessionId)).size;
  const sessionsFor = (name: AcquisitionEventName) =>
    new Set(events.filter(event => event.event === name).map(event => event.anonymousSessionId)).size;
  const landingViews = sessionsFor('landing_view');
  const analyzerOpened = sessionsFor('analyzer_opened');
  const uploadStarted = sessionsFor('upload_started');
  const reportCompleted = sessionsFor('report_completed');
  const profileDownloaded = sessionsFor('compatibility_profile_downloaded');
  const feedbackDownloaded = sessionsFor('feedback_record_downloaded');
  return {
    uniqueSessions,
    landingViews,
    analyzerOpened,
    uploadStarted,
    reportCompleted,
    profileDownloaded,
    feedbackDownloaded,
    landingToAnalyzer: rate(analyzerOpened, landingViews),
    analyzerToUpload: rate(uploadStarted, analyzerOpened),
    uploadToReport: rate(reportCompleted, uploadStarted),
    reportToFeedback: rate(feedbackDownloaded, reportCompleted)
  };
}

export function acquisitionBreakdown(events: AcquisitionEvent[]): Record<string, number> {
  const sessions = new Map<string, Set<string>>();
  for (const event of events) {
    const key = `${event.source ?? 'direct'} / ${event.medium ?? 'none'} / ${event.campaign ?? 'none'}`;
    if (!sessions.has(key)) sessions.set(key, new Set());
    sessions.get(key)!.add(event.anonymousSessionId);
  }
  return Object.fromEntries(
    [...sessions.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ids]) => [key, ids.size])
  );
}
