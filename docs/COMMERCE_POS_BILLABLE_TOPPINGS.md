# CafeOS POS billable toppings v1

Parent: Draft PR #113 (Toppings catalog). This is a **synthetic-only functional implementation** pending owner-controlled migration review, never a production release grant.

## Cashier workflow

On /app → POS, tap a Menu item to add a base-only line, or use **Chọn topping** to open its current options. Select up to eight different active toppings and add the variant. The cart stores distinct lines per (item, selected topping IDs), preserves the exact selected IDs and order key on an uncertain response, and displays only **reference prices** while the order is unconfirmed. One base-only line and one same-item topping line can coexist.

The fixed commerce-order endpoint accepts only Menu item UUID, quantity (3 decimals) and a bounded array of topping UUIDs per line. It canonicalizes topping IDs by sorting and rejects duplicates and all untrusted prices/totals. The database looks up both the Menu base price and each selected active topping price with the caller's tenant and parent item constraints; it snapshots base price, topping IDs, names and prices, and **combined unit price**, then computes line totals, subtotal and total. Nothing is charged merely because a topping exists in Menu. An unselected or archived topping is not billed.

After exact SQL confirmation, the existing Payment workflow captures **server total only**. Paid receipts reconcile each frozen base price + topping prices == unit price, then the generated SQL line total, order subtotal and payment. Printed names use DOM textContent. Changes to the live Menu or topping catalog do not change a historic paid receipt.

## Database and migration

Migration 20261031220000_commerce_pos_billable_toppings.sql:
- Adds nullable base_unit_price and default empty JSONB toppings_snapshot to historic pos_order_items. Existing pre-migration lines remain valid. Newly created lines store both fields, including base-only new lines.
- Replaces only the existing commerce_create_order five-argument RPC (no new privileged public entry point). Reuses role, store, duplicate-key-before-daily-close, advisory lock, order status and payment semantics.
- Uses bounded, distinct, parent-matching topping IDs and row-level FOR SHARE locks while snapshotting Menu and selected topping prices. Client-supplied prices cannot enter the SQL RPC.
- Snapshots all selected prices **before** inserting the order and never re-queries them when materializing order lines.
- Returns the frozen base/toppings values for exact-cent client reconciliation.
- Existing financial facts remain read-only for authenticated callers.

A capped 100-line order supports up to eight toppings per line. The same idempotency key with another selection is a conflict; an exact retry returns the **original** snapshots even after a manager changes or archives the toppings. At present no discounts/tax calculations are added to the order; existing payment/daily-close maths remain authoritative. No menu-item variants with size/recipe, arbitrary modifier quantities, split payment, refund or inventory depletion are part of this feature.

## Required acceptance

- JS API tests: allowed toppings, canonical sorting, forbidden price/total input, exact cent/unique topping identity, malformed upstream confirmation and old-intent compatibility.
- UI tests: distinct variant cart lines and same-item combinations, no client-controlled paid amount, stale-context handling.
- Receipt tests: immutable snapshot price reconciliation, reject malformed/incomplete topping price data.
- pgTAP: base-only regression, mixed variants, exact total/payment, historic price/name after catalog update, retry/changed-key conflict, archived/cross-parent/cross-tenant rejection.
- CI migration and synthetic restore/reconciliation must PASS on this exact PR head. The original **10-migration real staging post-guards classifier remains unchanged** and must NOT mark newer 14-migration schema READY.

No staging migration, merchant data, merge, deployment or production payment processing authorized. **CafeOS RELEASE NO-GO.**
