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

- access is revoked first;
- export/legal-hold requirements are checked;
- tenant-owned data is then hard-deleted through a controlled server/admin workflow.

An exact contractual grace-period duration is a business/privacy-policy decision and must be explicitly set before the first merchant production tenant. Engineering must not invent a legal retention period.

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
2. remove/revoke interactive tenant memberships;
3. stop/suspend ingestion for that tenant;
4. confirm no legal/contractual hold;
5. produce an export only if required/requested;
6. hard-delete the tenant graph transactionally;
7. verify zero tenant-owned rows remain;
8. record a PII-minimized deletion receipt outside the deleted tenant graph.

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

Before real merchant persistence, choose a production project/plan with a documented backup path.

Supabase currently documents:

- Pro: daily backups, last 7 days;
- Team: daily backups, last 14 days;
- Enterprise: up to 30 days;
- Free: regularly create off-site logical backups using `supabase db dump`.

Reference:
https://supabase.com/docs/guides/platform/backups

CafeOS initial production policy:

- no real merchant data on a recovery model weaker than one verified daily/off-site restore point;
- take an explicit logical backup before destructive/high-risk data migrations even when platform backups exist;
- store operational backups outside the database being protected.

## Initial recovery objective

Before PITR:

- design target RPO: **up to 24 hours**, assuming verified daily backups;
- RTO: **measured by restore drill, not promised in advance**.

Do not advertise an RTO until a real restore drill records it.

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

Before first production merchant tenant:

1. create a production-like disposable/restore target;
2. restore a known backup/dump;
3. apply canonical migrations if required;
4. run DB pgTAP suite;
5. run known Analyzer golden fixture;
6. verify tenant A/B isolation;
7. record measured restore time and data point recovered;
8. document any manual reconfiguration.

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

Before real merchant data:

- issue #19 authenticated preview E2E must pass;
- issue #21 Daily Brief time/order identity correctness must pass;
- exact commercial/privacy retention grace period must be explicitly selected;
- tenant deletion cascade must have DB tests;
- user offboarding must revoke memberships/sessions safely;
- at least one restore drill must be measured;
- production backup tier/strategy must be explicitly approved.

No production database is authorized merely because schema CI is green.
