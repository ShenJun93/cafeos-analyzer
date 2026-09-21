import { analyzeCanonicalItems, type AnalysisOptions, type MappingOverride } from "./analyze.js";
import { analyzeBytes } from "./file.js";
import { InMemoryImportLedger } from "./imports.js";
import type { AnalysisResult } from "./types.js";

export interface BatchFileInput {
  filename: string;
  data: Uint8Array;
  sheetName?: string;
  mappingOverride?: MappingOverride;
  sourceNamespace?: string;
  analysisOptions?: Omit<AnalysisOptions, "sourceNamespace">;
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

export function analyzeFileBatch(
  files: BatchFileInput[],
  sourceNamespace = "manual-export-batch"
): BatchAnalysisResult {
  if (!files.length) throw new Error("Batch must contain at least one file");
  const ledger = new InMemoryImportLedger();
  const tenantId = "validation-batch";
  const uniqueItems = [] as AnalysisResult["items"];
  const summaries: BatchFileSummary[] = [];
  let invalidRows = 0;
  let sourceValidRows = 0;
  let overlapRows = 0;

  for (const file of files) {
    const fileSourceNamespace = file.sourceNamespace ?? sourceNamespace;
    const result = analyzeBytes(
      file.filename,
      file.data,
      file.sheetName,
      file.mappingOverride,
      { ...(file.analysisOptions ?? {}), sourceNamespace: fileSourceNamespace }
    );
    sourceValidRows += result.items.length;
    invalidRows += result.health.invalidRows;
    const plan = ledger.ingest(tenantId, fileSourceNamespace, result.items);
    overlapRows += plan.alreadyKnown;
    uniqueItems.push(...plan.newItems.map(x => x.item));
    summaries.push({
      filename: file.filename,
      validRows: result.items.length,
      invalidRows: result.health.invalidRows,
      newRows: plan.newItems.length,
      overlapRows: plan.alreadyKnown
    });
  }

  const merged = analyzeCanonicalItems(uniqueItems, invalidRows);
  return {
    ...merged,
    batch: {
      fileCount: files.length,
      sourceValidRows,
      invalidRows,
      uniqueRows: uniqueItems.length,
      overlapRows,
      files: summaries
    }
  };
}
