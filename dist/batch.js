import { analyzeCanonicalItems } from "./analyze.js";
import { analyzeBytes } from "./file.js";
import { InMemoryImportLedger } from "./imports.js";
export function analyzeFileBatch(files, sourceNamespace = "manual-export-batch") {
    if (!files.length)
        throw new Error("Batch must contain at least one file");
    const ledger = new InMemoryImportLedger();
    const tenantId = "validation-batch";
    const uniqueItems = [];
    const summaries = [];
    let invalidRows = 0;
    let sourceValidRows = 0;
    let overlapRows = 0;
    for (const file of files) {
        const fileSourceNamespace = file.sourceNamespace ?? sourceNamespace;
        const result = analyzeBytes(file.filename, file.data, file.sheetName, file.mappingOverride, { ...(file.analysisOptions ?? {}), sourceNamespace: fileSourceNamespace });
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
