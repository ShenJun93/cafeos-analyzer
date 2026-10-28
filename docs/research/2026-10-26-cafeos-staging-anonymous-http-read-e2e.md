# CafeOS staging — real anonymous read-API negative E2E

Evidence date: 2026-10-26. Staging project: wjatnyvdygvblirggdcm. Branch feat/cafeos-core-commerce-v1, source baseline 1a812fb. Live public HTTPS only; read-only GET requests, no signed JWT and no Commerce write RPC invoked.

## Method

- Retrieved the active modern sb_publishable key and URL using the connected Supabase app; no service-role key or database password was accessed.
- On MAIN-PC WSL, stored the public key only in a mode-0600 temporary file in a mode-0700 directory, with cleanup on shell exit. Used curl against the actual project's HTTPS host.
- Positive control: GET /auth/v1/settings with the publishable key must return 200, to establish the key was accepted and the staging Auth API was reachable.
- Anonymous negative probes: GET /rest/v1/menu_items?select=id&limit=1 and GET /rest/v1/pos_orders?select=id&limit=1. Additionally GET /rest/v1/rpc/commerce_daily_dashboard with syntactically valid nonexistent tenant/store UUIDs. No response bodies, headers with keys, Auth settings or tenant contents were persisted in Git/PR evidence. Only status and error codes were retained.
- All requests used HTTPS and did not disable certificate verification. These are Data API requests, not the previously blocked PostgreSQL TCP/pooler connection.

## Actual observed result

| Probe | HTTP status | PostgREST/PG error code | Decision |
| --- | ---: | --- | --- |
| public Auth settings positive control | 200 | no error | PASS |
| anonymous SELECT from menu_items | 401 | 42501 | DENIED, PASS |
| anonymous SELECT from pos_orders | 401 | 42501 | DENIED, PASS |
| anonymous GET commerce_daily_dashboard RPC | 401 | 42501 | DENIED, PASS |

Code 42501 denotes insufficient PostgreSQL privilege. The positive control differentiates the forbidden probes from a fundamentally invalid publishable key or unreachable Auth endpoint. This checks the *anonymous role* using real published staging API, not simulated request.jwt.claim.sub.

## Limits / release gates

- **Only three anonymous READ endpoints were tested.** Does not verify create_order, capture_payment, close_day; deliberately did not invoke any volatile/write RPC because unexpected configuration could mutate staging.
- Does **not** prove signed-in role authorization, tenant isolation, membership revocation, payments, actual concurrent transactions, or auth-provider semantics. Existing staging still contains zero menu items/orders/payments and one Auth user. JWT authenticated Commerce E2E remains OPEN.
- No migration, ledger repair, staging DDL/DML, db push, production deployment or PR merge performed.
- Full staging backup and off-host age identity recovery, authenticated TLS PostgreSQL, isolated real snapshot restore and independent security review remain unresolved. **Draft / Release NO-GO.**
