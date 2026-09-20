import type { CanonicalField } from "./types.js";
export interface MappingSuggestion {
    field: CanonicalField;
    index?: number;
    header?: string;
    confidence: number;
    reason: "exact_alias" | "contained_alias" | "unmapped";
}
export declare function normalizeHeader(value: string): string;
export declare function suggestMappings(headers: string[]): MappingSuggestion[];
export declare function mapHeaders(headers: string[]): Partial<Record<CanonicalField, number>>;
