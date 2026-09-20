import type { CanonicalField, CanonicalLineItem } from "./types.js";
export declare function normalizeRows(rows: string[][], mapping: Partial<Record<CanonicalField, number>>): {
    valid: CanonicalLineItem[];
    invalid: number;
};
