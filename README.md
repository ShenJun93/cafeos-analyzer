# CafeOS

**CafeOS is a full café operating ecosystem.**

This repository began as CafeOS Analyzer and now contains the Analyzer/data foundation, Control Tower contracts and the first implementation path for CafeOS Core Commerce.

CafeOS supports two operating modes:

- **CafeOS-native:** CafeOS POS/Core Commerce owns first-party menu, orders, payment records and daily close.
- **Integrated:** a merchant keeps an external POS and CafeOS ingests/reconciles it through Analyzer/connectors.

Canonical product mission: see \`MISSION.md\`.

## Current modules

### Analyzer — live validation/onboarding module

- CSV/XLSX ingestion;
- deterministic metrics;
- compatibility/mapping;
- reconciliation/data health;
- external POS bridge.

### Control Tower — implemented technical slice / evidence-gated product work

- tenant/store model;
- Daily Brief;
- Store Health;
- Attention;
- Action;
- Measurement;
- local E1 validation surface.

### Core Commerce — current implementation priority

Target v1 spine:

\`Menu → POS Order → Payment Record → Daily Close → Dashboard → Control Tower handoff\`

Core Commerce is a separate CafeOS module. POS functionality must not be added to Analyzer.

## Trust model

CafeOS follows these rules:

1. **Numbers are deterministic.** LLM output must not create or alter prices, totals, balances or business metrics.
2. **Evidence stays inspectable.**
3. **Missing data degrades capability explicitly.**
4. **Tenant isolation and RLS are release blockers.**
5. **Source provenance stays explicit across CafeOS-native and external systems.**

## Quick start

Requirements: Node.js 20+.

\`\`\`bash
npm install
npm run test:dist
\`\`\`

Analyzer fixture:

\`\`\`bash
node scripts/analyze-fixture.mjs fixtures/known-anomaly.csv
\`\`\`

## Live surface

Current production validation surface:

https://cafeos-analyzer.vercel.app

The public Analyzer processes CSV/XLSX transiently and does not persist uploads.

Core Commerce production writes are **not** enabled merely because the product direction changed; its staging/RLS/security gates must pass first.

## Distribution

CafeOS primary distribution must remain **pull/inbound**: product discovery, search/SEO, integrations, app/plugin directories and other user-initiated channels.

The primary business must not depend on cold outbound sales.

## Data and privacy

All committed fixtures are synthetic. Never commit real merchant exports, customer PII, credentials, validation registries or private operator records.

See:

- \`docs/PRIVACY.md\`
- \`SECURITY.md\`
- \`SYNTHETIC_DATA.md\`

## Product authority

Authority order:

1. \`MISSION.md\`
2. \`docs/PRODUCT_ARCHITECTURE.md\`
3. \`docs/ROADMAP.md\`
4. approved product/module specs
5. implementation docs/tests

## What is deferred from Core Commerce v1

The full ecosystem direction includes Inventory, Customers/Loyalty, Staff, Finance/Reconciliation, Operations and Integrations, but v1 does not claim completion of:

- payment acquiring/processor;
- refunds/split payments;
- inventory;
- loyalty execution;
- payroll;
- full accounting/ERP;
- KDS;
- e-invoice;
- delivery dispatch.

See the roadmap for sequencing.

## License

Source is publicly visible, but no open-source license has been granted yet. See \`LICENSE\`.
