import { type CanonicalAnalyzerValidationRecord } from './validation-record-contract.js';
export interface ValidationRegistry {
    version: 1;
    records: CanonicalAnalyzerValidationRecord[];
}
export declare function assertCanonicalValidationRecord(value: unknown): asserts value is CanonicalAnalyzerValidationRecord;
export declare function emptyValidationRegistry(): ValidationRegistry;
export declare function upsertValidationRecord(registry: ValidationRegistry, record: CanonicalAnalyzerValidationRecord): ValidationRegistry;
