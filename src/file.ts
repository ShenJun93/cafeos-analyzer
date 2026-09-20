import { analyzeCsv, type MappingOverride } from "./analyze.js";
import { parseCsv } from "./csv.js";
import { mapHeaders, suggestMappings } from "./mapping.js";
import { analyzeXlsx, inspectXlsx } from "./xlsx.js";
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

function decodeCsv(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data).replace(/^\uFEFF/, "");
}

export function inspectBytes(filename: string, data: Uint8Array): FileInspection {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const rows = parseCsv(decodeCsv(data));
    if (!rows.length) throw new Error("CSV is empty");
    return {
      kind: "csv",
      rowCount: Math.max(0, rows.length - 1),
      headers: rows[0],
      mapping: mapHeaders(rows[0]),
      suggestions: suggestMappings(rows[0])
    };
  }
  if (lower.endsWith(".xlsx")) return { kind: "xlsx", workbook: inspectXlsx(data) };
  throw new Error("Unsupported file type. CafeOS v0.1 accepts .csv and .xlsx");
}

export function analyzeBytes(
  filename: string,
  data: Uint8Array,
  sheetName?: string,
  mappingOverride?: MappingOverride
): FileAnalysisResult {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return analyzeCsv(decodeCsv(data), mappingOverride);
  if (lower.endsWith(".xlsx")) return analyzeXlsx(data, sheetName, mappingOverride);
  throw new Error("Unsupported file type. CafeOS v0.1 accepts .csv and .xlsx");
}
