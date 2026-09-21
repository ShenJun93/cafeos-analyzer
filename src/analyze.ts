import { parseCsv } from "./csv.js";
import { mapHeaders } from "./mapping.js";
import { normalizeRows } from "./normalize.js";
import { computeDataHealth } from "./health.js";
import { computeCoreMetrics } from "./metrics.js";
import { detectStoreDaypartDeclines } from "./insights.js";
import { assertIanaTimeZone } from "./time.js";
import type { AnalysisResult, CanonicalField, CanonicalLineItem } from "./types.js";

export type MappingOverride = Partial<Record<CanonicalField, number>>;

export interface AnalysisOptions {
  sourceTimezone?: string;
  sourceNamespace?: string;
  defaultStoreTimezone?: string;
  storeTimezones?: Readonly<Record<string, string>>;
}

export const DEFAULT_SOURCE_TIMEZONE = "Asia/Ho_Chi_Minh";
export const DEFAULT_SOURCE_NAMESPACE = "manual-upload";

interface ResolvedAnalysisOptions {
  sourceTimezone: string;
  sourceNamespace: string;
  defaultStoreTimezone: string;
  storeTimezones?: Readonly<Record<string, string>>;
}

function resolvedAnalysisOptions(options: AnalysisOptions = {}): ResolvedAnalysisOptions {
  const sourceTimezone = assertIanaTimeZone(options.sourceTimezone ?? DEFAULT_SOURCE_TIMEZONE);
  const defaultStoreTimezone = assertIanaTimeZone(options.defaultStoreTimezone ?? sourceTimezone);
  const sourceNamespace = String(options.sourceNamespace ?? DEFAULT_SOURCE_NAMESPACE).trim();
  if (!sourceNamespace) throw new Error("sourceNamespace is required");
  if (options.storeTimezones) {
    for (const zone of Object.values(options.storeTimezones)) assertIanaTimeZone(zone);
  }
  return { sourceTimezone, sourceNamespace, defaultStoreTimezone, storeTimezones: options.storeTimezones };
}

function validatedMapping(headers: string[], override?: MappingOverride): Partial<Record<CanonicalField, number>> {
  const mapping = { ...mapHeaders(headers), ...(override ?? {}) };
  const used = new Map<number, CanonicalField>();
  for (const [field, index] of Object.entries(mapping) as [CanonicalField, number | undefined][]) {
    if (index === undefined) continue;
    if (!Number.isInteger(index) || index < 0 || index >= headers.length) throw new Error(`Invalid mapping index for ${field}`);
    const prior = used.get(index);
    if (prior && prior !== field) throw new Error(`Column ${index} is mapped to both ${prior} and ${field}`);
    used.set(index, field);
  }
  return mapping;
}

export function analyzeCanonicalItems(
  items: CanonicalLineItem[],
  invalidRows = 0,
  mapping: Partial<Record<CanonicalField, number>> = {},
  options: AnalysisOptions = {}
): AnalysisResult {
  const resolved = resolvedAnalysisOptions(options);
  const health = computeDataHealth(items, invalidRows);
  const metrics = computeCoreMetrics(items);
  return {
    mapping,
    health,
    metrics,
    timeAssumptions: {
      sourceTimezone: resolved.sourceTimezone,
      defaultStoreTimezone: resolved.defaultStoreTimezone
    },
    capabilities: {
      salesAnalytics: items.length > 0,
      customerRetention: metrics.identifiedCustomerCoverage >= 0.2,
      marginAnalytics: false
    },
    insights: detectStoreDaypartDeclines(items, -0.2, {
      defaultStoreTimezone: resolved.defaultStoreTimezone,
      storeTimezones: resolved.storeTimezones
    }),
    items
  };
}

export function analyzeTable(
  rows: string[][],
  override?: MappingOverride,
  options: AnalysisOptions = {}
): AnalysisResult {
  if (rows.length < 2) throw new Error("Input must include a header and at least one data row");
  const mapping = validatedMapping(rows[0], override);
  const resolved = resolvedAnalysisOptions(options);
  const normalized = normalizeRows(rows.slice(1), mapping, {
    sourceTimezone: resolved.sourceTimezone,
    sourceNamespace: resolved.sourceNamespace
  });
  return analyzeCanonicalItems(normalized.valid, normalized.invalid, mapping, resolved);
}

export function analyzeCsv(
  text: string,
  override?: MappingOverride,
  options: AnalysisOptions = {}
): AnalysisResult {
  return analyzeTable(parseCsv(text), override, options);
}
