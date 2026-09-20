import type { CanonicalLineItem } from "./types.js";
export interface KeyedLineItem {
    sourceRecordKey: string;
    item: CanonicalLineItem;
}
export interface ImportPlan {
    importFingerprint: string;
    keyedItems: KeyedLineItem[];
    newItems: KeyedLineItem[];
    alreadyKnown: number;
}
/**
 * Assigns stable record keys while preserving genuinely repeated identical rows.
 * The Nth occurrence of an identical row gets occurrence N, so overlapping exports
 * dedupe across imports without collapsing two identical lines inside one export.
 */
export declare function keyCanonicalItems(items: CanonicalLineItem[]): KeyedLineItem[];
export declare function fingerprintImport(tenantId: string, sourceNamespace: string, keyedItems: KeyedLineItem[]): string;
export declare function planImport(tenantId: string, sourceNamespace: string, items: CanonicalLineItem[], existingRecordKeys?: ReadonlySet<string>): ImportPlan;
export declare class InMemoryImportLedger {
    private readonly keysByTenantAndSource;
    ingest(tenantId: string, sourceNamespace: string, items: CanonicalLineItem[]): ImportPlan;
    size(tenantId: string, sourceNamespace: string): number;
}
