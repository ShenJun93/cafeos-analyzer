# Control Tower preview staging smoke

## Purpose

Wave 26 turns the remaining Control Tower authenticated staging gate into a bounded, repeatable operator flow.

It does **not** authorize production Control Tower persistence or merchant data.

## Preconditions

Run only after Wave 26 is merged to canonical `main`.

Local repository must be:

- on branch `main`;
- clean;
- exactly equal to `origin/main`;
- already authenticated to Vercel CLI for the CafeOS Vercel team.

The launcher intentionally refuses other branches or a dirty/diverged working tree.

## Preview-only environment setup

The launcher writes exactly two variables to Vercel **preview**:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

It does not write production environment variables.

The Supabase project URL defaults to the isolated `cafeos-staging` project.

Before running, set the modern publishable key only in the current PowerShell process:

```powershell
$env:SUPABASE_PUBLISHABLE_KEY = "<sb_publishable_...>"
npm run deploy:control-tower-preview
```

The publishable key is piped to Vercel CLI over stdin. It is not embedded in repository files or a CLI argument.

The launcher:

1. fresh-checks canonical Git state;
2. runs `npm run test:dist`;
3. refreshes the two variables in Vercel `preview` only;
4. creates a Vercel preview deployment;
5. refuses the production alias;
6. runs the unauthenticated smoke gate.

Expected unauthenticated result:

```text
GET /api/app/session -> 401 AUTH_REQUIRED
```

To configure env without deploying:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-control-tower-preview.ps1 -SkipDeploy
```

## Full authenticated smoke

Full smoke requires a synthetic Supabase Auth user and two synthetic tenant IDs:

- one tenant the test user belongs to;
- one tenant the test user does not belong to.

Set only ephemeral shell variables:

```powershell
$env:CAFEOS_TEST_USER_JWT = "<synthetic-user-access-token>"
$env:CAFEOS_TEST_TENANT_ID = "<allowed-tenant-uuid>"
$env:CAFEOS_FORBIDDEN_TENANT_ID = "<other-tenant-uuid>"

npm run verify:control-tower-preview -- https://<preview>.vercel.app
```

The verifier checks:

1. unauthenticated session -> 401 `AUTH_REQUIRED`;
2. valid synthetic JWT -> session 200;
3. expected tenant membership appears;
4. own-tenant stores -> 200;
5. own-tenant attention -> 200;
6. own-tenant brief -> 200;
7. selecting the other tenant -> 403 `TENANT_FORBIDDEN`;
8. invalid JWT -> 401 `AUTH_INVALID`.

The verifier refuses the production alias.

It never prints the JWT.

## Synthetic-user boundary

Do not manufacture Supabase Auth rows by direct SQL just to satisfy this smoke.

Create synthetic Auth users through supported Supabase Auth/admin mechanisms. Then attach only synthetic tenant membership/data.

No real merchant email, transaction, customer or store data belongs in this gate.

## Pass criteria

Wave 26 code/CI can be merged before live authenticated smoke because it is tooling only.

Issue #19 remains open until live evidence proves all authenticated checks above on a Vercel preview.

Only after issue #19 closes should implementation move to persistent deterministic Daily Brief / Store Health metric reads.

## Prohibited

- no `--prod` deploy from this launcher;
- no production env mutation;
- no secret/service-role credential in browser/user read flow;
- no direct SQL creation of Auth users;
- no real merchant data;
- no Control Tower write APIs before authenticated read E2E passes.
