# Deployment profile — validation surface

## Purpose

Deploy only the existing validation wedge: landing page, sample report, transient CSV/XLSX analysis, compatibility profile and no-contact feedback. This is not a production SaaS authorization.

## Runtime split

- Local validation mode: up to 20 MB per CSV/XLSX file; no cloud persistence.
- Public Vercel surface: up to 4 MiB per request, deliberately below Vercel Functions' documented 4.5 MB request-payload limit.
- Large or sensitive files: use the local validation kit or split exports. Do not silently upload them to object storage.

## Privacy contract

The public surface may process raw transaction data transiently inside a function request. It must not write raw uploads to a database, object store, telemetry payload or log. Public pages disclose this behavior before upload.

Compatibility profile remains the preferred shareable evidence because it contains schema/header/count metadata without transaction row values. Pseudonymized validation packs remain available for deeper reproduction.

## Deployment artifact

`public/` contains static pages. `api/` contains raw-body Vercel-shaped functions importing committed `dist/` output. `vercel.json` routes the static validation surface and uses `npm run verify:deploy` as the build gate.

The validation surface intentionally deploys committed compiled output. `dist/.source-fingerprint.json` binds `dist/` to `src/**/*.ts` plus `tsconfig.json`; deployment verification fails if source changed without a local compile/stamp. Fingerprint text is normalized to LF before hashing so Windows CRLF checkouts and Linux LF checkouts produce the same hash. `.gitattributes` also pins fingerprint inputs to LF for future checkouts. Deployment and committed-dist tests therefore do not require a globally installed TypeScript compiler.

## Release gates

Before deployment:

1. `npm run test:dist` passes.
2. `npm run verify:deploy` passes.
3. Vercel-shaped local smoke returns `/api/health` with `persistence=none` and `maxUploadBytes=4194304`.
4. Known fixture through `/api/analyze` reproduces 97 orders and 4,850,000 VND net sales.
5. Public copy says 4 MB and transient/no persistence; it must not claim the local 20 MB limit.

## Canonical deployment path

Direct MCP deployment is not considered reliable because the current connector runtime advertises `deploy_to_vercel` but returns `Tool deploy_to_vercel not found` when invoked.

Use the guarded Windows launcher from a clean clone of canonical `main`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-vercel.ps1
```

The launcher:

1. requires branch `main`;
2. requires a clean working tree;
3. fetches `origin/main` and refuses deployment if local HEAD differs;
4. runs `npm run test:dist` and `npm run verify:deploy`;
5. uses pinned Vercel CLI `59.20.0`;
6. attempts `vercel git connect` so future Git pushes can trigger Vercel deployments;
7. treats Vercel's explicit `already connected` response as a successful Git-integration state even if the CLI returns a non-zero exit code.

First-time CLI authentication may require Vercel OAuth device/browser authorization. On a brand-new Vercel project, the first CLI deployment can be assigned to production even without `--prod`; subsequent default CLI deployments are previews unless `--prod` is supplied.

## Verified live deployment

Fully verified on 2026-09-20:

- canonical URL: `https://cafeos-analyzer.vercel.app`
- Vercel project: `cafeos-analyzer`
- current production deployment: `dpl_DBRM2pVwmrsg7XUifnqFUcn8mk5e`
- Vercel state: `READY`
- Vercel target: `production`
- Git source: `ShenJun93/cafeos-analyzer` / `main`
- source commit: `7b32355174a419627f7ab6a98140c780bf8f4e86`
- GET `/`: 200
- GET `/analyzer`: 200
- GET `/api/health`: 200 with `mode=public-validation`, `persistence=none`, `maxUploadBytes=4194304`
- POST known fixture to `/api/analyze?filename=known-anomaly.csv`: 200 with 97 orders, 4,850,000 VND net sales, 97 valid items
- request larger than 4 MiB: 413
- runtime error clusters after live verification: none

The reproducible check is:

```bash
npm run verify:live
```

The deployment gate is closed. Future work should return to field-validation evidence unless a live defect is found.
