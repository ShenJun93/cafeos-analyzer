# Control Tower Supabase Promotion Runbook

## Current status

The Control Tower schema has completed the **contract → isolated staging verification → CLI migration → blank-DB pgTAP** path.

Canonical CLI-generated migrations:

```text
supabase/migrations/20260921005530_analyzer_core.sql
supabase/migrations/20260921005532_control_tower_core.sql
```

They were generated with Supabase CLI `2.117.0`. Migration-sync tests prevent silent divergence from the Analyzer baseline and staging-verified Control Tower contract.

## Reproducible database CI

`.github/workflows/supabase-db.yml`:

1. installs pinned Supabase CLI `2.117.0`;
2. creates local config;
3. disables seed and automatic new-table exposure;
4. starts a blank local Supabase stack;
5. applies ordered migrations;
6. runs `supabase test db`;
7. prints local migration state;
8. tears the stack down.

No cloud secret is required.

## Staging evidence

Isolated `cafeos-staging` used synthetic data only. Verified cross-tenant read/write denial, viewer write denial, bounded owner action writes, action audit trigger, server-only customer identifiers, server-owned measurement values, composite tenant FK rejection and legacy import idempotency.

After advisor hardening:
- Security Advisor: 0 findings.
- Performance Advisor: no unindexed-FK findings.
- only expected unused-index INFO notices remain on the fresh staging workload.

See `docs/research/WAVE_22_SUPABASE_STAGING_VERIFICATION.md`.

## Future schema changes

For subsequent DDL:

1. fresh-check Supabase docs/changelog;
2. create migration with current CLI after checking `--help`;
3. reconcile generated migration;
4. run blank/local DB tests;
5. validate staging with synthetic data where needed;
6. run security + performance advisors;
7. review migration history;
8. merge only after repository CI + DB CI pass.

## Production prohibition

Verified migration history is **not** production-data authorization. Before production persistence: define/test retention/deletion, document rollback/recovery, verify authenticated tenant context, keep secret/service-role keys server-only, and make an explicit release decision.

Until then, Control Tower development uses staging/synthetic data.
