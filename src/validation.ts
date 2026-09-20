import { createHmac, createHash } from "node:crypto";
import { analyzeBytes, inspectBytes, type FileAnalysisResult, type FileInspection } from "./file.js";
import type { CanonicalLineItem } from "./types.js";

export type ValidationPrivacyMode = "profile" | "pseudonymized";

export interface CompatibilityProfile {
  version: "cafeos-compatibility-profile-v0.1";
  fileKind: "csv" | "xlsx";
  byteLength: number;
  schemaFingerprint: string;
  csv?: {
    rowCount: number;
    columnCount: number;
    headers: string[];
    mappedFields: string[];
    unmappedRequiredFields: string[];
  };
  workbook?: {
    sheetCount: number;
    ambiguous: boolean;
    suggestedSheetIndex?: number;
    sheets: Array<{
      sheetIndex: number;
      rowCount: number;
      columnCount: number;
      headers: string[];
      mappedRequired: number;
      mappedOptional: number;
      candidateScore: number;
    }>;
  };
}

export interface ShareableValidationPack {
  version: "cafeos-validation-pack-v0.1";
  privacyMode: "pseudonymized";
  profile: CompatibilityProfile;
  health: FileAnalysisResult["health"];
  metrics: FileAnalysisResult["metrics"];
  capabilities: FileAnalysisResult["capabilities"];
  insights: FileAnalysisResult["insights"];
  sanitizedCanonicalCsv: string;
}

const REQUIRED = ["transaction_id", "occurred_at", "store", "product", "quantity", "net_amount"] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmacToken(key: string, prefix: string, value: string): string {
  return `${prefix}_${createHmac("sha256", key).update(value).digest("hex").slice(0, 20)}`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCanonicalCsv(items: CanonicalLineItem[], key: string): string {
  const header = ["occurred_at", "transaction_id", "store", "product", "quantity", "net_amount", "customer_id"];
  const rows = items.map(item => [
    item.occurredAt,
    hmacToken(key, "txn", item.transactionId),
    hmacToken(key, "store", item.store),
    hmacToken(key, "product", item.product),
    item.quantity,
    item.netAmount,
    item.customerKey ? hmacToken(key, "customer", item.customerKey) : ""
  ].map(csvCell).join(","));
  return [header.join(","), ...rows].join("\n") + "\n";
}

function transformInspection(inspection: FileInspection, byteLength: number): CompatibilityProfile {
  if (inspection.kind === "csv") {
    const mappedFields = Object.keys(inspection.mapping).sort();
    const unmappedRequiredFields = REQUIRED.filter(field => inspection.mapping[field] === undefined);
    const schemaBasis = JSON.stringify({ kind: "csv", headers: inspection.headers });
    return {
      version: "cafeos-compatibility-profile-v0.1",
      fileKind: "csv",
      byteLength,
      schemaFingerprint: sha256(schemaBasis),
      csv: {
        rowCount: inspection.rowCount,
        columnCount: inspection.headers.length,
        headers: [...inspection.headers],
        mappedFields,
        unmappedRequiredFields: [...unmappedRequiredFields]
      }
    };
  }

  const suggestedSheetIndex = inspection.workbook.suggestedSheet === undefined
    ? undefined
    : inspection.workbook.sheets.findIndex(sheet => sheet.name === inspection.workbook.suggestedSheet);
  const schemaBasis = JSON.stringify({
    kind: "xlsx",
    sheets: inspection.workbook.sheets.map(sheet => ({ headers: sheet.headers, rows: sheet.rowCount, columns: sheet.columnCount }))
  });
  return {
    version: "cafeos-compatibility-profile-v0.1",
    fileKind: "xlsx",
    byteLength,
    schemaFingerprint: sha256(schemaBasis),
    workbook: {
      sheetCount: inspection.workbook.sheets.length,
      ambiguous: inspection.workbook.ambiguous,
      suggestedSheetIndex: suggestedSheetIndex !== undefined && suggestedSheetIndex >= 0 ? suggestedSheetIndex : undefined,
      sheets: inspection.workbook.sheets.map((sheet, sheetIndex) => ({
        sheetIndex,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        headers: [...sheet.headers],
        mappedRequired: sheet.mappedRequired,
        mappedOptional: sheet.mappedOptional,
        candidateScore: sheet.candidateScore
      }))
    }
  };
}

export function buildCompatibilityProfile(filename: string, data: Uint8Array): CompatibilityProfile {
  return transformInspection(inspectBytes(filename, data), data.byteLength);
}

export function buildShareableValidationPack(
  filename: string,
  data: Uint8Array,
  hmacKey: string,
  sheetName?: string
): ShareableValidationPack {
  if (hmacKey.length < 16) throw new Error("Validation HMAC key must be at least 16 characters");
  const analysis = analyzeBytes(filename, data, sheetName);
  const sanitizedCanonicalCsv = toCanonicalCsv(analysis.items, hmacKey);
  return {
    version: "cafeos-validation-pack-v0.1",
    privacyMode: "pseudonymized",
    profile: buildCompatibilityProfile(filename, data),
    health: analysis.health,
    metrics: analysis.metrics,
    capabilities: analysis.capabilities,
    insights: analysis.insights.map(insight => ({
      ...insight,
      store: hmacToken(hmacKey, "store", insight.store)
    })),
    sanitizedCanonicalCsv
  };
}
