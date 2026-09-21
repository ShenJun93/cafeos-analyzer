import { createHash } from "node:crypto";
function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
function baseIdentity(item) {
    return [
        item.transactionId,
        item.occurredAt,
        item.store,
        item.product,
        item.quantity.toString(),
        item.netAmount.toString(),
        item.customerKey ?? ""
    ].join("\u001f");
}
/**
 * Assigns stable record keys while preserving genuinely repeated identical rows.
 * The Nth occurrence of an identical row gets occurrence N, so overlapping exports
 * dedupe across imports without collapsing two identical lines inside one export.
 */
export function keyCanonicalItems(items) {
    const counts = new Map();
    return items.map(item => {
        const base = baseIdentity(item);
        const occurrence = counts.get(base) ?? 0;
        counts.set(base, occurrence + 1);
        return { sourceRecordKey: sha256(`${base}\u001f${occurrence}`), item };
    });
}
export function fingerprintImport(tenantId, sourceNamespace, keyedItems) {
    const keys = keyedItems.map(x => x.sourceRecordKey).sort();
    return sha256([tenantId, sourceNamespace, ...keys].join("\n"));
}
export function planImport(tenantId, sourceNamespace, items, existingRecordKeys = new Set()) {
    const scopedItems = items.map(item => ({ ...item, sourceNamespace }));
    const keyedItems = keyCanonicalItems(scopedItems);
    const newItems = keyedItems.filter(x => !existingRecordKeys.has(x.sourceRecordKey));
    return {
        importFingerprint: fingerprintImport(tenantId, sourceNamespace, keyedItems),
        keyedItems,
        newItems,
        alreadyKnown: keyedItems.length - newItems.length
    };
}
export class InMemoryImportLedger {
    keysByTenantAndSource = new Map();
    ingest(tenantId, sourceNamespace, items) {
        const namespace = `${tenantId}\u001f${sourceNamespace}`;
        const known = this.keysByTenantAndSource.get(namespace) ?? new Set();
        const plan = planImport(tenantId, sourceNamespace, items, known);
        for (const x of plan.newItems)
            known.add(x.sourceRecordKey);
        this.keysByTenantAndSource.set(namespace, known);
        return plan;
    }
    size(tenantId, sourceNamespace) {
        return this.keysByTenantAndSource.get(`${tenantId}\u001f${sourceNamespace}`)?.size ?? 0;
    }
}
