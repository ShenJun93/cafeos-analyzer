const rate = (a, b) => b === 0 ? null : a / b;
function bucketStores(n) {
    if (n <= 1)
        return '1';
    if (n === 2)
        return '2';
    if (n <= 5)
        return '3-5';
    if (n <= 10)
        return '6-10';
    if (n <= 15)
        return '11-15';
    return '16+';
}
export function buildInboundValidationRecord(input) {
    if (!Number.isInteger(input.storeCount) || input.storeCount < 1)
        throw new Error('storeCount must be a positive integer');
    return {
        id: input.id,
        source: input.source,
        targetIcp: input.storeCount >= 3 && input.storeCount <= 15,
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
        storeBucket: bucketStores(input.storeCount),
        acquisitionSource: input.acquisitionSource,
        acquisitionMedium: input.acquisitionMedium,
        acquisitionCampaign: input.acquisitionCampaign,
        privacyMode: input.privacyMode,
        wtpBand: input.wtpBand
    };
}
export function buildInboundValidationDraft(input) {
    if (!Number.isInteger(input.storeCount) || input.storeCount < 1)
        throw new Error('storeCount must be a positive integer');
    return {
        status: "DRAFT_NOT_SCOREABLE",
        id: input.id,
        source: input.source,
        storeCount: input.storeCount,
        storeBucket: bucketStores(input.storeCount),
        targetIcp: input.storeCount >= 3 && input.storeCount <= 15,
        acquisitionSource: input.acquisitionSource,
        acquisitionMedium: input.acquisitionMedium,
        acquisitionCampaign: input.acquisitionCampaign,
        privacyMode: input.privacyMode,
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
    if (draft.status !== "DRAFT_NOT_SCOREABLE")
        throw new Error('Expected a field-session draft');
    if (answers.metricTrusted && (!draft.importSucceeded || !answers.reconciliationAttempted))
        throw new Error('metricTrusted requires successful import and reconciliation');
    if (answers.usefulNewInsight && (!answers.metricTrusted || !answers.insightReviewed))
        throw new Error('usefulNewInsight requires trusted metrics and reviewed insight');
    if (answers.repeatUseIntent && !answers.repeatUseAsked)
        throw new Error('repeatUseIntent requires repeatUseAsked');
    if (answers.continuousSyncIntent && !answers.continuousSyncAsked)
        throw new Error('continuousSyncIntent requires continuousSyncAsked');
    if (answers.wtpAsked && !answers.valueDemonstrated)
        throw new Error('wtpAsked requires valueDemonstrated');
    if (answers.willingnessToPay && (!answers.wtpAsked || !answers.valueDemonstrated))
        throw new Error('willingnessToPay requires valueDemonstrated and wtpAsked');
    return buildInboundValidationRecord({
        id: draft.id, source: draft.source, storeCount: draft.storeCount,
        importAttempted: draft.importAttempted, importSucceeded: draft.importSucceeded,
        reconciliationAttempted: answers.reconciliationAttempted, metricTrusted: answers.metricTrusted,
        insightReviewed: answers.insightReviewed, usefulNewInsight: answers.usefulNewInsight,
        repeatUseAsked: answers.repeatUseAsked, repeatUseIntent: answers.repeatUseIntent,
        continuousSyncAsked: answers.continuousSyncAsked, continuousSyncIntent: answers.continuousSyncIntent,
        valueDemonstrated: answers.valueDemonstrated, wtpAsked: answers.wtpAsked, willingnessToPay: answers.willingnessToPay,
        wtpBand: answers.wtpBand, acquisitionSource: draft.acquisitionSource, acquisitionMedium: draft.acquisitionMedium,
        acquisitionCampaign: draft.acquisitionCampaign, privacyMode: draft.privacyMode
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
    return Object.fromEntries([...sessions.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, ids]) => [key, ids.size]));
}
