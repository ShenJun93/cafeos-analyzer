# CafeOS Analyzer

Privacy-first sales intelligence for multi-location cafés.

CafeOS Analyzer turns POS CSV/XLSX exports into deterministic revenue, order, customer-coverage, store and daypart insights without replacing the merchant's POS. Numeric business metrics are computed by deterministic code; AI, when added, is an explanation layer only.

## Current scope

- CSV and bounded XLSX ingestion
- Vietnamese export-header mapping with explicit manual fallback
- POS-independent canonical transaction model
- deterministic revenue, order, AOV and customer-identification metrics
- store/daypart anomaly detection with visible baselines and evidence
- split/overlapping export handling without double counting
- privacy-preserving compatibility profiles and pseudonymized validation packs
- Postgres/Supabase tenant and RLS persistence contract
- local Windows field-validation kit

Not included in v0.1: POS replacement, payments, loyalty execution, payroll, accounting, delivery fleet or autonomous campaign sending.

## Quick start

Requirements: Node.js 20+.

```bash
npm install
npm run test:dist
node scripts/analyze-fixture.mjs fixtures/known-anomaly.csv
```

Analyze one export:

```bash
npm run build
node scripts/analyze-file.mjs path/to/export.xlsx --out report.html
```

Analyze split/overlapping exports:

```bash
npm run analyze:batch -- part-1.csv part-2.csv
```

## Trust model

CafeOS follows three rules:

1. **Numbers are deterministic.** LLM output must not create or alter business metrics.
2. **Insights show evidence.** Scope, comparison baseline, coverage and supporting rows must be inspectable.
3. **Missing data degrades capability explicitly.** The system should say what it cannot know rather than fabricate precision.

See `AGENTS.md`, `docs/METRICS.md`, `docs/DATA_CONTRACT.md`, `docs/INSIGHTS.md` and `docs/PRIVACY.md`.

## Help validate POS compatibility

Real export shapes are valuable evidence, but **do not upload raw merchant CSV/XLSX files to GitHub**.

Generate a schema-only compatibility profile locally:

```bash
npm run validation:profile -- path/to/export.xlsx > compatibility-profile.json
```

Review the JSON, then open the **POS compatibility report** issue form and share only schema/header/count metadata. See `docs/PUBLIC_VALIDATION.md` for the public/private boundary.

Compatibility reports improve import coverage. They do not count as repeat-use or willingness-to-pay evidence by themselves.

## Deploy validation preview

From a clean clone of canonical `main` on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-vercel.ps1
```

The launcher refuses to deploy a dirty tree or a local `main` that differs from `origin/main`, runs `npm run test:dist` and `npm run verify:deploy`, then deploys with pinned Vercel CLI and attempts to connect the project to the canonical GitHub remote for future Git-triggered deployments.

First-time Vercel authentication may require the OAuth device/browser flow. Production deployment is explicit:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-vercel.ps1 -Production
```

See `docs/DEPLOYMENT.md`.

## Data and privacy

All files committed under `fixtures/` are synthetic test data. They are not merchant exports and contain no real customer identifiers. See `SYNTHETIC_DATA.md`.

Never commit real merchant exports, customer PII, HMAC keys, credentials, validation registries, willingness-to-pay notes or private operator records to this repository.

## Project status

This repository is the canonical public authority for CafeOS Analyzer code, tests and technical product decisions. Current validation stage: technical vertical slice; real-merchant repeat-use and willingness-to-pay remain field-validation questions.

## Security

See `SECURITY.md`. Please do not open a public issue containing real merchant data or credentials.

## Contributing

See `CONTRIBUTING.md`.

## License

Source is publicly visible, but no open-source license has been granted yet. See `LICENSE`. Public visibility does not grant permission to copy, redistribute, sublicense or commercially deploy the code beyond rights provided by GitHub's platform terms.

## Disclaimer

CafeOS Analyzer is not affiliated with or endorsed by KiotViet, CUKCUK, POS365, Sapo, iPOS, Starbucks, Highlands Coffee, Trung Nguyên, Phê La or Phúc Long. Vendor-named fixtures are synthetic compatibility fixtures based on publicly documented field vocabulary, not captured merchant exports.