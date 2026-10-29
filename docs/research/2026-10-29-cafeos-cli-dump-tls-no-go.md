# CafeOS recovery — Supabase CLI 2.122.0 remote TLS verification HOLD

Date: 2026-10-29. Scope: MAIN-PC Ubuntu WSL 2 + Docker local cleanroom, **not** staging data. Related: DRAFT PR #95 atop DRAFT PR #94.

## Observed (direct execution; not inference)

Executable: `/home/pacmap/.local/share/cafeos-tools/supabase-2.122.0/supabase`, CLI version **2.122.0**, cleanroom Postgres **17.11**, Docker Engine **29.8.2**. All tests used the disposable local password `postgres` for `127.0.0.1:54322/postgres`. `PGPASSFILE` was a freshly created private `0600` file; URL contained **no password**. Temporary files were removed after each command.

| Probe | Outcome |
| --- | --- |
| `supabase db dump --db-url` (local URL, no password) using valid local `PGPASSFILE` | PASS |
| Same but deliberately incorrect private `PGPASSFILE` | rejected, PASS |
| `psql` with `PGSSLMODE=verify-full` and invalid `PGSSLROOTCERT` | rejected, PASS |
| CLI `--db-url` with `PGSSLMODE=verify-full` and invalid `PGSSLROOTCERT` | **succeeded**, SECURITY FAIL |
| CLI URL with `?sslmode=verify-full&sslrootcert=<invalid-local-CA-file>` | **succeeded**, SECURITY FAIL |
| CLI URL with `?sslmode=verify-full&sslrootcert=<nonexistent-local-CA-file>` | **succeeded**, SECURITY FAIL |
| CLI URL with unknown `sslmode=this-is-not-valid` | rejected (parser validation present) |

**Critical interpretation:** a real `--db-url` CLI export successfully connected to local Postgres despite an expressly invalid `verify-full` root CA. This demonstrates that **this CLI execution path is not yet proven to enforce TLS verification**. It does not by itself establish the internal root cause; avoid speculating or treating upstream TS source code as proof the released binary behaves that way.

Upstream tagged `v2.122.0` source:
- `apps/cli/src/command-internal/pg-dump.env.ts`: declares `PGSSLMODE` / `PGSSLROOTCERT` propagation for remote mode.
- `apps/cli/src/command-internal/pg-dump.run.ts`: containerTlsFiles intends read-only certificate mounts.
- `apps/cli-go/pkg/migration/dump.go`: separate Go implementation's `toEnv` only includes `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`. These implementations coexist at this release tag; which path actually explains the measured behavior needs investigation.
- Supabase CLI documentation: https://supabase.com/docs/reference/cli/supabase-db-dump
- Supabase PostgreSQL SSL documentation: https://supabase.com/docs/guides/database/psql

**Security boundary:** the CLI resolves a password from `PGPASSFILE` and places that password in the child dump container environment, which is potentially visible to privileged Docker operators. The successful no-password URL test is not a claim of zero exposure in Docker. **Never run `--dry-run` with real credentials**: local CLI `--dry-run` printed an expanded shell script containing `export PGPASSWORD=...`.

## Immediate policy: staging CLI dump blocked

**DO NOT** run `supabase db dump --db-url`, `--linked`, or `--dry-run` against real CafeOS staging until a reviewed and reproducible verify-full positive/negative TLS test proves server identity and CA validation on the actual execution path. Prior CI green on **five synthetic encrypted streams** does *not* authorize a live dump.

A fail-closed **localhost-only** executable `scripts/check-cafeos-cli-dump-tls-negative-local.sh` validates:
1. The existing exact cleanroom, its container identity and zero real users.
2. The test-only local `PGPASSFILE` resolves without embedding a password in a URL.
3. `psql` refuses the invalid CA.
4. The CLI also refuses the invalid CA; if the CLI accepts it, prints `STOP_CAFEOS_CLI_VERIFYFULL_BAD_CA_ACCEPTED` and exits **42**.

As of the observed CLI release, this security test is **expected to FAIL**, not a release success marker. Future remediation must use a version/implementation that truly enforces the CA gate, or an independently reviewed native client + Supabase-filtering approach; it may not silently fall back to TLS `prefer` or raw `pg_dump` claiming Supabase restore compatibility.

## Other unresolved gates (unchanged)

- An independent trusted second-device age recovery identity, escrow and offhost cryptographic readback are still absent.
- The main-PC staging PostgreSQL **psql** `verify-full` read-only query and independently attested seven-receipt SHA-256 have PASS evidence, but this does not validate CLI Docker SSL settings.
- No actual staging roles/schema/data/history export or real-source restore has been executed. A same-server synthetic Auth/history restore is not independent recovery.
- No staging mutation, migration repair, guard deployment, branch merge or production release authorized.

**Status: security HOLD, PRs DRAFT, RELEASE NO-GO.**
