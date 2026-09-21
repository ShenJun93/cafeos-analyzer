import type { CanonicalLineItem, Insight } from "./types.js";
export interface InsightTimeOptions {
    defaultStoreTimezone: string;
    storeTimezones?: Readonly<Record<string, string>>;
}
export declare function detectStoreDaypartDeclines(items: CanonicalLineItem[], threshold?: number, options?: InsightTimeOptions): Insight[];
