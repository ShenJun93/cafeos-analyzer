import { analyzeCsv } from "./analyze.js";
import { parseCsv } from "./csv.js";
import { mapHeaders, suggestMappings } from "./mapping.js";
import { analyzeXlsx, inspectXlsx } from "./xlsx.js";
function decodeCsv(data) {
    return new TextDecoder("utf-8", { fatal: false }).decode(data).replace(/^\uFEFF/, "");
}
export function inspectBytes(filename, data) {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".csv")) {
        const rows = parseCsv(decodeCsv(data));
        if (!rows.length)
            throw new Error("CSV is empty");
        return {
            kind: "csv",
            rowCount: Math.max(0, rows.length - 1),
            headers: rows[0],
            mapping: mapHeaders(rows[0]),
            suggestions: suggestMappings(rows[0])
        };
    }
    if (lower.endsWith(".xlsx"))
        return { kind: "xlsx", workbook: inspectXlsx(data) };
    throw new Error("Unsupported file type. CafeOS v0.1 accepts .csv and .xlsx");
}
export function analyzeBytes(filename, data, sheetName, mappingOverride, options = {}) {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".csv"))
        return analyzeCsv(decodeCsv(data), mappingOverride, options);
    if (lower.endsWith(".xlsx"))
        return analyzeXlsx(data, sheetName, mappingOverride, options);
    throw new Error("Unsupported file type. CafeOS v0.1 accepts .csv and .xlsx");
}
