# CafeOS staging — recovery-scope gate and operator handoff (2026-10-28)

**Authority:** `MISSION.md`, `docs/ROADMAP.md`, existing owner-controlled backup/ledger runbooks, and **live** read-only Supabase evidence. **Scope:** `cafeos-staging` project `wjatnyvdygvblirggdcm` only. **Status:** `SCOPE_INVENTORY_ONLY_BACKUP_AND_RESTORE_NOT_PROVEN`. This document is **not** a backup/restore receipt or authorization to modify staging.

## Exact reproducible source

- `scripts/sql/cafeos-staging-recovery-scope-readonly.sql` — one SQL `WITH … SELECT` that reads only counts and catalog metadata. It cannot reconstruct any user, credential, business transaction, receipt SQL or Storage file.
- The approved executor MUST verify the selected project is `cafeos-staging` and must never send credentials or raw rows to chat, GitHub, logs or CI.
- Actual direct Supabase connector execution of the **exact Git SQL text with comments removed** on 2026-10-28: **PASS** (Git SQL blob `ecdd897cfa0688c8275d1f8f7ce1db6fd2cdfb52`). No database mutation.

| Signal | Observed | Recovery implication |
| --- | ---: | --- |
| PostgreSQL total size | 14,011,539 bytes | Capacity is not the principal blocker; this is NOT export size |
| `auth.users` / `auth.identities` | 1 / 1 | The real Auth identity must be recovered or explicitly verified; do not use an empty test user as substitute |
| `storage.buckets` / `storage.objects` | 0 / 0 | No Storage API file payload appears registered at this checkpoint; recheck before actual capture |
| `vault.secrets` | 0 | Vault table count does not prove all project keys, configuration, root encryption key or secrets are captured |
| `supabase_migrations.schema_migrations` | 7 | All seven original receipts, **including statements**, require separate protected export and independent hash matching |
| Tenants / memberships / Stores | 4 / 4 / 4 | Preserve tenant access boundaries and validate their restored state |
| Menu items / POS orders / payments / closes | 0 / 0 / 0 / 0 | No executed first-party sale is proven by this source |
| `auth`/`storage` noninternal triggers | 7 | **Not** proof of seven customizations; compare with a fresh managed Supabase baseline before selecting a replay list |
| `auth`/`storage` RLS policies | 0 | Count-only; independently review managed-schema changes rather than inferring none |
| Extensions | `pg_stat_statements@1.11`, `pgcrypto@1.3`, `plpgsql@1.0`, `supabase_vault@0.3.1`, `uuid-ossp@1.1` | Verify extension availability/configuration on isolated restore target |

## 2026-10-31 follow-up — exact public data scope; PRE-BACKUP ONLY

**Why amended:** the 2026-10-28 version of the scope query counted only 7 of the 17 persistent `public` tables and omitted imported facts and Control Tower state. The `Supabase list_tables` table-row estimates showed 0 for some populated tables; estimates MUST NOT substitute for SQL `count(*)`.

**Direct, independently observed staging SELECT-only result**, on project `wjatnyvdygvblirggdcm`: the expanded `scripts/sql/cafeos-staging-recovery-scope-readonly.sql` counted all 17 catalog-listed `public` tables, and returned `public_table_count=17`, `public_scope_complete=true`. Its exact-name catalog guard returns false if the known public table set changes (and fails SQL execution if any required referenced relation disappears). This is a **scope gate**, not a database backup or evidence that all managed configuration can be recovered.

| Public table | Exact rows |
| --- | ---: |
| tenants | 4 |
| tenant_members | 4 |
| stores | 4 |
| imports | 3 |
| transaction_line_items | 7 |
| customers | 1 |
| customer_identifiers | 0 |
| attention_items | 5 |
| actions | 2 |
| action_status_history | 3 |
| measurement_windows | 2 |
| menu_categories | 0 |
| menu_items | 0 |
| pos_orders | 0 |
| pos_order_items | 0 |
| pos_payments | 0 |
| daily_closes | 0 |

Managed scope at this checkpoint: `auth.users=1`, `auth.identities=1`, `storage.buckets=0`, `storage.objects=0`, `vault.secrets=0`, `migration_receipts=7`; managed noninternal triggers=7 and managed RLS policies=0. Catalog set changes require refreshing inventory before any backup/export acceptance. These values are point-in-time counts, not proof of data origin or completeness of platform-held secrets.

**Recovery acceptance update:** Restore validation must compare exact counts across **all 17 public tables**, preserving import lineage, Customer data and persistent Attention→Action→Measurement state, rather than only the Auth identity, four Store records and Commerce tables. Any nonempty count mismatch requires STOP and investigation; even matching counts do not substitute for contents, constraints, JWT/RLS behavior, migration statements and managed Auth state validation.

