# Menu toppings catalog — foundation v1 (not yet POS billable)

Parent: Draft PR #112. Feature state: catalog configuration only.

## Operator workflow

In CafeOS /app → Menu, Owner/Admin/Manager can use the **Topping theo món** workspace:
- Load the existing topping list explicitly.
- Attach a named topping and configured future price to one Menu item, with sort order.
- Edit its name, price and sort order, or archive/reactivate it.
- Keep a topping permanently associated with its original Menu item (no reparent operation).
- See archived records for configuration/history; cashier and viewer cannot modify any topping.

**Not a paid topping checkout yet.** This PR does not add topping selection to POS, does not change commerce_create_order, the payload sent to the database, any order price or receipt, and must not display a client-calculated topping charge as financial truth. Existing POS orders use only the **original base Menu price**. The next PR must update server-side order-validation/idempotency, modifier snapshots, API reconciliation, receipt, POS cart and payment/close invariants together.

## Security and data

Migration 20261031214500_commerce_menu_toppings_catalog.sql creates public.menu_toppings with composite tenant_id,menu_item_id FK, per-item normalized unique topping names, 0..1,000,000 configured amount, integer sort order and soft status. Authenticated SELECT is limited by existing private.has_tenant_access. INSERT and column-scoped UPDATE (name/price/sort/active only) require active manager/admin/owner membership for that tenant. No authenticated DELETE, moving tenant or moving parent item. Anonymous has no access.

The new fixed route /api/app/commerce-toppings has bounded GET (active-only for regular members, archived records for manager), strict POST and PATCH, UUID/tenant scoping and an exact returned row acknowledgment. An uncertain network response is not retried automatically. The browser resets topping state on tenant/store switch and logout, using the same viewEpoch and request serial guards as the Menu.

## Verification

- API: read filters, authorization, exact return acknowledgment, malformed/forged input and tenant boundary.
- UI: manager addition/edit, inactive visibility, reset on context switch, checkout lock; no price input in POS workspace.
- pgTAP: SQL RLS for manager/cashier/viewer/foreign tenant, composite FK, no hard delete, and **no automatic topping charge** to ordinary orders.
- Original source staging ledger classifier stays pinned to the reviewed 10-version gate, and remains NO-GO when confronted with new 13-version schema. Only disposable localhost gets new migration.

No staging writes, production migration/deploy, merge or customer data ingress. CafeOS RELEASE NO-GO.
