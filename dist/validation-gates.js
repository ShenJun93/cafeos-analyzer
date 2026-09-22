function metric(numerator, denominator, threshold) {
    if (denominator === 0)
        return { numerator, denominator, rate: null, threshold, pass: null };
    const rate = numerator / denominator;
    return { numerator, denominator, rate, threshold, pass: rate >= threshold };
}
export function evaluateFieldValidation(records, minimumTargetRecords = 10) {
    const target = records.filter(record => record.targetIcp && record.permissionedSession);
    const attempts = target.filter(record => record.importAttempted);
    const reconciled = target.filter(record => record.importSucceeded && record.reconciliationAttempted);
    const insightReviewed = target.filter(record => record.metricTrusted && record.insightReviewed);
    const repeatAsked = target.filter(record => record.repeatUseAsked);
    const syncAsked = target.filter(record => record.continuousSyncAsked);
    const wtpAsked = target.filter(record => record.valueDemonstrated && record.wtpAsked);
    const scorecard = {
        targetRecords: target.length,
        minimumTargetRecords,
        sampleReady: target.length >= minimumTargetRecords,
        importSuccess: metric(attempts.filter(r => r.importSucceeded).length, attempts.length, 0.80),
        metricTrust: metric(reconciled.filter(r => r.metricTrusted).length, reconciled.length, 0.90),
        usefulNewInsight: metric(insightReviewed.filter(r => r.usefulNewInsight).length, insightReviewed.length, 0.60),
        repeatUseIntent: metric(repeatAsked.filter(r => r.repeatUseIntent).length, repeatAsked.length, 0.40),
        continuousSyncIntent: metric(syncAsked.filter(r => r.continuousSyncIntent).length, syncAsked.length, 0.25),
        willingnessToPay: metric(wtpAsked.filter(r => r.willingnessToPay).length, wtpAsked.length, 0.20),
        overall: "INSUFFICIENT_EVIDENCE"
    };
    const metrics = [
        scorecard.importSuccess,
        scorecard.metricTrust,
        scorecard.usefulNewInsight,
        scorecard.repeatUseIntent,
        scorecard.continuousSyncIntent,
        scorecard.willingnessToPay
    ];
    if (!scorecard.sampleReady || metrics.some(x => x.pass === null))
        return scorecard;
    scorecard.overall = metrics.every(x => x.pass === true) ? "PASS" : "FAIL";
    return scorecard;
}
