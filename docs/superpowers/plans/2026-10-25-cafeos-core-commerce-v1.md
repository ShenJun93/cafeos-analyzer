# CafeOS Core Commerce v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Build the first first-party CafeOS commerce spine: Menu → POS Order → Payment Record → Daily Close → Dashboard → Control Tower handoff.

**Architecture:** Extend the existing Supabase/Postgres tenant/store/RLS foundation with atomic SECURITY INVOKER commerce RPCs and explicit grants/RLS. Reuse the existing \`api/app/workflow.mjs\` Vercel function as the commerce dispatcher so the project stays within the 12-function Hobby budget. Add one authenticated static \`/app\` shell using the existing Hallmark CSS; Analyzer and Control Tower remain backward compatible.

**Tech Stack:** PostgreSQL/Supabase, Vercel Node handlers, static HTML/CSS/vanilla JS, Node test runner.

**Spec:** \`docs/superpowers/specs/2026-10-25-cafeos-core-commerce-v1-design.md\`

## Global Constraints

- Tenant isolation is a release blocker.
- Business totals are deterministic.
- Clients never supply trusted prices/totals when server/database derivation is available.
- POS writes are idempotent.
- Payment v1 records settlement evidence only; no acquiring/gateway.
- No anonymous Data API access to commerce tables.
- Every new public table gets explicit GRANT + RLS + policy.
- No browser exposure of service-role or secret credentials.
- Existing Analyzer and Control Tower behavior remains backward compatible.
- Do not add another Vercel API source file; reuse \`api/app/workflow.mjs\`.
- Production DB promotion is forbidden until staging synthetic acceptance and Supabase advisors are clean enough to proceed.

## Review Focus

1. Duplicate submit / retry of order creation must return the same order, never double-create.
2. Cross-tenant Store/Menu/Order IDs must fail closed even when syntactically valid.
3. Payment must not mark an order paid with the wrong amount or a second capture.
4. Daily close must fail while any open order exists and must be immutable/idempotent after closing.
5. Mobile \`/app\` must not horizontally overflow and all cashier controls must remain usable at 390 CSS px.

---

### Task 1: Canonical product realignment

**Files:**
- Modify: \`MISSION.md\`
- Modify: \`docs/PRODUCT_ARCHITECTURE.md\`
- Modify: \`docs/ROADMAP.md\`
- Modify: \`README.md\`
- Modify: \`AGENTS.md\`

**Interfaces:**
- Produces: canonical authority that CafeOS may own first-party commerce execution while still supporting external POS integrations.

- [ ] **Step 1: Write a contract test for mission authority**

Create \`tests/core-commerce-product-contract.test.mjs\` asserting:

- mission identifies CafeOS as a full café operating ecosystem;
- Analyzer is still a module/wedge;
- Core Commerce / POS is an explicit first-party module;
- integration with external POS remains supported;
- payment acquiring, payroll, accounting and full ERP are not falsely claimed as v1 complete;
- primary distribution remains pull/inbound.

- [ ] **Step 2: Run focused test and verify RED**

Run:
\`node --test tests/core-commerce-product-contract.test.mjs\`

Expected: FAIL because current mission still defines CafeOS as sitting above existing POS.

- [ ] **Step 3: Update canonical docs**

Realign the five files to the approved full-ecosystem direction.

Do not claim modules are already implemented; distinguish canonical product direction from current shipped state.

- [ ] **Step 4: Run focused test and verify GREEN**

Run:
\`node --test tests/core-commerce-product-contract.test.mjs\`

Expected: PASS.

- [ ] **Step 5: Wire the new test into \`test\` and \`test:dist\` and commit**

Commit:
\`docs: realign CafeOS as full operating ecosystem\`

---

### Task 2: Core Commerce schema contract + CLI-generated migration

**Files:**
- Create: \`db/contracts/core_commerce_v1.sql\`
- Create: \`supabase/migrations/<CLI-generated>_core_commerce_v1.sql\`
- Create: \`tests/core-commerce-schema.test.mjs\`
- Modify: \`tests/supabase-migration-sync.test.mjs\`
- Modify: \`package.json\`

**Interfaces:**
- Produces tables:
  - \`menu_categories\`
  - \`menu_items\`
  - \`pos_orders\`
  - \`pos_order_items\`
  - \`pos_payments\`
  - \`daily_closes\`
- Produces RPCs:
  - \`commerce_create_order(uuid,uuid,text,text,jsonb)\`
  - \`commerce_capture_payment(uuid,uuid,text,numeric,text)\`
  - \`commerce_daily_dashboard(uuid,uuid,date)\`
  - \`commerce_close_day(uuid,uuid,date)\`

- [ ] **Step 1: Generate migration filename using current Supabase CLI**

In an isolated exact-main/branch workspace:

\`npx supabase --help\`

Then:

\`npx supabase migration new core_commerce_v1\`

Use the generated filename. Do not invent one manually.

- [ ] **Step 2: Write failing schema contract tests**

Lock:

- role constraint expands to \`manager\` and \`cashier\`;
- all six commerce tables exist;
- composite tenant FKs prevent cross-tenant references;
- indexes cover all FK/RLS hot paths;
- explicit \`REVOKE\`/authenticated grants/service-role grants exist;
- RLS enabled on all six tables;
- menu write policies require owner/admin/manager;
- order/payment write policies require owner/admin/manager/cashier;
- daily close requires owner/admin/manager;
- read RPC is SECURITY INVOKER; atomic order/payment/close write RPCs are hardened SECURITY DEFINER with explicit auth/role checks and no direct authenticated table writes;
- RPCs derive menu price and totals server-side;
- order key is tenant/store-idempotent;
- payment requires exact remaining balance in v1;
- daily close blocks open orders and is one row per Store/date.

- [ ] **Step 3: Run schema test and verify RED**

Run:
\`node --test tests/core-commerce-schema.test.mjs\`

Expected: FAIL because contract does not exist.

- [ ] **Step 4: Implement canonical SQL contract**

Follow current Supabase requirements:

- explicit grants;
- RLS;
- \`(select auth.uid())\` pattern;
- tenant/role helpers;
- FK indexes;
- fixed RPCs with no arbitrary SQL;
- short atomic DB transactions;
- hardened SECURITY DEFINER only for order/payment/close atomic writes, with explicit auth.uid(), tenant/role checks, fixed search_path and revoked PUBLIC/anon execution;
- authenticated users receive no raw INSERT/UPDATE grants on trusted order/payment/close tables.

Use \`FOR UPDATE\` only on the specific order row during payment transition.

- [ ] **Step 5: Copy exact canonical SQL into CLI-generated migration**

Add text-equivalence test in \`tests/supabase-migration-sync.test.mjs\`.

- [ ] **Step 6: Run focused tests**

\`node --test tests/core-commerce-schema.test.mjs tests/supabase-migration-sync.test.mjs tests/control-tower-schema.test.mjs\`

Expected: PASS.

- [ ] **Step 7: Commit**

\`feat: add Core Commerce v1 schema contract\`

---

### Task 3: Commerce server handlers on the existing workflow function

**Files:**
- Create: \`server/commerce/client-config.mjs\`
- Create: \`server/commerce/menu.mjs\`
- Create: \`server/commerce/order.mjs\`
- Create: \`server/commerce/payment.mjs\`
- Create: \`server/commerce/dashboard.mjs\`
- Create: \`server/commerce/daily-close.mjs\`
- Modify: \`api/_app-auth.mjs\`
- Modify: \`api/app/workflow.mjs\`
- Modify: \`vercel.json\`
- Create: \`tests/core-commerce-api.test.mjs\`
- Modify: \`package.json\`

**Interfaces:**

Workflow routes:

- \`client-config\`
- \`commerce-menu\`
- \`commerce-order\`
- \`commerce-payment\`
- \`commerce-dashboard\`
- \`commerce-daily-close\`

Public rewrites:

- \`/api/app/client-config\`
- \`/api/app/commerce-menu\`
- \`/api/app/commerce-order\`
- \`/api/app/commerce-payment\`
- \`/api/app/commerce-dashboard\`
- \`/api/app/commerce-daily-close\`

- [ ] **Step 1: Write failing API tests**

Lock:

- client config returns only HTTPS URL + publishable key;
- client config contains no secret/service-role variables;
- menu GET scopes tenant/store-independent menu reads correctly;
- menu POST fails unknown fields and requires manager role;
- order POST accepts only \`storeId\`, \`clientOrderKey\`, \`channel\`, \`items\`;
- order handler calls fixed \`commerce_create_order\` RPC;
- payment handler calls fixed \`commerce_capture_payment\` RPC;
- dashboard GET calls fixed \`commerce_daily_dashboard\` RPC;
- close POST calls fixed \`commerce_close_day\` RPC;
- all tenant routes use \`appContext\`;
- dispatcher routes all commerce URLs without a new API source file;
- Vercel API source count remains <= 12.

- [ ] **Step 2: Verify RED**

\`node --test tests/core-commerce-api.test.mjs\`

- [ ] **Step 3: Add commerce role helpers**

In \`api/_app-auth.mjs\`:

- \`requireCommerceWriteRole\` = owner/admin/manager/cashier;
- \`requireCommerceManagerRole\` = owner/admin/manager.

Do not alter current \`requireOperatorRole\` semantics for Control Tower.

- [ ] **Step 4: Implement six server handlers**

Rules:

- strict allowlists;
- validate UUIDs, quantities, channels, payment methods and business dates;
- never accept price/subtotal/total in order body;
- never accept computed daily totals in close body;
- use fixed RPC paths only;
- return stable error codes.

- [ ] **Step 5: Extend workflow dispatcher and Vercel rewrites**

Do not create a new file under \`api/\`.

- [ ] **Step 6: Run API + existing Control Tower tests**

\`node --test tests/core-commerce-api.test.mjs tests/control-tower-api.test.mjs\`

Expected: PASS.

- [ ] **Step 7: Commit**

\`feat: add Core Commerce authenticated API slice\`

---

### Task 4: Authenticated CafeOS app shell

**Files:**
- Create: \`public/app.html\`
- Modify: \`public/cafeos-ui.css\`
- Modify: \`vercel.json\`
- Modify: \`scripts/serve-vercel-preview.mjs\`
- Modify: \`scripts/verify-deploy.mjs\`
- Create: \`tests/core-commerce-ui.test.mjs\`
- Modify: \`package.json\`

**Interfaces:**
- Route: \`/app\`
- Uses:
  - \`/api/app/client-config\`
  - \`/api/app/session\`
  - \`/api/app/stores\`
  - commerce endpoints above
  - existing \`/api/app/brief\`
- Browser token: memory only.

- [ ] **Step 1: Write failing UI contract tests**

Lock:

- Hallmark shared CSS;
- production client config endpoint;
- no localStorage/sessionStorage;
- no service-role/secret references;
- tabs: POS, Menu, Dashboard, Daily Close, Control Tower, Analyzer;
- POS cart never exposes editable unit-price or total input;
- create-order payload has only allowed fields;
- payment UI supports only v1 methods;
- dashboard labels source as CafeOS first-party commerce;
- Control Tower panel labels source boundary explicitly;
- mobile responsive contract at <=720px;
- \`/app\` route in Vercel and local preview;
- deploy artifact includes \`public/app.html\`.

- [ ] **Step 2: Verify RED**

\`node --test tests/core-commerce-ui.test.mjs\`

- [ ] **Step 3: Implement \`public/app.html\`**

One-page authenticated shell.

Flow:

1. load client config;
2. sign in to Supabase Auth;
3. retain access token in JS memory only;
4. load session memberships;
5. choose tenant/store;
6. fetch menu/dashboard;
7. POS cart → create order → payment;
8. refresh dashboard;
9. daily close;
10. Control Tower tab loads existing Daily Brief.

Use semantic status/error regions and clear source labels.

- [ ] **Step 4: Add surface-scoped Hallmark CSS**

Operational application shell, not a generic card dashboard.

- [ ] **Step 5: Run UI + Hallmark tests**

\`node --test tests/core-commerce-ui.test.mjs tests/hallmark-ui-contract.test.mjs\`

Expected: PASS.

- [ ] **Step 6: Commit**

\`feat: add authenticated CafeOS Core Commerce app\`

---

### Task 5: Full branch verification and visual QA

**Files:**
- No planned production code unless a verified defect is found.

- [ ] **Step 1: Run full gate**

\`npm run test:dist\`

Expected: all tests PASS and API source budget <= 12.

- [ ] **Step 2: Run local preview**

Open:

- \`/app\`
- \`/analyzer\`
- \`/feedback\`
- \`/control-tower-e1\`

- [ ] **Step 3: Visual QA**

At 1200px and 390px:

- login;
- POS first fold;
- populated cart;
- Dashboard;
- Daily Close;
- Control Tower tab.

Check:

- no overflow;
- no undersized cashier controls;
- no hidden status/errors;
- no price editing affordance;
- correct Hallmark hierarchy.

- [ ] **Step 4: Whole-branch review**

Reject any accidental:

- Analyzer behavior drift;
- Control Tower semantics drift;
- service-role usage;
- new API function;
- fake payment-processing claim;
- inventory/loyalty/payroll scope creep.

---

### Task 6: Staging database validation

**Files:**
- No repo changes unless staging exposes a verified defect.

**Environment:**
- Supabase project: \`cafeos-staging\` / \`wjatnyvdygvblirggdcm\`.

- [ ] **Step 1: Restore staging if still inactive**

Do not touch production DB.

- [ ] **Step 2: Fresh-check migration history and current schema**

Confirm expected previous CafeOS migrations are present.

- [ ] **Step 3: Apply the Core Commerce migration to staging**

Use Supabase migration tooling, not ad-hoc production SQL.

- [ ] **Step 4: Run security and performance advisors**

Fix Critical/Important issues introduced by the migration before continuing.

- [ ] **Step 5: Run synthetic role-isolation acceptance**

Using synthetic users/tenants only:

- cashier cannot create menu;
- manager can create menu;
- cashier can order/pay;
- viewer cannot order/pay;
- Tenant A cannot read/write Tenant B commerce rows;
- duplicate client order key returns same order;
- wrong payment amount fails;
- second payment fails;
- close with open order fails;
- close after paid order succeeds;
- second close returns same immutable close.

- [ ] **Step 6: Run synthetic E2E**

\`Menu → Order → Payment → Dashboard → Close → Control Tower read\`

Control Tower does not yet include Core Commerce sales in its imported-data aggregate; confirm UI source boundary remains explicit.

---

### Task 7: PR / merge / production app release

- [ ] **Step 1: Open PR**

Title:

\`feat: add CafeOS Core Commerce v1 vertical slice\`

- [ ] **Step 2: Require exact-head CI green**

No merge with stale-head CI.

- [ ] **Step 3: Merge only after staging acceptance is recorded**

- [ ] **Step 4: Production release**

Deploy exact merged \`main\` once.

- [ ] **Step 5: Live verification**

Verify:

- existing Analyzer;
- feedback/E1 CTA;
- shared CSS;
- \`/app\` shell;
- client config contains only publishable config;
- no commerce write attempted against an unpromoted production DB.

If production DB has not been deliberately promoted, keep production \`/app\` in a clearly labeled non-write/preview state or do not expose the commerce route yet.
