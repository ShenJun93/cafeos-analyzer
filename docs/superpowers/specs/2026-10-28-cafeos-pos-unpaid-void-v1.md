# CafeOS POS — audited unpaid-order void (incremental candidate)

**Status:** implementation candidate on `feat/cafeos-pos-void-v1`, built against Core Commerce v1 at `75d06fb`. Does not change staging or authorize release.

## Merchant job

An open POS order may be impossible to settle (customer leaves, cashier mistake). Daily Close refuses any open orders. Staff must not invent payment evidence merely to close the day. This slice adds manager-approved irreversible **VOID**, never a refund.

## Trusted system of record

- `pos_orders` status changes `open → voided` with `voided_at`.
- New `pos_order_voids` stores exactly one tenant-scoped audit receipt per order: Store, business date, reason (5–240 chars), authenticated manager actor, timestamp. Raw write grants are unavailable to browsers; RLS and SELECT are tenant-scoped.
- Narrow atomic `public.commerce_void_order(tenant,order,reason)` runs with checked `auth.uid()` and `private.has_tenant_role` for owner/admin/manager. The function serializes with Daily Close via the exact Store/business-date advisory transaction lock, then takes the order row lock used by payment. It refuses paid/nonexistent orders, closes and any recorded payment; it never deletes order lines or payment records.
- Same actor + same reason repeated invocation is idempotent; conflicting second void is rejected. Never treat absence of an HTTP reply as rollback. Browser keeps exact intent on uncertainty and refuses payment until resolved.
- App route `POST /api/app/commerce-void-order` validates strict body, manager role, trusted RPC receipt, exact reason and audit actor. Cashier can still retrieve open orders and pay; only manager sees cancellation controls.
- No new Vercel function source; existing workflow dispatcher used. Offline data capture is not claimed.

## Tests and migration boundaries

Incremental contract `db/contracts/core_commerce_void_order.sql` mirrors migration `20261028130000_core_commerce_void_order.sql`. The migration file follows repository ordering and is intended for **disposable localhost validation only**, not to be applied to `cafeos-staging` before original-ledger repair/backup/approval.

Original 7→8→10 migration release read-only classifiers stay **unchanged**. CI historical drills isolate the new 11th receipt temporarily while testing the original guards, then restore/apply the feature migration after the milestone. An 11-version stack is NOT classified as the prior 10-version staging release PASS.

Acceptance must include blank local DB tests, paid-order refusal, audit immutability and tenant isolation, authenticated HTTP, cashier/manager browser behavior, and independent staging/backup/JWT gates before any real merchant rollout.

## Explicit exclusions

No void of paid orders, refunds, card acquiring, partial/split payments, silent deletion, retroactive Daily Close edits, or background retry mutation. `age` off-host recovery stays postponed for development only; real data deployment remains blocked.
