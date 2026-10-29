# CafeOS — CLI 2.122.0 local/remote TLS classification established; staging export remains NO-GO

Date: 2026-10-29. Applies to DRAFT PR #95 atop DRAFT PR #94. **No staging database dump/export or mutation was performed.**

## Correction to initial TLS alarm

**Earlier observation (real, but incomplete):** `supabase db dump --db-url` succeeded against the existing **local** CafeOS cleanroom despite `sslmode=verify-full` with an invalid or missing CA. The cleanroom's PostgreSQL 17.11 was subsequently queried and returned `SHOW ssl = off`. Therefore that server was **not a valid positive/negative TLS test fixture**. The prior conclusion that the released Supabase CLI inherently ignores certificate verification was unsupported. Preserve the historical observations, but **do not reuse the resulting "CLI TLS security fail" verdict as a proven vulnerability**.

The local cleanroom also demonstrated:
- Pinned CLI binary version 2.122.0; passwordless URL + private 0600 `PGPASSFILE` works.
- Invalid synthetic `PGPASSFILE` is rejected.
- CLI rejects an invalid `sslmode` string.
- CLI `--dry-run` can print an expanded `PGPASSWORD` even with synthetic local credentials. **Never use `--dry-run` with real staging credentials.**

## Corrected direct MAIN-PC test: SSL-enabled PostgreSQL source

The owner MAIN-PC ran a NEW disposable `postgres:17-alpine` container `cafeos-tls-fixture-20261029` at `127.0.0.1:55433` with a temporary one-day locally generated CA and server cert carrying SAN for `127.0.0.1`/localhost.

Controls: PostgreSQL `SHOW ssl=on`; a `hostnossl ... reject` rule prevents plaintext connections; `psql` with `PGSSLMODE=verify-full` + correct CA must report `pg_stat_ssl.ssl=true`, while `psql` with wrong CA must be rejected. All of these conditions **PASS**.

**Pinned Supabase CLI 2.122.0 behavior on the same real TLS-enabled server:**

| Source-local control | Direct observation | Interpretation |
| --- | --- | --- |
| `--db-url ...?sslmode=verify-full&sslrootcert=<correct CA>` | `CAFEOS_CLI_GOOD_CA_ACCEPTED` | PASS |
| Same URL, separate unrelated valid root CA | `CAFEOS_CLI_BAD_CA_REJECTED_ON_TLS_SERVER` | PASS |
| `--db-url ...?sslmode=disable` against server rejecting non-TLS | `CAFEOS_CLI_SSL_DISABLE_REJECTED_ON_TLS_SERVER` | PASS |
| Overall local marker | `CAFEOS_LOCAL_TLS_CERT_TEST_PASS_ONLY_SYNTHETIC` | LOCAL-ONLY PASS |

Exact source of the run: `scripts/check-cafeos-cli-dump-tls-negative-local.sh` in PR #95, copied from a successful owner-local script. It uses only generated test identities and public-default synthetic credentials, no staging identifiers or account records. The ephemeral container was explicitly checked afterward to be **absent**; Docker image may remain cached. The first attempt failed while copying certs into a temporary container path; the final successful run copied certs directly into the isolated PostgreSQL data directory. Neither attempt targeted staging.

**Conservative interpretation:** 2.122.0 correctly discriminated CA trust under this single TLS-enabled Docker/local scenario. This **does not establish all TLS behaviors** (revocation, DNS redirects, changed targets, or complete handling of real managed Supabase certificates) or make it safe to export staging without an independently tested approved process.

## Historical SSL-off managed-local behavior (not a remote TLS test)

A separate direct owner MAIN-PC test used the original blank CafeOS cleanroom with `SHOW ssl=off` and its private synthetic `PGPASSFILE`, but **no merchant data**. The pinned CLI 2.122.0 was given a passwordless `--db-url` explicitly requiring each of `sslmode=require`, `sslmode=verify-ca`, and `sslmode=verify-full`. SQL stdout was discarded; no `--dry-run` or staging connection occurred.

**Measured against the SAME localhost SSL-off database** (portable libpq `psql` 18.6 as negative control):

| Requested SSL mode | Supabase CLI 2.122.0 | psql |
| --- | --- | --- |
| `disable` | exit 0; 1,933 SQL bytes | exit 0 |
| `require` | **exit 0; 1,933 SQL bytes** | exit 2 (rejected) |
| `verify-ca` | **exit 0; 1,933 SQL bytes** | exit 2 (rejected) |
| `verify-full` | **exit 0; 1,933 SQL bytes** | exit 2 (rejected) |

These outputs are real, but the hostname `127.0.0.1` at the exact running local-stack port `54322` is classified by upstream CLI as **isLocal=true**. The resulting dump environment intentionally omits PGSSL* settings for this managed-local route. It is **not a valid negative test of the remote isLocal=false backup path**, and should not be described as a proven staging security vulnerability.

New fail-closed `scripts/check-cafeos-cli-ssl-downgrade-local.sh` reproduces the condition ONLY against the cleanroom localhost. Exact committed script was run directly on MAIN-PC and emitted `STOP_CAFEOS_CLI_SSL_OFF_DOWNGRADE_require`, `...verify-ca`, `...verify-full`, and `STOP_CAFEOS_CLI_TLS_DOWNGRADE_GATE_FAILED`. It intentionally exits **42 within Bash** when strict TLS options are supplied to the managed-local route (Remote Desktop Commander PowerShell wrapper reported nonzero exit 1). This historical **local-route** diagnostic is not a remote TLS security gate; do not run it against staging or misinterpret its expected failure.

