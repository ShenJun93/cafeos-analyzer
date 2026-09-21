# Control Tower Supabase Promotion Runbook

## Current status

`db/contracts/control_tower_core.sql` is an implementation contract checked by repository CI. It is **not** a migration history entry and has not been applied to a live Supabase project.

This separation is deliberate.

## Why

Supabase CLI migration files should be created by the migration workflow rather than by manually inventing a migration filename. Supabase also now separates Data API grants from RLS, so database verification must test both.

## Promotion sequence

On a machine/environment with the repository and Supabase CLI:

```bash
supabase --help
supabase migration new --help
supabase test --help
supabase db --help
```

After verifying the installed CLI syntax:

1. create a migration named `control_tower_core` with the CLI;
2. copy the reviewed SQL from `db/contracts/control_tower_core.sql` into the generated migration;
3. start/apply it only in local or disposable/staging infrastructure;
4. create database tests for:
   - RLS enabled on every exposed table;
   - cross-tenant read denial;
   - cross-tenant write/reference denial;
   - viewer cannot create/update actions;
   - analyst/owner/admin bounded action writes;
   - customer matching identifiers not directly exposed to authenticated clients;
   - trusted attention/measurement numeric writes remain server-owned;
   - action status transition emits audit history;
   - import idempotency still passes after Store/Customer promotion;
5. run the CLI-supported database test command;
6. run security advisors;
7. run performance advisors;
8. inspect migration history;
9. only after all checks pass, open a separate PR containing the generated migration and DB-test evidence.

## Production prohibition

Do not apply this contract directly to production.

Do not ingest real merchant data until:

- migration tests pass;
- RLS/grants pass;
- two-tenant negative tests pass;
- retention/deletion behavior is defined;
- production rollback/recovery path is documented.

## Security notes

- never expose a service-role/secret key to browser code;
- `customer_identifiers` stays server-only in the first slice;
- attention and measured numeric values are server-produced;
- all product-table access is tenant-scoped;
- no fuzzy identity resolution is permitted.
