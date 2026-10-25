# CafeOS Core Commerce v1 — Product & Technical Design

**Status:** approved-by-direction / implementation authorized by user on 2026-10-25.

## Intent

CafeOS is no longer defined as only an intelligence layer above third-party POS systems. The canonical product direction is a **full café operating ecosystem** that can either integrate with an existing POS or own first-party commerce execution when a merchant chooses CafeOS POS.

The first implementation slice must prove one complete operational spine:

\`Menu → POS Order → Payment Record → Daily Close → Dashboard → Control Tower handoff\`

Analyzer remains an onboarding/import/reconciliation module. Control Tower remains the cross-store decision layer. Core Commerce becomes the first first-party execution module.

## Why this slice

Building every ecosystem module at once would create a wide but shallow ERP clone. The first slice should instead create the smallest transaction system that can be used end-to-end and later feed inventory, customers, staff, finance and Control Tower.

This slice creates the system-of-record primitives required by later modules without adding those modules prematurely.

## Approaches considered

### 1. Keep CafeOS intelligence-only

Continue integrating existing POS systems and never own checkout.

**Rejected:** this conflicts with the newly approved full-ecosystem direction and leaves CafeOS without its own operational core.

### 2. Build a full POS/ERP in one pass

Implement ordering, modifiers, inventory, loyalty, staff, accounting, KDS and payments together.

**Rejected:** excessive coupling and migration risk; too many unproven domain rules would land at once.

### 3. Core Commerce vertical slice — chosen

Build one end-to-end first-party commerce spine on the existing tenant/store/auth/RLS foundation, then add ecosystem modules around it.

**Chosen because:** it produces a real usable operating core while keeping contracts small enough to verify.

## Canonical product model after this change

CafeOS Platform contains:

- **Core Commerce / POS** — first-party menu, orders, payment records and daily close;
- **Operations** — tasks/checklists/standards later;
- **Inventory** — ingredients, recipe depletion, stock movement later;
- **Customers & Loyalty** — identity, membership, points/offers later;
- **Staff** — people, shifts, attendance/permissions later;
- **Finance & Reconciliation** — close, payment reconciliation, COGS/margin/expenses later;
- **Analyzer** — import/onboarding/reconciliation for existing POS/export data;
- **Control Tower** — Daily Brief, Store Health, Attention, Action, Measurement;
- **Integrations** — KiotViet/Sapo/CUKCUK/POS365/iPOS/Haravan/etc.

The architecture must support both:
1. merchants using CafeOS POS as system of record; and
2. merchants retaining an external POS and using CafeOS through integrations.

## Core invariants

1. **Tenant isolation is a release blocker.**
2. **Business totals are deterministic.**
3. **Clients never supply trusted prices/totals when the server/database can derive them.**
4. **POS writes are idempotent.**
5. **Order/payment lifecycle transitions are bounded and auditable.**
6. **Payment v1 records settlement evidence; CafeOS does not acquire/process card funds yet.**
7. **No anonymous Data API access to commerce tables.**
8. **Every new public table gets explicit GRANT + RLS + policies.**
9. **No service-role/secret credential reaches browser or public handlers.**
10. **Existing Analyzer and Control Tower behavior remains backward compatible.**

## User jobs

### Cashier

- see available menu items;
- add items to a cart;
- create an order once without accidental duplicate submission;
- record a cash/card/bank-transfer/wallet payment;
- know whether the order is paid.

### Store manager

- create basic menu categories/items;
- see today’s sales/orders/payment mix;
- close the business day only when no unpaid order remains.

### Owner / HQ

- see commerce summary inside the same CafeOS app shell;
- navigate to Control Tower/Analyzer without switching products;
- later consume CafeOS POS facts in the unified Control Tower read-model.

## Roles

Extend \`tenant_members.role\` to:

- \`owner\`
- \`admin\`
- \`manager\`
- \`cashier\`
- \`analyst\`
- \`viewer\`

Permissions:

- all tenant members: read stores and active menu;
- owner/admin/manager: create menu categories/items;
- owner/admin/manager/cashier: create POS orders and record payment;
- owner/admin/manager: daily close;
- analyst/viewer: read dashboards only;
- existing Control Tower operator write policy remains owner/admin/analyst until separately redesigned.

## Data model

### \`menu_categories\`

Fields:

- \`id uuid PK\`
- \`tenant_id uuid FK\`
- \`name text\`
- \`sort_order integer\`
- \`active boolean\`
- timestamps

Constraints:

- unique \`(tenant_id, id)\`;
- unique normalized category name per tenant.

### \`menu_items\`

Fields:

- \`id uuid PK\`
- \`tenant_id uuid FK\`
- \`category_id uuid nullable\`
- \`sku text nullable\`
- \`name text\`
- \`price numeric(18,2)\`
- \`active boolean\`
- timestamps

Rules:

- price >= 0;
- tenant-scoped category FK;
- optional SKU unique within tenant when present.

### \`pos_orders\`

Fields:

- \`id uuid PK\`
- \`tenant_id uuid FK\`
- \`store_id uuid FK\`
- \`client_order_key text\`
- \`order_number text\`
- \`business_date date\`
- \`channel text\`
- \`status text\`
- \`subtotal numeric(18,2)\`
- \`discount_total numeric(18,2)\`
- \`tax_total numeric(18,2)\`
- \`total numeric(18,2)\`
- \`opened_by_user_id uuid\`
- \`opened_at timestamptz\`
- \`paid_at timestamptz nullable\`
- \`voided_at timestamptz nullable\`
- timestamps

Initial channels:

- \`counter\`
- \`takeaway\`
- \`pickup\`
- \`delivery\`

Initial statuses:

- \`open\`
- \`paid\`
- \`voided\`

Idempotency:

- unique \`(tenant_id, store_id, client_order_key)\`.

### \`pos_order_items\`

Fields:

- \`id uuid PK\`
- \`tenant_id uuid FK\`
- \`order_id uuid FK\`
- \`menu_item_id uuid FK\`
- immutable snapshot \`item_name\`
- immutable snapshot \`unit_price\`
- \`quantity numeric(12,3)\`
- generated \`line_total\`

Trusted snapshot values are derived by the database from the current menu row at order creation.

### \`pos_payments\`

Fields:

- \`id uuid PK\`
- \`tenant_id uuid FK\`
- \`order_id uuid FK\`
- \`method text\`
- \`amount numeric(18,2)\`
- \`status text\`
- \`reference text nullable\`
- \`recorded_by_user_id uuid\`
- \`paid_at timestamptz\`
- timestamps

Methods:

- \`cash\`
- \`card\`
- \`bank_transfer\`
- \`wallet\`
- \`other\`

Initial status:

- \`captured\`

Payment v1 is **record/reconciliation**, not payment acquiring.

### \`daily_closes\`

Fields:

- \`id uuid PK\`
- \`tenant_id uuid FK\`
- \`store_id uuid FK\`
- \`business_date date\`
- deterministic snapshot:
  - \`order_count\`
  - \`sales_total\`
  - \`payment_total\`
  - \`cash_total\`
  - \`non_cash_total\`
- \`closed_by_user_id uuid\`
- \`closed_at timestamptz\`

Constraint:

- one close per \`(tenant_id, store_id, business_date)\`.

A day cannot close while open orders exist for that Store/business date.

## Database transaction functions

Use fixed RPCs so multi-table writes are atomic and trusted values remain server-owned.

### \`public.commerce_create_order(...)\`

Inputs:

- tenant
- store
- client order key
- channel
- items JSON array of \`{menuItemId, quantity}\`

Behavior:

- require authenticated commerce-write role;
- validate Store tenant membership;
- return existing order for an already-used client order key;
- read current menu item name/price from database;
- create order + snapshots atomically;
- calculate subtotal/total from server-owned price snapshots;
- no client price or total accepted.

### \`public.commerce_capture_payment(...)\`

Inputs:

- tenant
- order
- method
- amount
- optional reference

Behavior:

- require authenticated commerce-write role;
- order must be open and tenant-owned;
- payment amount must equal remaining balance in Core Commerce v1;
- insert captured payment;
- mark order paid atomically;
- set \`paid_at\`.

Partial/split payments are deferred until a later slice.

### \`public.commerce_daily_dashboard(...)\`

Read-only SECURITY INVOKER function.

Returns:

- business date;
- order count;
- sales total;
- AOV;
- payment total;
- payment mix;
- open-order count;
- close state.

### \`public.commerce_close_day(...)\`

Inputs:

- tenant
- store
- business date

Behavior:

- require manager role;
- fail if any order is still open;
- compute snapshot from paid orders/captured payments;
- insert or return existing immutable close row;
- no client-supplied business totals.

## RLS / grants

Every commerce table:

- \`ENABLE ROW LEVEL SECURITY\`;
- \`REVOKE ALL ... FROM anon, authenticated\`;
- explicit authenticated read/write grants only where needed;
- service_role full maintenance grants;
- tenant-scoped policies use \`private.has_tenant_access\` and \`private.has_tenant_role\`.

The public RPC functions are SECURITY INVOKER and explicitly granted only to authenticated/service_role as appropriate.

This design intentionally follows Supabase’s 2026 explicit-exposure requirement: GRANT, RLS and policy are treated as one migration unit.

## API architecture

Do not add another Vercel function source: the repo already uses the configured 12-function Hobby budget.

Reuse \`api/app/workflow.mjs\` as the authenticated application dispatcher.

Public URLs:

- \`GET /api/app/client-config\`
- \`GET|POST /api/app/commerce-menu\`
- \`POST /api/app/commerce-order\`
- \`POST /api/app/commerce-payment\`
- \`GET /api/app/commerce-dashboard\`
- \`POST /api/app/commerce-daily-close\`

All route through \`api/app/workflow.mjs?route=...\`.

Server implementation lives under \`server/commerce/\`.

## Browser auth

The production app may fetch only:

- Supabase HTTPS project URL;
- publishable key.

These values are safe client configuration.

The browser authenticates directly against Supabase Auth and keeps access tokens **in memory only** for Core Commerce v1.

No service role or secret API key is exposed.

## UI

### Route \`/app\`

One authenticated CafeOS shell using the existing Hallmark visual system.

Top navigation:

- POS
- Menu
- Dashboard
- Daily Close
- Control Tower
- Analyzer

### POS workspace

- Store selector;
- menu item grid/list;
- cart;
- quantity controls;
- channel selector;
- idempotent order submission;
- payment method;
- receipt summary/state.

### Menu workspace

v1:

- list categories/items;
- create category;
- create item.

Editing/archiving is deferred until the create flow is verified.

### Dashboard workspace

- today business date;
- sales;
- paid orders;
- AOV;
- payment mix;
- open orders;
- close state.

### Daily Close workspace

- display deterministic pre-close summary;
- block if open orders > 0;
- close action;
- immutable close receipt.

### Control Tower workspace

Reuse existing authenticated Control Tower read endpoints inside the same shell:

- Daily Brief;
- Attention;
- unresolved Actions.

Important: Core Commerce facts are **not yet silently merged** into the imported transaction read-model in this slice. The UI labels commerce dashboard and Control Tower source boundaries explicitly. A later read-model task will unify first-party and imported facts without fabricating lineage.

## System-of-record boundary

For merchants using CafeOS POS:

- \`pos_orders\`, \`pos_order_items\`, \`pos_payments\`, \`daily_closes\` are first-party commerce system-of-record tables.

For merchants using an external POS:

- Analyzer/import/connectors remain the transaction source.

Do not copy CafeOS POS orders into \`imports\` or \`transaction_line_items\` using fake import provenance.

## Error model

Fail closed with stable codes for:

- invalid tenant/store/menu/order IDs;
- unsupported role;
- unknown request fields;
- invalid quantity;
- inactive menu item;
- duplicate client key with conflicting payload;
- payment amount mismatch;
- order already paid/voided;
- close blocked by open orders;
- already-closed date;
- upstream malformed payload.

## Non-goals for Core Commerce v1

Not in this slice:

- payment acquiring/gateway tokenization;
- split/partial payment;
- refund workflow;
- table map;
- modifiers/toppings/combos;
- KDS/bar tickets;
- recipes/inventory depletion;
- loyalty points;
- customer CRM;
- shifts/time clock;
- e-invoice;
- accounting ledger;
- payroll;
- delivery dispatch;
- offline-first sync;
- native mobile app.

These are future CafeOS modules, not rejected product directions.

## Release gates

Before merge:

1. schema static tests;
2. migration text-equivalence test;
3. API unit contract tests;
4. UI contract tests;
5. existing full \`test:dist\`;
6. no API source budget regression.

Before any production merchant use:

1. restore \`cafeos-staging\`;
2. apply migration to staging only;
3. run tenant/role isolation synthetic acceptance;
4. run Supabase security + performance advisors;
5. exercise Menu → Order → Payment → Dashboard → Close with synthetic accounts;
6. verify Control Tower/Analyzer regressions remain clean;
7. only then decide production DB promotion.

No real merchant commerce data is allowed before these gates pass.
