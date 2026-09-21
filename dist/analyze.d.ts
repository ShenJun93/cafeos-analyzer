import { type NormalizeOptions } from "./normalize.js";
import type { AnalysisResult, CanonicalField, CanonicalLineItem } from "./types.js";
export type MappingOverride = Partial<Record<CanonicalField, number>>;
export type AnalysisOptions = NormalizeOptions;
export declare function analyzeCanonicalItems(items: CanonicalLineItem[], invalidRows?: number, mapping?: Partial<Record<CanonicalField, number>>): AnalysisResult;
export declare function analyzeTable(rows: string[][], override?: MappingOverride, options?: AnalysisOptions): AnalysisResult;
export declare function analyzeCsv(text: string, override?: MappingOverride, options?: AnalysisOptions): AnalysisResult;
