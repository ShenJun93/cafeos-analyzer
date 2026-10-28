# CafeOS staging — Commerce RPC security review evidence

2026-10-26. Source: live Supabase SELECT-only metadata, project wjatnyvdygvblirggdcm; functional PR commit b0324fa. This is an evidence package, NOT independent security approval.

## Verified observations

- Three Commerce write RPCs (create order, capture payment, close day) are owned by postgres, run SECURITY DEFINER and pin search_path to pg_catalog/public/private/pg_temp. All deny anon and PUBLIC EXECUTE while permitting authenticated EXECUTE.
- All three check auth.uid() and private.has_tenant_role against the requested tenant before writes. That SECURITY DEFINER helper verifies membership and allowed role via the authenticated user's UUID. No anonymous or authenticated CREATE privilege exists in public or private schemas.
- The pos_orders, pos_order_items, pos_payments and daily_closes tables have RLS enabled, authenticated tenant-member SELECT policies, and no direct authenticated INSERT/UPDATE/DELETE grants. The stores and tenant_members tables also have SELECT membership policies and no authenticated direct writes. Menu items permit manager-scoped INSERT using a restrictive RLS policy.
- The payment RPC locks its order row FOR UPDATE and checks the remaining balance. Order creation uses an advisory idempotency lock. These source inspections do not prove concurrency safety or genuine JWT tenant isolation.
- Supabase security advisor still warns on all three authenticated SECURITY DEFINER functions. Leaked-password protection remains disabled. These warnings are NOT dismissed.
- Staging count-only inventory: 1 Auth user, 4 tenants, 4 tenant-membership rows, 4 stores, ZERO menu items/orders/payments/daily closes/Storage objects.
- Migration ledger unchanged: 7 original receipts, fingerprint fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3. The two planned Commerce data-integrity guards remain unapplied.

## Independent review gates

1. Privileged RPCs: examine effective DB role, source, tenant checks, grants, helper ownership/search paths and potential bypasses. Authenticated API E2E must independently prove owner/cashier/unauthorized-tenant/anonymous behavior.
2. Data correctness: the live order RPC re-reads menu item prices between subtotal and item insertion; the planned snapshot-price guard remains unapplied. The daily-close RPC lacks the planned future-date guard. Both require backup/restore and migration-history approval before rollout.
3. Password protection: evaluate Free-plan limitations and compensating controls; do not suppress the advisor warning without evidence.
4. Staging authenticated Commerce write E2E: no menu items currently exist. Do not seed fixtures or create additional Auth users without explicit staging-only authorization.
5. This read-only audit is NOT a penetration test or signed security sign-off.

## Portable age key preparation

MAIN-PC WSL Ubuntu 26.04 generated a LOCAL PROVISIONAL age identity under $HOME/.local/share/cafeos-staging-backup outside Git. Directory mode 0700, identity and public recipient-file modes 0600. Synthetic age encrypt/decrypt PASS. SHA-256 of the public recipients file: 12a6975aa6157920f772457a051b8634072fbcf49fa39479b88a9585b7585a10. No private-key bytes are in Git or this report.

Critical HOLD: off-host private-key custody and recovery have NOT been verified. Do NOT use this provisional key for a real staging dump until independent recovery is demonstrated. The local WSL backup session also lacks staging DB credential, project-specific TLS CA certificate and output destination.

Supabase official docs require a database root CA from Database Settings for sslmode=verify-full. Do not substitute sslmode=require or assume a generic trust bundle is sufficient.

## Release state

Full real staging database backup NOT_RUN. Off-host age recovery NOT_RUN. Independent full restore NOT_RUN. Authenticated staging E2E, independent security sign-off and migration mapping approval OPEN. No migration repair, db push, staging guards, merge or production deploy permitted. PR #74 remains DRAFT / NO-GO.

References:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/database-linter