**Safety / provenance:** This section records a direct SELECT-only observation (no Auth identities or business row contents fetched), with code/test changes confined to this Draft branch. There was no export, permission change, staging mutation, merge or deployment. `RELEASE NO-GO`.

**Unchanged live blockers:** staging receipt ledger is 7 historical versions versus canonical Git history; future-close and price snapshot SQL guards are absent; manager void SQL is not deployed; three intentional Commerce `SECURITY DEFINER` advisor findings and leaked-password protection advisory remain open. The existing independent `scripts/sql/cafeos-staging-post-repair-readonly-gate.sql` produced `PRE_REPAIR_NO_GO` this date.

## Supported recovery work order — still **NOT RUN**

**A. Independent original receipt evidence.** Keep previously DPAPI-protected seven original receipts and the independently pinned fingerprint. Re-attest fresh live ledger fingerprints before any capture; record the evidence **outside chat/Git**. Do not relabel Git canonical SQL as the seven original receipts.

**B. Owner-controlled source capture.** Follow `docs/research/2026-10-26-cafeos-full-staging-backup-execution-gates.md`: approved staging-only connection (direct IPv6 or session pooler), protected non-Git `PGPASSFILE`, host-verified TLS CA, encrypted output, and an independently recoverable off-host trust anchor. A raw encrypted `pg_dump -Fc` remains a rescue archive, **not** a Supabase-compatible restore guarantee. This runbook does not waive the existing off-host custody gate or force Android/Termux as the storage device; another independently proven custody arrangement requires owner review.

**C. Supabase-compatible export separately.** Supabase's [official CLI migration procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) distinguishes `--role-only`, regular schema, `--data-only --use-copy`, and separate `supabase_migrations` **schema and data** dumps. Explicitly prove that the exact CLI version exports and can restore the *one* Auth user/identity and the original seven migration statements, plus the four Tenant/member/Store records; do not infer completeness from a green CLI exit. Review changes to managed `auth`/`storage` schemas and platform configuration separately. **STOP before any live export** if the exact CLI/Docker versions, database connectivity/TLS, import compatibility, protected destination, authorized recovery target, or secret-safe transport are unresolved.

**Plaintext hazard:** Supabase's documented `-f roles.sql`, `-f schema.sql`, `-f data.sql` pattern creates plaintext files. Do not run it with `-f` into a durable Windows/NTFS workspace, Git tree, chat, logs or CI. First select and verify an approved, protected ephemeral-storage/encryption mechanism that is compatible with the selected CLI version; this document **does not** claim to have solved it. Never embed database passwords in CLI arguments or connection URIs that can appear in process listings/history.

**D. Isolated genuine restore.** Provision a **separate authorized** clean compatible Supabase target (not existing staging/production). Restore the actual captured bundle using a reviewed role/schema/data/history order and document all managed-schema/role adaptations. Check restored original receipts **including exact source SQL hashes**, Auth identity, Tenant member boundaries, all six Commerce RLS tables, SQL RPC execute permissions, extensions, restored data counts/financial invariants and (only if later present) Storage object bytes. Test authenticated cross-Tenant access separately with newly minted target JWTs, not copied signing secrets/tokens. Restore success must be observed on the target, never assumed from a local synthetic drill.

**E. Release decision after real recovery evidence.** Only after owner acceptance of B–D, independent history-mapping and security approval: separately approve history-only 7→8 migration repair, then genuinely pending guards, void migration and signed-in cashier/manager/browser E2E. `supabase db push` or re-marking absent guards as already applied is **not** an acceptable shortcut.

## STOP / trust boundaries

- Today's scope inventory is **SELECT-only** and not a functional Supabase backup or successful restore.
- No raw Auth rows, identity provider data, receipt SQL, project password, private key, JWT, merchant transaction or Vault content was read or exported into this document.
- The source project is Supabase Free; [official backup guidance](https://supabase.com/docs/guides/platform/backups) recommends regular external CLI exports for free projects. This does not provide a managed automatic recovery guarantee.
- Remote Desktop Commander for the owner's MAIN-PC was **offline** during this batch. The assistant has not tested local Docker/CLI credentials or host-verified staging connectivity and cannot attest a new off-host device.
- **DRAFT / RELEASE NO-GO.** No staging schema/data/role/Auth mutation, migration repair, backup export, restore, merge or deploy performed.

## Operator checkpoint to collect next (local, secret-free)

Before any export, verify and report only tool *availability/version and Docker status*: Supabase CLI `--version` and `db dump --help`, Docker `version`, `psql --version`, and an intended restore target that is **not** `cafeos-staging`. Do not include passwords, token-bearing connection strings, Auth users or other secrets. This preflight is safe to perform independently of Android/Termux setup.