**Operational decision:** real staging export is still **NOT AUTHORIZED**, because recovery-key custody, actual-source export controls and independently compatible restore are incomplete. The prior local result no longer constitutes a proven remote TLS blocker.

## Direct route-discrimination test against the SAME SSL-off database (PASS)

**Source-grounded explanation (upstream `supabase/cli@v2.122.0`):** `db-config.layer.ts` checks whether a `--db-url` hostname/port identifies the running local stack. For exactly `127.0.0.1:54322`, it returns `isLocal=true`; `dump.handler.ts` sets `remote: !isLocal`; `pg-dump.env.ts` intentionally forwards `PGSSLMODE` and `PGSSLROOTCERT` only for the remote route. `getHostname` normally resolves to `127.0.0.1` on the MAIN-PC. `localhost` is not an exact local-host string match, so a passwordless URL using `localhost:54322` follows the **remote** route even though the destination remains the SAME disposable PostgreSQL server.

**Directly executed MAIN-PC result**, pinned standalone CLI 2.122.0, fresh private synthetic pgpass and SQL output counted/discarded:

| Host in `--db-url` | Mode | CLI result | Route interpretation |
| --- | --- | --- | --- |
| `127.0.0.1:54322` | `verify-full` | exit 0, 1,933 bytes | managed-local route; SSL flags deliberately omitted |
| `localhost:54322` | `disable` | exit 0, 1,933 bytes | remote route; non-TLS allowed |
| `localhost:54322` | `require` | exit 1, 0 bytes | remote route **rejects SSL-off** |
| `localhost:54322` | `verify-ca` | exit 1, 0 bytes | remote route **rejects SSL-off** |
| `localhost:54322` | `verify-full` | exit 1, 0 bytes | remote route **rejects SSL-off** |

An initial standalone direct command also showed: `Dumping schemas from remote database...` followed by `server does not support SSL, but SSL was required`. The committed, fail-closed `scripts/check-cafeos-cli-db-url-routing-local.sh` was copied from Git to MAIN-PC and run with **exit 0**, producing `CAFEOS_REMOTE_PATH_REJECTS_SSL_OFF_require`, `...verify-ca`, `...verify-full`, and `CAFEOS_CLI_2_122_0_LOCAL_REMOTE_TLS_ROUTE_PASS`.

This establishes the local versus remote classification hypothesis **empirically**, using the same SQL-only synthetic source. No staging connection or real backup was made.

A separate `.github/workflows/cafeos-cli-tls-routing.yml` workflow pins CLI **2.122.0** and runs `scripts/run-ci-cafeos-cli-tls-routing.sh` on a disposable Actions stack. The existing Supabase DB CI workflow pins CLI **2.117.0** and must NOT be cited as an exact binary acceptance for 2.122.0. Obtain and record final dedicated workflow status before claiming independent runner acceptance.

## Source comparison and trust boundaries

Official tagged upstream `supabase/cli@v2.122.0`:
- `apps/cli/src/command-internal/db-config.parse.ts` resolves URL `sslmode` and `sslrootcert` and `PGPASSFILE`/libpq fallbacks.
- `apps/cli/src/command-internal/pg-dump.env.ts` forwards `PGSSLMODE` and `PGSSLROOTCERT` for remote targets.
- `apps/cli/src/command-internal/pg-dump.run.ts` arranges readonly certificate bind mounts to the tool container.
- `apps/cli-go/pkg/migration/dump.go` contains an older separate Go implementation. The mere presence of both source trees does not prove which code path explains a runtime observation.

The CLI may resolve a `PGPASSFILE` password and pass it to the dump container as an environment variable; this is **not** a guarantee of secret isolation from privileged Docker operators. Only operate with a trusted local Docker host. Avoid CLI `--dry-run` with staging.

## Remaining blocking gates (no relaxation)

1. **Off-MAIN-PC private recovery identity and verified encrypted escrow** remain absent. No actual staging backup/export is authorized without explicit owner-approved custody and a recoverable independent recipient.
2. The staging DB protected `psql` connection has previously passed TLS `verify-full` and complete original seven-receipt SQL fingerprint, but the actual CLI dump **from staging** has not been exercised; any future approved remote export must be guarded and prove the intended CA/host without printing credentials.
3. A real multi-part roles/schema/data/history backup is not yet made. Actual staging Auth, receipts, extension state and independent restore are unverified.
4. Real second-target restore, signed-JWT tenant-isolation E2E, migration integrity guards, owner security approval, merge and deployment remain NO-GO.

**Gate status:** TLS-ENABLED CA POSITIVE/NEGATIVE TEST = **PASS**. SSL-OFF **REMOTE-ROUTE** REQUIRED-TLS REJECTION = **PASS** on MAIN-PC. The SSL-OFF MANAGED-LOCAL ROUTE deliberately omits TLS flags, and cannot be used to infer remote TLS failure. STAGING BACKUP = **NOT AUTHORIZED / NOT RUN** pending independent key custody, safe real-source procedure and independent real-data restore. PR #95 remains DRAFT. **RELEASE NO-GO.**
