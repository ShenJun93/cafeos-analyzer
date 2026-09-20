import { type FileAnalysisResult } from "./file.js";
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
export declare function buildCompatibilityProfile(filename: string, data: Uint8Array): CompatibilityProfile;
export declare function buildShareableValidationPack(filename: string, data: Uint8Array, hmacKey: string, sheetName?: string): ShareableValidationPack;
