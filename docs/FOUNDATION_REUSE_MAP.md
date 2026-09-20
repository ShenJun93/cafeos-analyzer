# Analyzer → CafeOS Foundation Reuse Map

## Purpose

Prevent two opposite mistakes:

1. throwing away useful Analyzer engineering during product realignment;
2. mistaking Analyzer-specific UX/distribution work for the CafeOS core.

## Reuse as CafeOS foundation

### Data ingestion / compatibility

Keep and evolve:

- CSV parser
- bounded XLSX parser
- workbook inspection
- Vietnamese/vendor header mapping
- manual mapping validation
- multi-file overlap/idempotency logic
- source fingerprinting
- compatibility profiles

Role: fallback onboarding, connector validation and import safety.

### Canonical semantics

Keep as authority unless explicitly superseded:

- transaction/order semantics
- line-item normalization
- store/product fields
- customer identifier coverage
- refund/discount optional fields
- deterministic metric definitions

### Deterministic intelligence

Keep:

- metric engine
- data-health checks
- baseline rules
- store/daypart anomaly decomposition
- evidence pointers
- capability degradation when data is missing

### Privacy / tenancy

Keep and promote:

- tenant-boundary rules
- deterministic identity only
- RLS contract
- pseudonymization tooling
- consent as a separate concept
- raw merchant data exclusion from public repo

## Adapt for Control Tower

### Persistence

Current database contract is useful but not sufficient as a live exercised product path.

Need:

- actual authenticated tenant lifecycle;
- migrations exercised in CI/staging;
- MetricSnapshot;
- AttentionItem / Decision / Action / history;
- secure production persistence;
- deletion/retention operations;
- audit/evidence lineage.

### API surface

Current Vercel raw-body APIs are validation-oriented.

Need separate authenticated application APIs for:

- tenant/store state;
- brief retrieval;
- attention queue;
- customer views;
- action lifecycle;
- measurement results.

Do not overload public Analyzer endpoints into authenticated product APIs.

### Identity

Current deterministic identifiers remain correct.

Need later:

- multi-source identifier provenance;
- verified identifier lifecycle;
- consent purpose/channel state;
- merge/split audit events where deterministic evidence supports them.

## Analyzer-only / wedge-specific

Do not mistake these for core product architecture:

- public upload page;
- SEO landing pages;
- robots/sitemap work;
- compatibility GitHub issue flow;
- no-contact feedback downloader;
- Windows field kit UX;
- public 4 MiB transient-upload constraint.

They may remain useful, but should not dictate Control Tower architecture.

## Candidate code-domain split

As the product grows, move toward boundaries similar to:

- `core/data` — canonical types, normalization, identity, lineage
- `core/metrics` — deterministic metrics/baselines
- `core/insights` — evidence-backed detectors
- `modules/analyzer` — file analysis wedge
- `modules/control-tower` — brief/store/customer/action workflows
- `connectors/*` — vendor/source adapters
- `platform/persistence` — tenancy/auth/storage
- `platform/audit` — action/evidence history

Do not perform a large mechanical refactor until the first Control Tower slice requires these boundaries.
