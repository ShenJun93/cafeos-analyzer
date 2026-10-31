# CafeOS Menu item lifecycle v1

Parent: Draft PR #74 Core Commerce v1. State: Draft candidate, not staging/production deployed.

## Operator job

Owner/Admin/Manager can edit Menu item category, SKU, name, trusted unit price and active state. Cashiers see active-only catalog items. Managers can view archived items and reactivate them.

On /app → Menu:
- Create a category/item as before.
- Select Sửa, then change name/SKU/category/price or switch Tạm ngừng bán / Đang bán and save.
- If the server response is uncertain, refresh to verify instead of automatic retry.
- Previously created POS order lines retain their trusted server-owned unit price and item name snapshots. New prices apply only to future orders.
- Archived items are excluded from POS and server-side order creation; historical orders are never deleted.

## Trust boundaries

PATCH /api/app/commerce-menu requires kind=item, itemId and validated categoryId, sku, name, price and active boolean. It does not accept tenant_id, timestamps, order totals or historical snapshots. A fixed tenant_id and item UUID filter the PostgREST update; one exact matching response row is mandatory. Missing row returns 404; malformed confirmation returns 502. The UI does not automatically retry uncertain commits.

The migration grants only column-level UPDATE on name, sku, category_id, price, active to authenticated users. SQL RLS USING and WITH CHECK require a current Owner/Admin/Manager membership in that Tenant. A trigger updates updated_at. Existing composite tenant-category foreign key and price constraints stay in force. Cross-tenant writes are rejected by API scope and RLS. No DELETE privilege granted.

GET /api/app/commerce-menu?includeInactive=true is manager-only, validates active boolean state, and still checks bounded catalog/tenant rows. Ordinary cashier reads remain active-only. The POS always lets SQL own trusted item prices.

## Acceptance and limits

- API tests verify manager/cashier reads, PATCH roles, strict types, tenant scoping, amount and commit proof.
- UI tests verify archived items are not sellable, manager can edit/reactivate, unsettled checkout blocks edits.
- pgTAP checks role isolation, old order price snapshots, server-side archive refusal and reactivation.
- Existing Commerce/Analyzer/Control Tower tests remain required.

No category edits, modifiers, combos, refunds, inventory depletion or production merchant-data authorization in this slice. No staging migration repair, merge or deploy is authorized merely by a Draft.

CafeOS RELEASE NO-GO.
