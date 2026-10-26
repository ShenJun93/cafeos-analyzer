# CafeOS staging — actual MAIN-PC PostgreSQL network/TLS preflight

2026-10-26, 14:35–14:42 ICT. **Network diagnostic only, no credentials, no DB SQL and no migrations.**

Project: `wjatnyvdygvblirggdcm`, Supabase region `ap-southeast-1`, PostgreSQL version 17.6.1.166. PR #74 remains Draft. Tests run using unprivileged MAIN-PC WSL through WAG.

## Observed, reproducible results

| Probe | Evidence | Status |
| --- | --- | --- |
| `db.wjatnyvdygvblirggdcm.supabase.co` DNS | WSL resolver reports AAAA; no A record via `getent ahostsv4` | IPv6-only direct path observed |
| Direct database port 5432 | Bounded TCP connection failed; PostgreSQL STARTTLS handshake failed due to network connectivity | BLOCKED; no certificate verdict |
| `aws-0-ap-southeast-1.pooler.supabase.com` DNS + TCP | A and AAAA resolved; port 5432 reachable | NETWORK PATH EXISTS, **NOT YET VERIFIED AS PROJECT CONNECTION HOST** |
| Pooler regional hostname STARTTLS | OpenSSL reaches server; system CA bundle reports `Verify return code: 19 (self-signed certificate in certificate chain)` | `verify-full` NOT VERIFIED; **do not bypass validation** |
| Exact source of verified session-pooler connection tuple | Must come from the staging project's Dashboard **Connect** panel | NOT OBTAINED |
| Root CA from project's Database Settings | No separately authenticated project CA material obtained | NOT OBTAINED |
| Staging DB authentication | `PGHOST`, `PGUSER`, `PGPASSFILE` unset in current WSL shell; checked three conventional pgpass locations, none present | NOT CONFIGURED; no secret values read |
| Rootless age key | Provisional WSL key still at `~/.local/share/cafeos-staging-backup`; directory mode 0700, identity and recipient files mode 0600 | LOCAL ONLY |
| Off-machine independent age recovery | No second WAG machine/independent recovery custodian validated | NOT PROVEN |
| Local independent restore target | Docker commands present, engine unavailable from current WSL shell | NOT READY |

**Interpretation:** The observed regional session-pooler network path removes the generic outbound-TCP blockage for that hostname, but does **not** establish the correct project-specific host/user configuration, authenticated TLS, or working database credentials. The OpenSSL return code is evidence against trusting the default system CA for this connection, not permission to trust the chain received over an unauthenticated socket.

## Minimal operator-only next steps (no secrets in chat/Git)

1. From `cafeos-staging` Dashboard **Connect** panel, confirm the exact **Session pooler** hostname, port, user, and database for `wjatnyvdygvblirggdcm`. Do not assume the tested generic regional hostname is the project's approved connection tuple.
2. Obtain the documented **Server root certificate** in the project's Database Settings from the authenticated Dashboard. Place on a protected non-Git Linux filesystem; verify certificate provenance, hostname and `PGSSLMODE=verify-full`. Never use `require` or disable TLS verification as a shortcut.
3. Prepare a permissions-restricted external `PGPASSFILE` locally from the operator's private credential source (not chat, command-line URL, or a Git file). Prefer a short-lived dedicated staging backup login if available.
4. Prove that the existing provisional age identity can be recovered **on an actually independent device or storage/security domain** (with physical control or suitable encryption/password-manager escrow), and verify decrypting a synthetic token there. Do not upload the unwrapped identity to cloud, Git or CI.
5. Only then perform a read-only connected preflight. A real encrypted raw rescue dump remains separate from the **Supabase-compatible, actual-data restore acceptance** detailed in `2026-10-26-cafeos-recovery-path-correction.md`. No restore into staging or production.

## Current release decision

The three HEAD `c07fea7` workflows all succeeded (CI `40280812118`, Supabase DB `40280812094`, Chromium `40280812091`). Supabase staging migration history remains 7 original receipts, both planned Commerce guards absent. Real full staging backup and clean-room recovery **NOT_RUN**. No history repair, `db push`, guard migration, PR merge or production deployment authorized. **DRAFT / NO-GO**.

Source for required CA/project connection tuple: [Supabase connecting with PSQL](https://supabase.com/docs/guides/database/psql). Network probe is local evidence; Supabase documentation does not attest to this particular MAIN-PC route.
