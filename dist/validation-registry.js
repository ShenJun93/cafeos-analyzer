const REQUIRED_BOOLEAN_FIELDS = [
    'targetIcp', 'importAttempted', 'importSucceeded', 'reconciliationAttempted', 'metricTrusted',
    'insightReviewed', 'usefulNewInsight', 'repeatUseAsked', 'repeatUseIntent',
    'continuousSyncAsked', 'continuousSyncIntent', 'valueDemonstrated', 'wtpAsked', 'willingnessToPay'
];
const FORBIDDEN_KEYS = new Set([
    'name', 'fullName', 'phone', 'email', 'customerPhone', 'customerEmail', 'contact', 'contactInfo',
    'rawFile', 'filePath', 'merchantName', 'storeName', 'address'
]);
function walkForbidden(value, path = '') {
    if (!value || typeof value !== 'object')
        return [];
    const found = [];
    for (const [key, child] of Object.entries(value)) {
        const next = path ? `${path}.${key}` : key;
        if (FORBIDDEN_KEYS.has(key))
            found.push(next);
        found.push(...walkForbidden(child, next));
    }
    return found;
}
export function assertCanonicalValidationRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Validation record must be an object');
    const r = value;
    if (typeof r.id !== 'string' || !r.id.trim())
        throw new Error('Validation record id is required');
    if (typeof r.source !== 'string' || !r.source.trim())
        throw new Error('Validation record source is required');
    for (const field of REQUIRED_BOOLEAN_FIELDS) {
        if (typeof r[field] !== 'boolean')
            throw new Error(`Validation record ${field} must be boolean`);
    }
    const forbidden = walkForbidden(value);
    if (forbidden.length)
        throw new Error(`Validation record contains forbidden PII/local fields: ${forbidden.join(', ')}`);
}
export function emptyValidationRegistry() {
    return { version: 1, records: [] };
}
export function upsertValidationRecord(registry, record) {
    assertCanonicalValidationRecord(record);
    if (registry.version !== 1 || !Array.isArray(registry.records))
        throw new Error('Unsupported validation registry');
    const records = registry.records.filter(existing => existing.id !== record.id);
    return { version: 1, records: [...records, record] };
}
