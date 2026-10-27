# CafeOS staging — live read-only preflight and security boundary checkpoint

Date: **2026-10-28 (Asia/Ho_Chi_Minh)**. Source baseline: branch `feat/cafeos-core-commerce-v1`, commit `0e2c2bf8d15364334db38f59f571ecc34d6bf64e`; PR #74 **DRAFT / RELEASE NO-GO**.

**Evidence type:** live Supabase Management connector against project `wjatnyvdygvblirggdcm` (`cafeos-staging`); explicit **SELECT-only queries** and read-only Security Advisor; no application JWT, backup credential, real archive, schema mutation, migration repair, Auth writes or production deployment.

## Live ledger and empty-Commerce baseline

Queried `supabase_migrations.schema_migrations` using the complete ordered statement fingerprint expression in `scripts/sql/cafeos-staging-receipt-fingerprint.sql`, plus COUNT-only queries against public Commerce tables.

| Evidence | Observed |
| --- | --- |
| Staging migration receipts | **7** historical receipts |
| Full ordered receipt SQL SHA-256 | `fa57902e637543dde1082d4ff307aabda1a9e223a3b0a354780948da8bb34eb3` |
| `public.menu_items` | 0 |
| `public.pos_orders` | 0 |
| `public.pos_order_items` | 0 |
| `public.pos_payments` | 0 |
| `public.daily_closes` | 0 |

**Not a statement that staging is empty:** other tenant/identity/platform records already exist. No raw Auth, customer, merchant or credential values were retrieved.

## Exact canonical pre-repair preflight re-executed against staging

Ran the read-only CTE from `scripts/sql/cafeos-staging-legacy-ledger-readonly-preflight.sql` (Git blob `ce1949b0c0479fd0a9ece06068070de722972587`) without comments, unchanged in SQL semantics.

| Asserted shape | Result |
| --- | --- |
| Matching historical ledger receipts / total | **7/7** |
| Foundation column names and types | **107/107** |
| Foundation indexes (definition fingerprints) | **14/14** |
| RLS policies (definition fingerprints) | **17/17** |
| Private function source fingerprints | **3/3** |
| Table access grants and RLS | **11/11** |
| Expected enabled audit trigger | **1/1** |
| Future-date close guard on real staging RPC | **Absent (expected; no migration executed)** |

This validates the **bounded checks encoded in the pinned SQL only**. It does not prove all schema semantics or authorize history repair. The Menu-price snapshot guard also remains unapplied per the exact seven-receipt ledger and prior staging source review; this query does not independently prove every part of that guard's absence.

## Separate read-only privileged RPC / RLS verification

SELECT from PostgreSQL catalogs and built-in privilege introspection confirmed:

- `commerce_create_order`, `commerce_capture_payment`, `commerce_close_day`: each is `SECURITY DEFINER`; effective `anon EXECUTE = false`, `authenticated EXECUTE = true`; function definition text contains `auth.uid()` and `has_tenant_role`. Text-pattern presence alone does not prove correct runtime authorization.
- `pos_orders`, `pos_order_items`, `pos_payments`, `daily_closes`: RLS is on and `authenticated` lacks direct INSERT/UPDATE/DELETE on every table. Writes via the three deliberately privileged RPC paths require separate review and authenticated E2E.

Fresh Supabase Security Advisor still reports **3** `authenticated_security_definer_function_executable` findings and **1** `auth_leaked_password_protection` finding. These are **open WARN findings**, not suppressed or declared fixed.
- Connected Supabase organization metadata confirms the hosting plan is **`free` / `tier_free`**. Current Supabase [password security documentation](https://supabase.com/docs/guides/auth/password-security) explicitly limits **leaked-password protection to Pro and higher**. This fourth warning cannot simply be toggled on while the project stays on its current Free plan. Require an owner-approved upgrade **or** a documented, independently reviewed compensating-control/risk decision; neither is approved or implemented here. Do not purchase a plan or change Auth settings by inference.

References: [Supabase SECURITY DEFINER linter](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); [Supabase Auth password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Code and environment acceptance

Exact source baseline `0e2c2bf8d15364334db38f59f571ecc34d6bf64e`:
- GitHub Actions CI run **40519795581 SUCCESS** (277 PASS, 0 SKIP on Linux).
- GitHub Actions synthetic Chromium run **40519795657 SUCCESS**.
- GitHub Actions disposable Supabase DB run **40519795602 SUCCESS**.
- Separately supplied MAIN-PC PowerShell evidence: clean pull and `npm ci`; `npm test` and `npm run test:dist` each **269 PASS / 0 FAIL / 8 explicitly SKIP** on native Windows; final Git status clean.

Linux synthetic database/Chromium acceptance **does not** prove real staging authenticated JWT or merchant application behavior.

## Unchanged HOLD gates and owner-controlled next action

1. **Off-host age recovery:** existing provisional age private identity is MAIN-PC local only. Independently generate/hold the second-device private recipient identity, create encrypted source-identity escrow using its *public* recipient, copy escrow to that device, verify recovery there against an independently kept public-key checkpoint. Do not copy any private key into Git, chat, CI or backup archive. `scripts/prepare-cafeos-age-recovery-recipient.sh` is a guarded candidate only; do not treat local escrow creation as off-host recovery proof.
2. **Real backup and restore:** an authorized owner-controlled encrypted staging capture **and** a separately designed Supabase-compatible roles/schema/data plus original migration-history export; prove isolated restore of **actual staging-derived data**, managed Auth/Storage state and permissions on a different trusted target. Raw `pg_dump -Fc` alone is **not** a Supabase-platform restore certification.
3. **Only after independent approvals:** exact 7→8 canonical historical-receipt mapping, execution of the two genuinely pending Commerce integrity migrations on staging, authenticated owner/cashier/cross-tenant HTTP/browser E2E, independent security sign-off and explicit release decision.

**STOP:** Do not run `supabase migration repair`, `supabase db push`, apply pending guards, merge PR #74 or deploy production. The new SELECT-only results do **not** close any backup/restore/authenticated-E2E gate.
