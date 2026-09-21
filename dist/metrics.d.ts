import type { CanonicalLineItem, CoreMetrics } from "./types.js";
export declare function orderIdentity(item: CanonicalLineItem): string;
export declare function computeCoreMetrics(items: CanonicalLineItem[]): CoreMetrics;
