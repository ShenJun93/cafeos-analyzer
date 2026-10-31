# CafeOS — real GoTrue-issued JWT / RLS / POS local E2E acceptance

**Date:** 2026-10-31. **Parent:** Draft PR #74 `feat/cafeos-core-commerce-v1`, HEAD `75d06fb1f0b112c0fe1a7d8d969d7cdb53505334`. **Scope:** *disposable isolated LOCAL Supabase*; **not staging acceptance, not recovery certification**.

## Objective and trust boundary

Prove that a signed bearer issued by an actual GoTrue/Auth service is honored by running PostgREST/RLS and SECURITY DEFINER Commerce functions, including negative Tenant and role checks. This supplements, but never substitutes for, pgTAP tests with `SET LOCAL request.jwt.claim.sub` (which do **not** verify real JWT issuance/signing/routing). The source of truth is the exact Git script, verified WAG MAIN-PC execution, actual local database counts and CI results.

The script `scripts/run-local-cafeos-signed-jwt-e2e.py` accepts **no staging connection input**, uses only `http://127.0.0.1:55321`, and requires the preexisting dedicated `cafeos-e2e-isolated-20261030` Docker Compose stack. It extracts the **anon** key from the local Kong configuration **in process memory only**, rejecting any role other than `anon` and never printing secret key, service key, user JWT, test password, email or actual Auth JSON. GoTrue `/auth/v1/signup` creates four fake `example.invalid` users and issues true access tokens; each token is checked with `/auth/v1/user`. The test uses only generated UUIDs, generated passwords, synthetic tenant/store/Menu data and no customer records.

An owner-invoked Bash wrapper `scripts/run-local-cafeos-signed-jwt-e2e.sh` checks exact container names and Compose project identity; fails if another operator already started any target container; obtains a private local lock; requires `CAFEOS_LOCAL_E2E_ACK=ONLY_SYNTHETIC`; requires `CAFEOS_LOCAL_E2E_WILDCARD_PORT_ACK=YES` when Docker host ports are exposed beyond localhost; starts exactly four dedicated services; tests GoTrue health; and **stops only the containers it started**, preserving volumes on both success and failure. This is **not** a daemon, a production runner or an automated staging task.

**Important host risk:** the existing disposable stack advertises ports `55321`/`55322` on `0.0.0.0`, rather than binding only `127.0.0.1`. Do not run it on an untrusted/open network; prefer republishing the test stack on loopback for a future improvement. The wrapper requires a separate explicit acknowledgement before temporarily opening that existing configuration.

## Observed direct MAIN-PC acceptance

On WSL Ubuntu (Docker Engine 29.8.2; GoTrue/Auth running; PostgreSQL 17.11), the temporary test source was executed **twice** on 2026-10-31, after correcting the key selection to exclude the `service_role` token and then removing the unnecessary PyYAML dependency/expanding cleanup verification. Latest run:

- `RESULT_SIGNED_JWT_LOCAL_E2E_PASS ASSERTIONS=36`: actual GoTrue-issued and Auth-validated JWTs for 4 test users; RLS Tenant/Store visible only to the signed-in member.
- Owner may insert Menu; Viewer/Cashier may not. Owner A cannot insert B's Menu.
- Viewer A and Owner B cannot create Tenant A order. Cashier A can create a two-item-quantity Order at **70,000 VND**, retry without a second order, and capture one **70,000 VND** cash payment.
- Cashier cannot close day. Owner closes day with exactly one Order and reconciled 70,000 VND Payment.
- Signed Owner B cannot read Tenant A's Order; Viewer A can read it while still a member; revoking Viewer A's `tenant_members` row immediately revokes access **even with the previously issued JWT**.
- `POST_CLEANUP_COUNTS=0,0,0,0,0,0,0,0,0,0,0,0,0` for exact rows in `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `public.tenants`, `tenant_members`, `stores`, `menu_categories`, `menu_items`, `pos_orders`, `pos_order_items`, `pos_payments`, `daily_closes`. Four service containers were stopped and volumes retained.

**Audit-log caveat:** GoTrue may retain synthetic `auth.audit_log_entries` (preexisting local stack had 50 from prior work). These are outside the 13 exact zero-count fixture tables; do not claim that *every* Auth managed table is pristine or erase unrelated audit logs. The test stack is disposable and must not be used as an authoritative merchant database.

## Reproduce from the reviewed Git commit

From an owner-managed WSL shell with the same exact, stopped, dedicated local Compose stack and trusted network/firewall conditions:

```bash
CAFEOS_LOCAL_E2E_ACK=ONLY_SYNTHETIC \
CAFEOS_LOCAL_E2E_WILDCARD_PORT_ACK=YES \
bash scripts/run-local-cafeos-signed-jwt-e2e.sh
```

A successful run must print `RESULT_SIGNED_JWT_LOCAL_E2E_PASS ASSERTIONS=36`, the thirteen zero counts and `CAFEOS_SYNTHETIC_E2E_CONTAINERS_STOPPED_VOLUMES_PRESERVED`. Any missing dedicated service, nonblank baseline, malformed Kong anon role, unauthorized business action, unclean fixture or Docker cleanup failure is **STOP**. No real DB password, signed tenant JWT or recovery identity should be pasted into a Git issue.

The Node `tests/signed-jwt-local-e2e.test.mjs` source/parse checks are safe to run in GitHub CI; **these static checks are not live GoTrue E2E CI**. Actual signed-JWT E2E is owner-invoked locally until a self-contained, trusted, restricted-network CI fixture exists.

## Unresolved release gates

Local success does **not** test production TLS/redirects, live staging merchant identities, complete Auth/Storage state, off-machine custody, original staging receipt recovery, independent full-stack restore, future PR #75 Void or PR #106 hard-delete, or newly pending guard migrations. In particular, staging still has only seven original legacy migration receipts and lacks future-close/price-snapshot guards. Never `db push`, `migration repair`, export staging, merge or deploy based on this test. **CafeOS RELEASE NO-GO.**
