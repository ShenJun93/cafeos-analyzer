# Menu Category lifecycle v1

Parent: Draft PR #111 (Menu item lifecycle). This is a functional code candidate, not yet deployed.

## Operator workflow

In CafeOS /app → Menu, Owner/Admin/Manager can:
- create categories as before;
- edit an existing group's name and integer display order;
- hide a group from POS category filter / new item category selector;
- restore a hidden group using the same editor.

**Critical distinction:** hiding a **category** is only catalog organization. It does not archive or delete the group's Menu items; any **active item** remains sellable from the POS "Tất cả nhóm" view. To stop selling, manager must deactivate that **item** separately. No order totals or historical order-item price snapshots are altered by category changes. No category delete is available.

## System-of-record and trust

Manager-only PATCH /api/app/commerce-menu with kind=category, categoryId, name, sortOrder, active. Strict allowed fields, valid UUID, bounded label, bounded signed integer sort, boolean active. Update is limited to current authenticated Tenant and category id; API requires one matching returned row, otherwise 404/502. Do not blindly retry uncertain outcomes. Cashier receives active categories only. Manager GET ?includeInactive=true includes archived categories and items (bounded validated response).

SQL migration 20261031203000 grants only column-scoped category UPDATE (name, sort_order, active) to authenticated, with Tenant manager role RLS USING and WITH CHECK, updated_at trigger. No tenant_id change, no delete, no destructive cascading state, no privilege granted to anonymous.

## Evidence

API tests: role/strict body/tenant/id/acknowledgment/archival read boundaries. UI: archived category hidden from filter but active item stays sellable, editor and unsettled-checkout guard. pgTAP: authenticated column scope, manager mutation, cashier/viewer/other-Tenant denied, active item remains sellable. Existing Node and synthetic DB drills remain mandatory and original ten-version staging classifier remains NO-GO on newer migrations.

No staging modifications, production deployment or approval to merge are implied. CafeOS RELEASE NO-GO.
