# CafeOS — 2026-10-28 live staging Core Commerce RPC security review (read-only)

**Scope:** Supabase `cafeos-staging`, project `wjatnyvdygvblirggdcm`. **Method:** live read-only catalog queries, the Supabase Security Advisor, inspected `pg_get_functiondef` for the named functions, compared with exact Git Core Commerce code. **No function invocation, JWT generation, data export, table row reads, SQL DDL/DML, migration repair or Auth change.**

**Decision:** `PRELIMINARY_GUARDS_PRESENT_SECURITY_REVIEW_REQUIRED`. This is **NOT** a clean security signoff, a JWT test, or permission to ship.

## Verified facts

The versioned repeatable classifier is `scripts/sql/cafeos-staging-rpc-security-readonly-gate.sql` (Git blob at creation: `58f461f3ae560ff71b12dfcc6973d971ffc57ebc`). It returns a single aggregate row, no transaction data, no account ID, no secret or JWT.

| Assertion | Live observation |
| --- | --- |
| Core write RPCs in the database | 3/3: `commerce_create_order`, `commerce_capture_payment`, `commerce_close_day` |
| Owner / execution model | All 3 `SECURITY DEFINER`, owned by `postgres` |
| Controlled `search_path` | 3/3: `pg_catalog, public, private, pg_temp` |
| `anon` or direct PUBLIC `EXECUTE` | 0/3; denied on all three write RPCs |
| `authenticated` `EXECUTE` | 3/3 — intentional app use but remains a Supabase Advisor warning |
| Function-body self-checks | 3/3 include `auth.uid()` and `private.has_tenant_role` |
| `private.has_tenant_role` and `private.has_tenant_access` | Both privileged helper bodies check `auth.uid()`/`public.tenant_members` and deny `anon` EXECUTE |
| Commerce tables with RLS | 6/6: Menu Categories, Menu Items, POS Orders, Order Items, Payments, Daily Closes |
| Untrusted `CREATE` on `public`/`private` | Denied by checked catalogue grants |
| Direct table grants | `anon` SELECT/INSERT denied on six Commerce tables. `authenticated` SELECT allowed with Tenant RLS; Menu INSERT allowed behind Manager-role `WITH CHECK` policy; direct INSERT on POS Orders/Items/Payments/Closes denied |
| Password security | Supabase Advisor still reports `auth_leaked_password_protection` WARN |

The actual account membership RLS predicate on Commerce reads is `private.has_tenant_access(tenant_id)`, which checks `auth.uid()` membership. Menu `INSERT` policies check `private.has_tenant_role(tenant_id, owner/admin/manager)`. The Core Commerce writer functions check explicit role list and Tenant via those helpers. This is evidence of deliberate guard design **in the current function definitions**, not a proof of all possible permission paths.

Current function-definition hashes (`md5(pg_get_functiondef)`, observation fingerprints rather than trust anchors):

| Function signature | Observed MD5 |
| --- | --- |
| `public.commerce_create_order(uuid,uuid,text,text,jsonb)` | `c36fce6a11a4f32c7f457ac1b273ec9c` |
| `public.commerce_capture_payment(uuid,uuid,text,numeric,text)` | `9b929f904aea8acfbcec04023641fdcb` |
| `public.commerce_close_day(uuid,uuid,date)` | `aa7f7a42e6c68a1e418bcb8282998e91` |
| `private.has_tenant_role(uuid,text[])` | `9ded87dab9ddc8c8d191cd0eb804e198` |

**Important unresolved financial defects, independently verified on live staging:** `commerce_close_day` lacks `COMMERCE_CLOSE_FUTURE_DATE`; `commerce_create_order` lacks its planned cached `v_snapshot_items` and reads Menu price in separate loops. Both signed migration guards exist in Git but have NOT been applied to this database. Also, `public.pos_order_voids` and `commerce_void_order` are missing on staging. The absence of observed invalid finance rows does not validate the payment/order journey when the staging Commerce dataset is empty.

## Risk assessment

**FACT:** Supabase Security Advisor reports `authenticated_security_definer_function_executable` on all three. Direct signed-in execution is allowed by the current design; each function runs with owner privileges, not the caller's ordinary RLS privileges. Therefore app-level Manager/Cashier authorization is implemented *inside* each function and is security-critical.

**INFERENCE:** Based on static function review, current explicit Tenant membership/role checks, deliberate schema qualification, and denied anon/PUBLIC grants make the three warnings potentially intentional **but they are not false positives we may waive automatically**. The functions can bypass ordinary table RLS as the owner; unreviewed paths, grants or future function changes may expose cross-Tenant modifications.

**RECOMMENDATION:** Retain all three findings as OPEN until independent review of the full function call graph, auth context, fixed search paths and tenant/Store predicates. Do not reflexively switch the functions to `SECURITY INVOKER` or revoke `authenticated EXECUTE`: either change can break the real POS workflow unless rewritten and tested deliberately. Conversely, a passing catalog posture gate must not justify leaving a vulnerable definer exposed.

## Remaining required verification

1. **Signed-JWT two-Tenant negative matrix on approved staging**: authenticated Manager, Cashier, Viewer and a real unauthenticated caller; wrong Tenant, foreign Store, missing membership, stale/expired or invalid token, role downgrade, mismatched Order/Tenant. Test *before and after* any approved guard deployment.
2. **RPC write safety**: idempotent Order creation, price mutation during create, amount mismatch, payment duplicate/retry, cancelled/voided Order races, attempted Close with open orders or future business date, and access to another Tenant's data.
3. **Permission review**: independently inspect current function definitions/owners, EXECUTE ACLs, private helper call graph, SQL injection, trigger call chains, exposed Data API schemas, role inheritance, and all dynamic/function paths. Static substring checks used in the read-only classifier are only a warning filter.
4. **Auth hardening**: have the owner review leaked-password-protection settings in Supabase Auth; avoid changing Auth config without authorization and a documented impact test.
5. **Release gates remain blocked**: owner-controlled off-host `age` recovery on a genuinely independent device, isolated full Supabase-compatible staging backup/restore, 7→8 migration receipt reconciliation, two guarded schema upgrades and audited void migration, Windows physical operator acceptance and security signoff.

No public API, service-role token or key was exposed by this review. The test query itself has `release_approved=false` and `security_advisor_signed_off=false` even when its preliminary guard count matches expected values.

**Status:** **STOP — SECURITY REVIEW OPEN / PHASE 1 RELEASE NO-GO.** No merge, staging/production DML/DDL or merchant write test is authorized by this document.

Official references: Supabase [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Security Advisor](https://supabase.com/docs/guides/database/database-linter), [Database functions](https://supabase.com/docs/guides/database/functions), [Data API access controls](https://supabase.com/docs/guides/api/securing-your-api).
