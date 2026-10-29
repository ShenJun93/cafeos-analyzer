# CafeOS — Supabase CLI 2.122.0 TLS evidence corrected; staging export remains NO-GO

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

**Gate status:** LOCAL CLI TLS POSITIVE/NEGATIVE TEST = **PASS**. STAGING BACKUP = **NOT AUTHORIZED / NOT RUN**. PR #95 remains DRAFT. **RELEASE NO-GO.**
