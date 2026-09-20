import type { MappingOverride } from "./analyze.js";
import type { WorkbookAnalysisResult, WorkbookInspection } from "./types.js";
export declare function inspectXlsx(data: Uint8Array): WorkbookInspection;
export declare function analyzeXlsx(data: Uint8Array, sheetName?: string, mappingOverride?: MappingOverride): WorkbookAnalysisResult;
