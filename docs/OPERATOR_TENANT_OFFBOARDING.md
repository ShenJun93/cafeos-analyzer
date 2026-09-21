# CafeOS operator tenant offboarding

Status: **OPERATOR-ONLY / NOT USER-FACING**

This runbook implements the controlled tenant-offboarding sequence required by issue #23. It is not a browser/API DELETE surface.

## Security boundary

Required environment:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` using a modern `sb_secret_...` key

Never pass the secret key in CLI arguments or store it in source control/logs.

## Phase 1 — prepare

Dry-run first:

```powershell
npm run operator:offboard-tenant -- --tenant-id <TENANT_UUID>
```

Execute preparation:

```powershell
npm run operator:offboard-tenant -- `
  --tenant-id <TENANT_UUID> `
  --confirm-tenant-id <TENANT_UUID> `
  --execute
```

Preparation removes every `tenant_members` edge immediately and verifies zero memberships remain. It leaves the tenant graph intact for the bounded recovery/export grace window.

The command records a PII-minimized one-way tenant reference and the default 14-calendar-day grace deadline. Current CafeOS has no authorized background ingestion/write API, so there is no separate ingestion worker to stop in this slice.

## Phase 2 — hard-delete

Dry-run:

```powershell
npm run operator:offboard-tenant -- `
  --phase hard-delete `
  --tenant-id <TENANT_UUID> `
  --grace-deadline YYYY-MM-DD
```

Execution requires all safety assertions:

```powershell
npm run operator:offboard-tenant -- `
  --phase hard-delete `
  --tenant-id <TENANT_UUID> `
  --confirm-tenant-id <TENANT_UUID> `
  --grace-deadline YYYY-MM-DD `
  --export-cleared `
  --legal-hold-cleared `
  --execute
```

If the contractual grace deadline has not been reached, the command refuses deletion unless `--early-delete-approved` is explicitly supplied.

Hard-delete also refuses to proceed while any tenant membership remains; run `prepare` first.

## Verified graph

After deleting the selected `tenants` row, the operator command verifies exact zero rows across:

- tenants;
- tenant_members;
- imports;
- transaction_line_items;
- stores;
- customers;
- customer_identifiers;
- attention_items;
- actions;
- action_status_history;
- measurement_windows.

Deletion depends on canonical DB cascades already covered by blank-database pgTAP lifecycle tests.

## Failure semantics

If any residue remains after deletion, the command fails and names only the affected table(s). It does not print row payloads.

Do not recreate memberships to repair a partial offboarding workflow. Access revocation remains the safety-first boundary.

## Receipt

Receipts contain only:

- one-way SHA-256-derived tenant reference;
- operation/result;
- requested/completed timestamp;
- grace-deadline/approval booleans;
- aggregate pre/post row counts.

They do not contain tenant name, secret key, customer data, transaction payloads, emails, or raw tenant UUID.
