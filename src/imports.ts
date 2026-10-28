import { createHash } from "node:crypto";
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Preserve existing import hashes for ordinary data; refuse identity fields
// that could alias when the legacy U+001F-separated record key is serialized.
const RECORD_SEPARATOR = "\u001f";

function safeScopePart(value: string, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Unsafe import " + label + ": control characters or empty scope");
  }
  return value;
}

function baseIdentity(item: CanonicalLineItem): string {
  const fields = [
    item.transactionId,
    item.occurredAt,
    item.store,
    item.product,
    item.quantity.toString(),
    item.netAmount.toString(),
    item.customerKey ?? ""
  ];
  if (fields.some(value => value.includes(RECORD_SEPARATOR))) {
    throw new Error("Unsafe import record identity: reserved separator in source field");
  }
  return fields.join(RECORD_SEPARATOR);
}

/**
 * Assigns stable record keys while preserving genuinely repeated identical rows.
 * The Nth occurrence of an identical row gets occurrence N, so overlapping exports
 * dedupe across imports without collapsing two identical lines inside one export.
 */
export function keyCanonicalItems(items: CanonicalLineItem[]): KeyedLineItem[] {
  const counts = new Map<string, number>();
  return items.map(item => {
    const base = baseIdentity(item);
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    return { sourceRecordKey: sha256(`${base}\u001f${occurrence}`), item };
  });
}

export function fingerprintImport(tenantId: string, sourceNamespace: string, keyedItems: KeyedLineItem[]): string {
  safeScopePart(tenantId, "tenant");
  safeScopePart(sourceNamespace, "source namespace");
  const keys = keyedItems.map(x => x.sourceRecordKey).sort();
  return sha256([tenantId, sourceNamespace, ...keys].join("\n"));
}

export function planImport(
  tenantId: string,
  sourceNamespace: string,
  items: CanonicalLineItem[],
  existingRecordKeys: ReadonlySet<string> = new Set()
): ImportPlan {
  safeScopePart(tenantId, "tenant");
  safeScopePart(sourceNamespace, "source namespace");
  const keyedItems = keyCanonicalItems(items);
  const newItems = keyedItems.filter(x => !existingRecordKeys.has(x.sourceRecordKey));
  return {
    importFingerprint: fingerprintImport(tenantId, sourceNamespace, keyedItems),
    keyedItems,
    newItems,
    alreadyKnown: keyedItems.length - newItems.length
  };
}

export class InMemoryImportLedger {
  private readonly keysByTenantAndSource = new Map<string, Set<string>>();

  ingest(tenantId: string, sourceNamespace: string, items: CanonicalLineItem[]): ImportPlan {
    safeScopePart(tenantId, "tenant");
    safeScopePart(sourceNamespace, "source namespace");
    const namespace = JSON.stringify([tenantId, sourceNamespace]);
    const known = this.keysByTenantAndSource.get(namespace) ?? new Set<string>();
    const plan = planImport(tenantId, sourceNamespace, items, known);
    for (const x of plan.newItems) known.add(x.sourceRecordKey);
    this.keysByTenantAndSource.set(namespace, known);
    return plan;
  }

  size(tenantId: string, sourceNamespace: string): number {
    safeScopePart(tenantId, "tenant");
    safeScopePart(sourceNamespace, "source namespace");
    return this.keysByTenantAndSource.get(JSON.stringify([tenantId, sourceNamespace]))?.size ?? 0;
  }
}
