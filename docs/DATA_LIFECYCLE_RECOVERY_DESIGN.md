# CafeOS data lifecycle, deletion and recovery design

Status: **DESIGN / PRODUCTION GATE**

This document defines the operational behavior that must exist before real merchant data is authorized in Control Tower.

It does not enable paid backup features and does not mutate production infrastructure.

## Scope

Covers:

- public Analyzer uploads;
- Control Tower normalized tenant data;
- customer matching identifiers;
- tenant/member offboarding;
- Auth user deletion;
- database backup/restore;
- application rollback;
- destructive database change policy.

## Current environment boundary

`cafeos-staging` contains synthetic/test data only.

Staging may be reset or rebuilt from canonical migrations and test fixtures.

Do not pay for production-grade recovery on staging unless a later test specifically requires it.

## Data classes

### A. Public Analyzer upload bytes

Current behavior remains authoritative:

- request-scoped/transient;
- no object-storage persistence;
- no database persistence of raw upload bytes;
- no raw upload bytes in logs/telemetry.

Retention: **zero intentional persistence after request processing**.

### B. Control Tower normalized transaction data

Examples:

- imports metadata;
- transaction line items;
- stable Store/Customer relationships;
- deterministic metrics/attention evidence.

Retention while tenant is active:

- retained as the tenant's operating history;
- no arbitrary automatic expiry that would silently break longitudinal analysis.

Tenant offboarding:

- access and ingestion are revoked immediately;
- the default **contractual CafeOS offboarding grace period is 14 calendar days**;
- during grace, tenant data is recovery/export-only and must not return to ordinary interactive processing;
- the merchant may request hard deletion earlier;
- a valid personal-data deletion request or other applicable deletion duty may shorten the grace period;
- documented legal/statutory hold or an explicitly agreed lawful retention obligation may delay deletion;
- after grace/hold resolution, tenant-owned data is hard-deleted through a controlled server/admin workflow.

The 14-day grace period is a **CafeOS product/contract default, not a claimed statutory minimum**. It was selected to provide a bounded export/recovery window while minimizing unnecessary post-termination retention.

Vietnam's Personal Data Protection Law 91/2025/QH15 has been effective since 2026-01-01. Decree 356/2025/NĐ-CP requires organizations to maintain clear retention/deletion policy and, for a valid data-subject deletion request, currently requires a response within 2 working days and completion within 20 days; coordination with processors/third parties may take up to 30 days, with one justified extension of up to 20 days. Those statutory request-handling timelines override any longer internal convenience window.

Official references:

- https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160
- https://vbpl.vn/bocongan/Pages/vbpq-toanvan.aspx?ItemID=187276

### C. Customer matching identifiers

Current first-slice behavior:

- deterministic matching HMACs only;
- server-only;
- no fuzzy identity.

Lifecycle:

- delete with Customer/Tenant deletion;
- never preserve matching identifiers after the tenant graph is hard-deleted unless a separately approved legal obligation requires it.

### D. Action / measurement evidence

Action status history and measurement windows are part of the tenant's operating evidence.

They remain while the tenant is active and are removed with tenant hard deletion.

Do not retain a shadow copy merely for product analytics.

### E. Synthetic staging data

May be deleted/reset at any time.

No merchant data is permitted in this category.

## Tenant offboarding sequence

A tenant deletion must be a bounded administrative operation, not a browser-side table cascade.

Required order:

1. mark the tenant as pending offboarding in the control plane or operator workflow;
2. immediately remove/revoke interactive tenant memberships;
3. immediately stop/suspend ingestion for that tenant;
4. record the offboarding request time and default 14-calendar-day grace deadline;
5. confirm whether a valid deletion request, legal/statutory hold, or explicitly agreed retention obligation changes that deadline;
6. produce an export only if required/requested;
7. hard-delete the tenant graph transactionally at the earlier valid deletion deadline or when grace expires;
8. verify zero tenant-owned rows remain;
9. record a PII-minimized deletion receipt outside the deleted tenant graph.

