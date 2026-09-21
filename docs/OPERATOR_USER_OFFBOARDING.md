# CafeOS operator user offboarding

Status: **OPERATOR-ONLY / NOT USER-FACING**

This runbook implements the account-level sequence locked by issue #23. It is not an application endpoint and must never be bundled into browser/client code.

## Security boundary

Required environment:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` using a modern `sb_secret_...` key
- optional `CAFEOS_TARGET_USER_JWT` when an active access JWT for the exact target user is available

Never place the secret key or target JWT in CLI arguments, source control, logs, receipts, screenshots, or issue comments.

The secret key bypasses RLS by design and is permitted only in this controlled operator tool.

## Dry run

Dry-run is the default:

```powershell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SECRET_KEY = "<read securely from the Supabase dashboard/password manager>"

npm run operator:offboard-user -- --user-id <USER_UUID>
```

The command verifies the Auth user, lists only the membership count, and emits a one-way user reference. It performs no mutation.

## Execute

Execution requires both `--execute` and an exact repeated confirmation UUID:

```powershell
npm run operator:offboard-user -- `
  --user-id <USER_UUID> `
  --confirm-user-id <USER_UUID> `
  --execute
```

Execution order is fixed:

1. preflight the Auth user and current tenant membership count;
2. delete every `tenant_members` edge for the user;
3. verify zero memberships remain;
4. when `CAFEOS_TARGET_USER_JWT` is present, verify that JWT belongs to the requested user and call supported Auth global logout;
5. hard-delete the Auth user through the supported Auth Admin API;
6. verify the Auth user is gone;
7. emit a PII-minimized completion receipt.

The database FK contract preserves tenant Action evidence while clearing an optional `owner_user_id` assignment when membership is removed.

## Failure semantics

This workflow intentionally fails safe across the database/Auth boundary.

If a later Auth step fails after membership deletion, do **not** restore memberships merely to make the workflow look atomic. Tenant access is already revoked. Resolve the Auth failure and re-run the same command; the sequence is designed to be retry-safe.

If a supplied target JWT belongs to a different user, global sign-out and Auth deletion stop immediately. Membership removal remains in place because revoking tenant authorization is the safety-first step.

## Session semantics

Supabase global sign-out revokes sessions/refresh tokens for the supplied user JWT. Supabase Auth Admin hard-delete also removes the Auth user and associated sessions/refresh-token ability.

Already-issued access JWTs are stateless and may remain cryptographically valid until their `exp` time. CafeOS therefore never relies on Auth deletion alone: membership removal happens first, so RLS denies tenant access during that residual JWT window.

Do not mutate `auth.sessions` directly.

## Receipt

The command emits only:

- operation/result;
- one-way SHA-256-derived user reference;
- completion timestamp;
- count of memberships removed;
- session-revocation path used;
- whether an Auth user was deleted.

It does not emit the raw user UUID, secret key, target JWT, tenant identifiers, email, or customer data.
