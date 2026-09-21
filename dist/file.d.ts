import { type AnalysisOptions, type MappingOverride } from "./analyze.js";
import { mapHeaders, suggestMappings } from "./mapping.js";
import { inspectXlsx } from "./xlsx.js";
import type { AnalysisResult, WorkbookAnalysisResult } from "./types.js";
export type FileAnalysisResult = AnalysisResult | WorkbookAnalysisResult;
export interface CsvInspection {
    kind: "csv";
    rowCount: number;
    headers: string[];
    mapping: ReturnType<typeof mapHeaders>;
    suggestions: ReturnType<typeof suggestMappings>;
}
export interface XlsxInspection {
    kind: "xlsx";
    workbook: ReturnType<typeof inspectXlsx>;
}
export type FileInspection = CsvInspection | XlsxInspection;
export declare function inspectBytes(filename: string, data: Uint8Array): FileInspection;
export declare function analyzeBytes(filename: string, data: Uint8Array, sheetName?: string, mappingOverride?: MappingOverride, options?: AnalysisOptions): FileAnalysisResult;
