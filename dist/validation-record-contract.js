export const ANALYZER_SOURCE_CLASSES = [
    'kiotviet',
    'cukcuk',
    'sapo_fnb',
    'ipos',
    'pos365',
    'generic_excel_csv',
    'other_pos',
    'unknown'
];
export const PARTICIPANT_ROLE_CLASSES = ['owner_operator', 'other'];
export const STORE_BUCKETS = ['1', '2', '3-5', '6-10', '11-15', '16+'];
export const PRIVACY_MODES = ['local-only', 'profile', 'pseudonymized', 'permissioned-raw'];
export const WTP_BANDS = ['0', '<500k', '500k-1m', '1m-2m', '2m+'];
export const ACQUISITION_SOURCES = ['seo', 'direct', 'other'];
export const ACQUISITION_MEDIA = ['organic', 'none', 'other'];
export const ACQUISITION_CAMPAIGNS = [
    'kiotviet-excel-analysis',
    'sapo-fnb-excel-analysis',
    'cafe-excel-analysis',
    'other'
];
export function deriveAnalyzerStoreBucket(storeCount) {
    if (!Number.isInteger(storeCount) || storeCount < 1)
        throw new Error('storeCount must be a positive integer');
    if (storeCount <= 1)
        return '1';
    if (storeCount === 2)
        return '2';
    if (storeCount <= 5)
        return '3-5';
    if (storeCount <= 10)
        return '6-10';
    if (storeCount <= 15)
        return '11-15';
    return '16+';
}
export function deriveAnalyzerTargetIcp(participantRoleClass, storeCount) {
    return participantRoleClass === 'owner_operator' && storeCount >= 3 && storeCount <= 15;
}
export function normalizeAnalyzerSource(raw) {
    const value = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!value)
        return 'unknown';
    if (value === 'kiotviet')
        return 'kiotviet';
    if (value === 'cukcuk')
        return 'cukcuk';
    if (value === 'sapo_fnb' || value === 'sapo-fnb' || value === 'sapo')
        return 'sapo_fnb';
    if (value === 'ipos')
        return 'ipos';
    if (value === 'pos365')
        return 'pos365';
    if (value === 'generic_excel_csv' ||
        value === 'generic-excel-csv' ||
        value === 'excel-other' ||
        value === 'excel_other' ||
        value === 'excel' ||
        value === 'csv')
        return 'generic_excel_csv';
    if (value === 'other_pos' || value === 'other-pos' || value === 'other')
        return 'other_pos';
    if (value === 'unknown')
        return 'unknown';
    return 'other_pos';
}
export function normalizeAcquisitionAttribution(source, medium, campaign) {
    const s = String(source ?? '').trim().toLowerCase();
    const m = String(medium ?? '').trim().toLowerCase();
    const c = String(campaign ?? '').trim().toLowerCase();
    if (!s && !m && !c)
        return {};
    const knownCampaigns = new Set([
        'kiotviet-excel-analysis',
        'sapo-fnb-excel-analysis',
        'cafe-excel-analysis'
    ]);
    if (s === 'seo' && m === 'organic' && knownCampaigns.has(c)) {
        return {
            acquisitionSource: 'seo',
            acquisitionMedium: 'organic',
            acquisitionCampaign: c
        };
    }
    if ((s === 'direct' || !s) && (m === 'none' || !m) && !c) {
        return {
            acquisitionSource: 'direct',
            acquisitionMedium: 'none'
        };
    }
    return {
        acquisitionSource: 'other',
        acquisitionMedium: 'other',
        acquisitionCampaign: 'other'
    };
}
export function assertAnalyzerEvidenceDependencies(record) {
    if (record.importSucceeded && !record.importAttempted) {
        throw new Error('importSucceeded requires importAttempted');
    }
    if (record.metricTrusted && (!record.importSucceeded || !record.reconciliationAttempted)) {
        throw new Error('metricTrusted requires successful import and reconciliation');
    }
    if (record.usefulNewInsight && (!record.metricTrusted || !record.insightReviewed)) {
        throw new Error('usefulNewInsight requires trusted metrics and reviewed insight');
    }
    if (record.repeatUseIntent && !record.repeatUseAsked) {
        throw new Error('repeatUseIntent requires repeatUseAsked');
    }
    if (record.continuousSyncIntent && !record.continuousSyncAsked) {
        throw new Error('continuousSyncIntent requires continuousSyncAsked');
    }
    if (record.wtpAsked && !record.valueDemonstrated) {
        throw new Error('wtpAsked requires valueDemonstrated');
    }
    if (record.willingnessToPay && (!record.wtpAsked || !record.valueDemonstrated)) {
        throw new Error('willingnessToPay requires valueDemonstrated and wtpAsked');
    }
    if (!record.wtpAsked && record.wtpBand !== undefined) {
        throw new Error('wtpBand requires wtpAsked');
    }
    if (record.wtpAsked && !record.willingnessToPay && record.wtpBand !== undefined && record.wtpBand !== '0') {
        throw new Error('negative willingnessToPay cannot carry a paid wtpBand');
    }
    if (record.willingnessToPay && record.wtpBand === '0') {
        throw new Error('positive willingnessToPay cannot use wtpBand 0');
    }
}
