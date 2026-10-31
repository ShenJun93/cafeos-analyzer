# CafeOS — Tenant hard-delete Commerce retention gate (2026-10-31)

**Status:** Draft child of PR #75; **NO STAGING MUTATION, NO RELEASE AUTHORIZATION**.

## Why this change exists

`scripts/operator-offboard-tenant.mjs` was authored for Analyzer/Control Tower before Menu/POS. Its hard-delete preflight enumerated 11 `public` tables, whereas the Core Commerce + unpaid Void candidate adds seven more: `menu_categories`, `menu_items`, `pos_orders`, `pos_order_items`, `pos_payments`, `daily_closes`, `pos_order_voids`. Deleting a Tenant can cascade across historical financial data even with `exportCleared`, `legalHoldCleared` and a passed grace deadline. Merchant sale and audit history must not be silently erased on that basis.

The original row count function used `select=id` for every table. `tenant_members` has `(tenant_id,user_id)` and `pos_order_voids` has `(tenant_id,order_id)`; neither offers `id`. In addition, a missing PostgREST `Content-Range` was silently interpreted as zero. Neither behavior is an acceptable deletion precondition.

## Bounded candidate behavior

- `hard-delete` preflight requests exact, Tenant-filtered HEAD counts for all **18** currently known `public` tables in the PR #75 migration stack. `prepare` requires only `tenants` and `tenant_members` so urgent membership revocation is not blocked by an optional Commerce/Void table that does not exist yet. Per-table projected count columns are correct for `tenant_members` (`user_id`) and `pos_order_voids` (`order_id`); other tables use `id`.
- Missing/inexact/invalid/`NaN`/overflow `Content-Range`, missing PostgREST table, HTTP errors and unexpected results **refuse the operation** before any DELETE. Neither `*/0` nor `0-0/N` is an assumed default; the upstream response must explicitly provide a valid exact count.
- `prepare` continues revoking memberships while retaining Commerce actor UUID snapshots, provided the upstream database actually has the PR #75 actor-FK fix applied. It does **not** delete Orders, Payments, Close or Void.
- `hard-delete` returns the fully scoped count inventory in dry-run. On `execute`, it refuses any positive row count in `pos_orders`, `pos_order_items`, `pos_payments`, `daily_closes`, or `pos_order_voids` regardless of export, legal hold, grace or early-deletion flags. Presence of only Menu configuration does not automatically establish financial fact history, but Menu is included in the post-delete zero-residue check.
- No new elevated secret is introduced, no database policies, migration or staging data are changed, and no automatic disposal of Commerce history is authorized.

## Important remaining limits: not a merchant hard-delete signoff

This is **fail-closed preflight hardening**, not a complete retention/export/deletion design. The REST sequence of counts and DELETE is **not atomic**; source ingestion, another actor or a privileged writer could mutate rows between count and deletion. An exact count proves only row quantity, not backup authenticity, legal retention, true permission, full provider configuration or hard-delete safety. Additional tables introduced after this PR also require a reviewed schema graph. Before enabling merchant Tenant destruction, use an independently reviewed database-side atomic/quiescence mechanism, complete legal and retention decisions, exact resource inventory, audited authorization, pre/post-delete evidence, and a proven compatible backup/restore.

`hard-delete` assumes the full PR #75 local schema, including `pos_order_voids`; on older databases missing that table, destructive deletion **refuses** rather than pretending the table has zero rows. `prepare` remains deliberately usable with the original two membership/tenant tables; if a staff member still has a restrictive Commerce actor FK from an old schema, Postgres itself can block membership deletion, and PR #75's not-yet-staged migration fixes that separate lifecycle issue. The destructive path remains incompatible with un-migrated staging, which is RELEASE NO-GO.

**Safety / acceptance:** Tests use an injected synthetic PostgREST endpoint only; they verify no DELETE on existing Commerce history, invalid or missing exact count metadata and missing table responses; permit membership-only prepare without altering Commerce facts; verify empty-Commerce hard-delete retains the original confirmations and checks every table for zero residue. The PR remains Draft and must have exact-head CI PASS before any promotion. No staging/production mutation, merge or deployment is authorized here.
