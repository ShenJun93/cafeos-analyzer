import { type MappingOverride } from "./analyze.js";
import type { AnalysisResult } from "./types.js";
export interface BatchFileInput {
    filename: string;
    data: Uint8Array;
    sheetName?: string;
    mappingOverride?: MappingOverride;
}
export interface BatchFileSummary {
    filename: string;
    validRows: number;
    invalidRows: number;
    newRows: number;
    overlapRows: number;
}
export interface BatchAnalysisResult extends AnalysisResult {
    batch: {
        fileCount: number;
        sourceValidRows: number;
        invalidRows: number;
        uniqueRows: number;
        overlapRows: number;
        files: BatchFileSummary[];
    };
}
export declare function analyzeFileBatch(files: BatchFileInput[], sourceNamespace?: string): BatchAnalysisResult;