Do not expose direct tenant DELETE to ordinary authenticated users in v0.1.

## Auth user offboarding is separate from tenant deletion

A CafeOS user can belong to zero, one or many tenants.

Therefore:

- removing a user from one tenant removes that `tenant_members` row only;
- deleting a whole Auth user is a separate account-level operation.

### Security requirement

Supabase documents that deleting an `auth.users` row does **not** immediately invalidate already-issued JWT access tokens; they remain valid until expiry.

Current CafeOS `tenant_members.user_id` also does not cascade from `auth.users`.

Therefore global user deletion must not be implemented as “delete Auth user and stop”.

Required safe sequence:

1. remove/revoke all `tenant_members` rows for that user;
2. revoke/terminate Auth sessions using a supported Supabase mechanism;
3. delete the Auth user only after authorization edges are gone;
4. verify no tenant membership remains.

For future sensitive write operations, consider explicit active-session validation if the product needs revocation guarantees stronger than JWT expiry.

Supabase references:

- User management / deletion:
  https://supabase.com/docs/guides/auth/managing-user-data
- Session lifecycle:
  https://supabase.com/docs/guides/auth/sessions

## Database deletion correctness gate

Before a tenant hard-delete endpoint exists, add DB tests proving:

- Tenant deletion removes imports;
- Tenant deletion removes transaction line items;
- Tenant deletion removes Stores;
- Tenant deletion removes Customers and matching identifiers;
- Tenant deletion removes Attention;
- Tenant deletion removes Actions + status history;
- Tenant deletion removes Measurement Windows;
- no restrictive/composite FK leaves a partial tenant graph;
- a different tenant remains untouched.

This must run in the blank-database Supabase CI suite.

## Backup policy

### Staging

Current `cafeos-staging` remains synthetic-only.

Minimum requirement:

- canonical migrations + pgTAP are the rebuild authority;
- no paid PITR required;
- no merchant-data recovery promise.

### Production minimum

**Selected initial production tier: Supabase Pro or stronger.**

As of 2026-09-21, Supabase publishes Pro at **$25/month** and includes automatic daily database backups with **7-day retention**. Paid-plan compute credits currently cover one default Micro instance. This is a commercial product choice, not a claim that Pro alone satisfies every future compliance requirement.

Official references:

- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/backups

CafeOS initial production policy:

- Free-tier database persistence is not authorized for real merchant Control Tower data;
- first production merchant project must be Pro or stronger before persistence is enabled;
- automatic daily backup is the initial ordinary recovery point, giving a design RPO of up to 24 hours;
- PITR remains disabled by default;
- take an explicit logical `supabase db dump` recovery bundle before every destructive/high-risk production migration;
- operational logical backups must be stored outside the database/project being protected when they are required;
- before the first merchant is admitted, perform one isolated **production-tier** restore acceptance against a real production-like restore point; the synthetic localhost drill is necessary evidence but does not replace this final gate.

The current synthetic drill has already proven the CafeOS logical procedure itself: roles/schema/data dump, reset, restore, deterministic metric verification, tenant A/B isolation, and post-restore pgTAP.

## Initial recovery objective

Before PITR:

- design target RPO: **up to 24 hours**, assuming verified daily backups;
- synthetic logical-drill RTO evidence on 2026-09-21: **25.637 seconds** for reset + restore + deterministic verification on the ephemeral local fixture;
- production RTO remains **uncommitted until the production-tier restore drill is measured**.

The synthetic measurement is an engineering regression benchmark, not a customer-facing production RTO.

If observed business requirements need RPO materially below 24 hours, evaluate PITR.

## PITR decision

Supabase currently documents PITR as a paid add-on for paid projects, with at least a Small compute add-on.

Documented worst-case PITR RPO is approximately two minutes.

Current documented pricing is roughly:

