# Contributing

CafeOS Analyzer is currently an early validation-stage project.

## Before opening a change

- Keep the v0.1 boundary narrow.
- Do not add POS replacement, payments, payroll, accounting, inventory ERP, or campaign delivery without an explicit product decision.
- Preserve deterministic metric semantics in `docs/METRICS.md`.
- Every business insight must expose scope, baseline, coverage, and evidence.
- Never commit real merchant data or customer PII.

## Verification

Run:

```bash
npm install
npm test
npm run verify:deploy
```

A change that breaks metric correctness, idempotency, tenant isolation, or synthetic-data guarantees is release-blocking.
