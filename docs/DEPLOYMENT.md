# Deployment profile — validation preview

## Purpose

Deploy only the existing validation wedge: landing page, sample report, transient CSV/XLSX analysis, compatibility profile and no-contact feedback. This is not a production SaaS authorization.

## Runtime split

- Local validation mode: up to 20 MB per CSV/XLSX file; no cloud persistence.
- Public Vercel preview: up to 4 MiB per request, deliberately below Vercel Functions' documented 4.5 MB request-payload limit.
- Large or sensitive files: use the local validation kit or split exports. Do not silently upload them to object storage.

## Privacy contract

The public preview may process raw transaction data transiently inside a function request. It must not write raw uploads to a database, object store, telemetry payload or log. Public pages disclose this behavior before upload.

Compatibility profile remains the preferred shareable evidence because it contains schema/header/count metadata without transaction row values. Pseudonymized validation packs remain available for deeper reproduction.

## Deployment artifact

`public/` contains static pages. `api/` contains raw-body Vercel-shaped functions importing committed `dist/` output. `vercel.json` routes the static validation surface and uses `npm run verify:deploy` as the build gate.

The validation preview intentionally deploys committed compiled output. `dist/.source-fingerprint.json` binds `dist/` to `src/**/*.ts` plus `tsconfig.json`; deployment verification fails if source changed without a local compile/stamp.

## Release gates

Before preview deployment:

1. `npm run test:dist` passes.
2. `npm run verify:deploy` passes.
3. Vercel-shaped local smoke returns `/api/health` with `persistence=none` and `maxUploadBytes=4194304`.
4. Known fixture through `/api/analyze` reproduces 97 orders and 4,850,000 VND net sales.
5. Public copy says 4 MB and transient/no persistence; it must not claim the local 20 MB limit.

## Current external blocker

The connected Vercel account is readable, but the exposed deployment action was unavailable in the current connector runtime and there is no authenticated Vercel CLI in this container. Therefore this repository is deploy-ready but no live URL is claimed.

## Post-deploy checks

- GET `/api/health`
- GET `/`
- GET `/analyzer`
- POST known fixture to `/api/analyze?filename=known-anomaly.csv`
- request >4 MiB must return 413
- inspect Vercel runtime errors/logs before sharing the preview
