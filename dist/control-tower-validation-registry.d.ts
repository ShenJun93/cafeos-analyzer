import { type CanonicalControlTowerValidationRecord } from './control-tower-validation.js';
export interface ControlTowerValidationRegistry {
    version: 1;
    records: CanonicalControlTowerValidationRecord[];
}
export declare function assertCanonicalControlTowerValidationRecord(value: unknown): asserts value is CanonicalControlTowerValidationRecord;
export declare function emptyControlTowerValidationRegistry(): ControlTowerValidationRegistry;
export declare function upsertControlTowerValidationRecord(registry: ControlTowerValidationRegistry, record: CanonicalControlTowerValidationRecord): ControlTowerValidationRegistry;
