# CafeOS — cross-server synthetic recovery and managed Supabase boundary (2026-10-29)

**Authority:** `MISSION.md`, `AGENTS.md`, exact Git/CI results, [Supabase CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [Supabase platform → self-hosted recovery](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

**User job:** preserve the merchant's real Auth identity, tenancy, and operational ledger so a verified recovery target can resume CafeOS correctly. **Evidence:** PR #95–#98 synthetic CI receipts, with original staging read-only scope report `docs/research/2026-10-28-cafeos-recovery-scope-and-next-gates.md`. **System of record:** Supabase staging and protected original migration receipts, not CI or synthetic fixtures. **Action owner:** the authorized operator. **Measurable acceptance:** independent, approved, encrypted actual-source backup and a verifiable, isolated full-stack restore with source/target counts, hashes and negative tenant/JWT tests.

## Proven by synthetic PR #98 (not a staging recoverability certificate)

- CLI 2.122.0 encrypted stdout export and independent `age` decrypt/restore work on synthetic fixtures.
- Fake Auth user/identity and historical migration statements were restored into a separate PostgreSQL **server** in an isolated networkless `tmpfs` Docker container, into a new scratch database; the old image-managed Auth schema was left alone.
- Source and target Auth column hashes, synthetic identity counts, and migration statement fingerprints matched.
- This successor test additionally compares a deterministic catalog digest for `auth.users`/`auth.identities`: table RLS flags, constraint definitions, indexes, RLS policy definitions, and non-internal triggers. This helps detect schema regressions that a column-only hash would miss. It does **not** verify privilege grants, extensions, other managed tables, Auth service connectivity or JWTs.

## Not proven / required release gates

| Recovery component | Synthetic proof | Actual-source/full-stack acceptance still required |
| --- | --- | --- |
| PostgreSQL 17, database roles | DB restore and queryability | Source vs target ownership, ACL/default grants, role passwords/privileges, installed extension versions |
| Auth accounts, identities and other Auth tables | 1 fake account + identity | Every source Auth row, stateful sessions/MFA/provider data, auth service behavior and user reauthentication |
| Tenant/store/membership data and finance | Local database tests | Source vs restored 4/4/4 historic counts refreshed at capture, all Commerce RLS/RPC grants and deterministic monetary invariants |
| Original migration history | Synthetic ordered statement SHA | All *seven original* staging receipts including exact statement bytes and independent pinned aggregate hash; no fabricated 7→8 repair |
| Storage | Not tested by cross-server Auth drill | DB bucket/object metadata AND real external Storage object bytes, checksums, bucket policies and access semantics; verify live inventory at capture |
| Vault and other encryption | No actual values | Encryption root custody, provider-specific behavior and recovery; never commit private keys or decryption material |
| Supabase application platform | PostgreSQL server only | GoTrue/Auth, PostgREST, Storage API, Realtime, configurations, keys, SMTP, OAuth redirect URLs, Edge Functions, secrets, webhooks, custom domains |
| JWT and tenant isolation | No JWT E2E | Fresh target-issued tokens, tenant-crossing deny controls, session/revocation checks, role switching under actual services |

**Important scope distinction:** Supabase says database exports cover managed Auth rows but Storage object **bytes** and many project settings are outside the database. For an unpopulated Storage instance, a historical zero bucket/object count does not certify future captures. See the official guides above.

## Hard STOP

No staging dump, real user replay, history repair, `supabase db push`, merge or deploy from CI green alone. Independently approved off-device decryption-key custody, owner-approved real staging source capture, safe credentials and TLS, matched platform versions and a fully isolated target remain mandatory. Existing Windows Application Control must not be bypassed.

**Status:** Synthetic PostgreSQL recovery evidence only; **DRAFT / RELEASE NO-GO**.
