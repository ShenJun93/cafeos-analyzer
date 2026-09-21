import type { AnalysisResult, CanonicalField, CanonicalLineItem } from "./types.js";
export type MappingOverride = Partial<Record<CanonicalField, number>>;
export interface AnalysisOptions {
    sourceTimezone?: string;
    sourceNamespace?: string;
    defaultStoreTimezone?: string;
    storeTimezones?: Readonly<Record<string, string>>;
}
export declare const DEFAULT_SOURCE_TIMEZONE = "Asia/Ho_Chi_Minh";
export declare const DEFAULT_SOURCE_NAMESPACE = "manual-upload";
export declare function analyzeCanonicalItems(items: CanonicalLineItem[], invalidRows?: number, mapping?: Partial<Record<CanonicalField, number>>, options?: AnalysisOptions): AnalysisResult;
export declare function analyzeTable(rows: string[][], override?: MappingOverride, options?: AnalysisOptions): AnalysisResult;
export declare function analyzeCsv(text: string, override?: MappingOverride, options?: AnalysisOptions): AnalysisResult;