- 7-day recovery: ~$100/month;
- 14-day recovery: ~$200/month;
- 28-day recovery: ~$400/month;

before/alongside required compute costs.

Reference:
https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery

Policy:

- **do not enable PITR automatically**;
- require explicit cost approval;
- enable only when merchant criticality/write volume makes <24h RPO worth the cost.

## Restore strategy

### Database

Use the nearest verified restore point before the incident.

Supabase notes the project is unavailable during restore; downtime depends on database size.

After restore:

1. verify migration state;
2. run tenant isolation smoke;
3. run deterministic golden-metric fixtures;
4. verify latest known imports/actions;
5. scan Security Advisor;
6. only then reopen writes.

For paid production, “Restore to a new project” can be useful for isolated recovery validation, but it requires manual reconfiguration of non-database project settings and has plan requirements.

Reference:
https://supabase.com/docs/guides/platform/clone-project

### Application

Vercel rollback is separate from database recovery.

Application policy:

- preserve deploy immutability;
- rollback/promote a previously verified deployment for code regressions;
- never assume code rollback reverses database mutations.

## Database migration rollback policy

Prefer **expand → migrate/backfill → verify → contract**.

Rules:

- additive/backward-compatible DDL first;
- application must tolerate old + new shape during rollout where practical;
- destructive column/table removal is a separate later migration;
- no irreversible destructive migration in the same release that first introduces its replacement;
- take/verify backup before destructive production migration;
- test rollback/recovery on non-production first.

Canonical migrations remain forward history. Do not rewrite already-applied production migration files.

## Recovery drill gate

### Synthetic procedure gate — COMPLETE

PR #42 / issue #41 established a repeatable localhost-only logical restore drill.

Measured evidence from Supabase DB run `35592673247`:

- recovered point: `2026-09-21T10:00:00Z`;
- logical dump: 4207 ms;
- data restore SQL: 68 ms;
- reset + restore + deterministic verification: 25637 ms;
- recovered 2 synthetic tenants / 11 transaction rows;
- deterministic Daily Brief verified;
- Tenant A/B RLS isolation verified;
- full 45-test pgTAP suite passed after restore;
- temporary dump bundle removed at exit and never uploaded.

### Production-tier gate — STILL REQUIRED

Before first production merchant tenant:

1. provision the approved Pro-or-stronger production project;
2. obtain a real platform daily backup or approved external logical restore point;
3. restore into an isolated production-like target;
4. apply/verify canonical migration state;
5. run DB pgTAP suite;
6. run known deterministic fixtures;
7. verify tenant A/B isolation;
8. record measured restore duration and recovered point;
9. document manual reconfiguration and secret/key rotation requirements;
10. delete the isolated recovery target or sanitize it according to the same retention policy.

Repeat after material persistence-model changes.

## Observability / evidence

For every destructive operation retain a PII-minimized operational record containing only what is needed to prove the event:

- operation/request id;
- tenant id or one-way operational reference;
- actor/admin identity;
- requested/completed timestamps;
- result;
- backup/export reference if applicable.

Do not copy deleted transaction/customer payloads into the audit record.

## Hard production gates remaining

Already completed:

- issue #19 authenticated preview E2E;
- issue #21 Daily Brief time/order identity correctness;
- 14-calendar-day contractual offboarding grace selected;
- tenant deletion cascade DB tests;
- membership-first stale-JWT authorization revocation;
- synthetic restore drill measured;
- initial production backup tier selected: Supabase Pro or stronger, daily backups, no default PITR.

Still required before real merchant data:

- supported Supabase Auth session-revocation operational acceptance;
- final controlled user/tenant offboarding operator workflow;
- final production-tier isolated restore acceptance against an actual Pro-or-stronger recovery point;
- confirmation that the merchant contract/privacy notice reflects the 14-day default grace and any lawful exceptions.

No production database is authorized merely because schema CI is green.
