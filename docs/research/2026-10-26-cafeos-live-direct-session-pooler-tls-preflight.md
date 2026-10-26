# CafeOS staging — direct/session-pooler PostgreSQL TLS preflight

Date: 2026-10-26 (MAIN-PC). Staging project ref wjatnyvdygvblirggdcm. PR #74 remains Draft. Network and certificate checks only: no DB password, SQL or staging mutations.

## Connection data and verified network

- Direct: db.wjatnyvdygvblirggdcm.supabase.co on port 5432, database postgres, username postgres. Windows OS resolves IPv6 and reaches port 5432. WSL lacks any IPv6 default route/global IPv6 address, and cannot directly reach this endpoint.
- Operator-supplied Transaction Pooler: aws-0-ap-southeast-1.pooler.supabase.com on port 6543, database postgres, username postgres.wjatnyvdygvblirggdcm.
- Per current official Supabase documentation, Session Pooler uses the same host and project user on port 5432; it is preferred over Transaction Pooler for persistent clients and migration/dump operations on IPv4-only networks.
- Windows and WSL both reached TCP 5432 and 6543 on the pooler. Both pooler ports passed PostgreSQL STARTTLS CA-chain verification and exact hostname matching.

## Certificate and actual PostgreSQL-client check

- Located Windows Downloads/prod-ca-2021.crt (1367 bytes). Subject and issuer: Supabase Root 2021 CA; Basic Constraints CA:TRUE; valid Apr 28 2021 through Apr 26 2031.
- Original certificate file SHA-256: 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7. Certificate fingerprint SHA-256: 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA.
- Copied CA file to $HOME/.config/cafeos-staging/db-root-ca.crt on WSL, outside Git, with mode 0600 and matching SHA-256; parent config directory mode 0700.
- OpenSSL s_client -starttls postgres verified the full hostname and CA trust using this file, returning Verify return code: 0 (ok) on both ports.
- Real portable PostgreSQL 18.6 psql tested Session Pooler 5432 with PGSSLMODE=verify-full, PGSSLROOTCERT pinned to the copied file, correct project-scoped username, -w without any password, and PGOPTIONS set read-only. It reached the expected password-required error. No DB authentication or SQL occurred.
- Certificate cryptographic validation passed; authenticated Supabase Dashboard download provenance was not independently inspected by the agent and remains an operator provenance assertion if required.

## Execution gate implications

- MAIN-PC WSL has working Session Pooler TCP/TLS via IPv4. Do NOT use Transaction Pooler 6543 for the pg_dump archive: transaction pooling does not guarantee stable session state. Direct is also reachable from Windows IPv6 but not WSL.
- Existing backup candidate already pins allowed staging pooler hostname, port 5432, user postgres.wjatnyvdygvblirggdcm and verify-full. No backup candidate script change needed.
- Protected operator-supplied PGPASSFILE is not configured, and the real authenticated read-only DB preflight remains NOT_RUN.
- Provisional age private identity is local to WSL. An independently verified off-host recovery/escrow has not been established. No real staging backup allowed without it.
- Full staging-derived Supabase-compatible isolated restore and security sign-off remain open. Do not confuse a raw PostgreSQL encrypted archive with platform recovery proof.

Original seven receipt history preserved. NO migration repair, db push, staging DDL/DML, Commerce guard rollout, PR merge or production release. Draft / Release NO-GO.

References:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/psql
- https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres
