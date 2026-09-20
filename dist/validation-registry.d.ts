import type { FieldValidationRecord } from './validation-gates.js';
export interface ValidationRegistry {
    version: 1;
    records: FieldValidationRecord[];
}
export declare function assertCanonicalValidationRecord(value: unknown): asserts value is FieldValidationRecord;
export declare function emptyValidationRegistry(): ValidationRegistry;
export declare function upsertValidationRecord(registry: ValidationRegistry, record: FieldValidationRecord): ValidationRegistry;
