import { PARTICIPANT_ROLE_CLASSES, assertAnalyzerEvidenceDependencies, deriveAnalyzerStoreBucket, deriveAnalyzerTargetIcp, normalizeAcquisitionAttribution, normalizeAnalyzerSource } from './validation-record-contract.js';
const rate = (a, b) => b === 0 ? null : a / b;
function assertRoleAndPermission(role, permissionedSession) {
    if (!PARTICIPANT_ROLE_CLASSES.includes(role)) {
        throw new Error('participantRoleClass must be owner_operator or other');
    }
    if (typeof permissionedSession !== 'boolean') {
        throw new Error('permissionedSession must be boolean');
    }
}
function attributionFields(input) {
    return normalizeAcquisitionAttribution(input.acquisitionSource, input.acquisitionMedium, input.acquisitionCampaign);
}
export function buildInboundValidationRecord(input) {
    if (!Number.isInteger(input.storeCount) || input.storeCount < 1) {
        throw new Error('storeCount must be a positive integer');
    }
    assertRoleAndPermission(input.participantRoleClass, input.permissionedSession);
    const record = {
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
export function buildInboundValidationDraft(input) {
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
export function finalizeInboundValidationDraft(draft, answers) {
    if (draft.status !== 'DRAFT_NOT_SCOREABLE')
        throw new Error('Expected a field-session draft');
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
export function summarizeAcquisitionFunnel(events) {
    const uniqueSessions = new Set(events.map(event => event.anonymousSessionId)).size;
    const sessionsFor = (name) => new Set(events.filter(event => event.event === name).map(event => event.anonymousSessionId)).size;
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
export function acquisitionBreakdown(events) {
    const sessions = new Map();
    for (const event of events) {
        const key = `${event.source ?? 'direct'} / ${event.medium ?? 'none'} / ${event.campaign ?? 'none'}`;
        if (!sessions.has(key))
            sessions.set(key, new Set());
        sessions.get(key).add(event.anonymousSessionId);
    }
    return Object.fromEntries([...sessions.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, ids]) => [key, ids.size]));
}
