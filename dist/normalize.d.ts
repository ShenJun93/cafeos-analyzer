import type { CanonicalField, CanonicalLineItem } from "./types.js";
export interface NormalizeOptions {
    sourceTimezone: string;
    sourceNamespace: string;
}
export declare function normalizeRows(rows: string[][], mapping: Partial<Record<CanonicalField, number>>, options: NormalizeOptions): {
    valid: CanonicalLineItem[];
    invalid: number;
};
