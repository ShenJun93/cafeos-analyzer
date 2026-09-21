# CafeOS New Chat Handoff — 2026-09-21 — Control Tower Auth 503 Closure

## Authority

Do **not** use prior chat memory as canonical authority.

Fresh-read in this order before acting:

1. `MISSION.md`
2. `docs/PRODUCT_ARCHITECTURE.md`
3. `docs/ROADMAP.md`
4. this handoff
5. `scripts/deploy-control-tower-preview.ps1`
6. `scripts/run-control-tower-auth-smoke.ps1`
7. `scripts/verify-control-tower-protected-preview.mjs`
8. GitHub issue #19 and its latest comments
9. fresh `main` / `origin/main` / working-tree state

Git/repo, CI, Supabase staging, Vercel deployment evidence, and live runtime behavior override this handoff if they differ.

## Mission lock

CafeOS mission remains:

> Build the operating and customer-intelligence layer for multi-location café brands.

The Analyzer is a wedge/module, not the product identity.

Do not turn CafeOS into an Excel assistant, generic BI builder, replacement POS, or loyalty clone.

## Canonical checkpoint at handoff

Fresh-verified `main` checkpoint before this handoff:

`d72353deaeaa6f66c2b0975ce551c35ccbd7224b`

Commit title:

`fix: harden Control Tower preview env handoff`

CI run:

`35564930484` — **SUCCESS**

PR #26 already merged the 503/stale-preview fix.

## Issue #19 — current live gate

Issue:

`Control Tower staging auth smoke: Vercel preview + synthetic user`

State: **OPEN**

The authenticated E2E gate is not complete yet.

### Already verified live

- Synthetic Supabase Auth user exists and is email-confirmed.
- Synthetic user is attached **only** to Synthetic Tenant A with role `owner`.
- Tenant B has no membership for that user.
- Synthetic Tenant A:
  `11111111-1111-4111-8111-111111111111`
- Synthetic Tenant B:
  `22222222-2222-4222-8222-222222222222`
- Both tenants contain only synthetic staging data.
- Protected-preview transport works.
- Unauthenticated `GET /api/app/session` reached CafeOS and returned:
  `401 AUTH_REQUIRED`.
- Authorization headers are no longer passed on the Windows command line.
- JWT/header diagnostics are redacted and temporary header files are cleaned up.
- No real merchant data has been used.

## Latest live failure and verified root cause

Latest authenticated smoke against the old preview produced:

`GET /api/app/session -> 503`

This is **not** an unresolved auth/RLS mystery.

Verified evidence recorded on issue #19:

- current CafeOS code emits 503 on this path as `APP_NOT_CONFIGURED` when `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is unavailable/invalid in the deployment;
- Vercel runtime recorded the 503 on deployment:
  `dpl_4Lqtm3X5nDjiKPLBTnn1oVtcEuro`;
- that deployment came from stale commit:
  `7384299602836e67ac94584030f8fef48d4461ae`;
- the authenticated smoke runner had been targeting that stale preview.

PR #26 fixed the handoff between preview deployment and authenticated smoke.

## What PR #26 changed

Canonical launcher now:

1. refreshes preview-only `SUPABASE_URL`;
2. refreshes preview-only `SUPABASE_PUBLISHABLE_KEY`;
3. verifies both variable **names** appear in Vercel preview env;
4. deploys a **fresh preview**;
5. runs protection-aware unauth smoke against that new preview;
6. writes the fresh preview URL to:
   `.vercel/cafeos-control-tower-preview-url.txt`;
7. authenticated smoke reads that recorded URL by default;
8. production alias remains refused.

Do not reuse the old `cafeos-analyzer-nzb1i2njx-...` preview for the final gate.

## NEXT ACTION — exact resume point

From the user's Windows machine, fresh-pull canonical main and deploy a **new** preview.

The current PowerShell session may not contain the publishable key after restart, so set it from the user's known staging publishable key locally without committing or echoing it into repo files.

Run:

```powershell
Set-Location "$env:USERPROFILE\Downloads\cafeos-analyzer"
git pull --ff-only
npm run deploy:control-tower-preview
```

The launcher must:

- pass committed-dist gates;
- verify preview env names;
- deploy a new preview;
- pass unauthenticated protected-preview `401 AUTH_REQUIRED`;
- persist the fresh URL under `.vercel/cafeos-control-tower-preview-url.txt`.

Then run:

```powershell
npm run verify:control-tower-auth-smoke
```

Enter the synthetic test-user password only at the secure prompt. Do not paste/store it in Git, issue comments, or logs.

## Required final #19 evidence

All of these must pass on the **fresh recorded preview**:

1. no token → `401 AUTH_REQUIRED`
2. valid synthetic user session → `200`
3. Tenant A `/api/app/stores` → `200`
4. Tenant A `/api/app/attention` → `200`
5. Tenant A `/api/app/brief` → `200`
6. same user selecting Tenant B → `403 TENANT_FORBIDDEN`
7. invalid JWT → `401 AUTH_INVALID`
8. no service-role/secret credential in browser/user-facing read path

Only after all eight pass should issue #19 be closed.

## After #19 closes

Resume the product sequence already defined by canonical issues/docs:

1. issue #21 — Daily Brief correctness gate
   - source/store timezone semantics
   - source-scoped order identity
   - 4-week same-weekday baseline completeness
   - missing rows are not zero
2. implement the deterministic Daily Brief read model only after those correctness gates close
3. issue #23 — production data lifecycle/recovery gate remains required before real merchant data

Do not jump directly to full Daily Brief implementation before #21 correctness requirements are satisfied.

## Security / operating constraints

- staging synthetic data only
- no production merchant mutation
- no real merchant data
- no service-role/secret key in user-facing paths
- no user write APIs before authenticated read E2E passes
- keep Vercel Deployment Protection enabled
- use `vercel curl` / protection-aware smoke rather than disabling protection
- do not print JWTs
- do not commit publishable keys or passwords
- GitHub connector branch creation may be blocked by tool safety checks; do not claim a PR/branch exists unless Git proves it

## Known external/tool state

- Supabase staging project: `cafeos-staging`
- project ref: `wjatnyvdygvblirggdcm`
- region: `ap-southeast-1`
- Vercel project: `cafeos-analyzer`
- issue #19 remains open
- Remote Desktop Commander device was previously offline; re-check before relying on it
- Vercel connected app is useful for live reads/logs, but preview env mutation has been performed through guarded local CLI

## Recovery rule

If the next session sees any mismatch between this handoff and Git/live state:

1. trust Git/live state;
2. record the discrepancy;
3. do not invent missing state;
4. resume from the newest verified checkpoint.
