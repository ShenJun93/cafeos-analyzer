# CafeOS Hallmark Hybrid UI/UX Design

**Status:** design proposal only — no product code changed yet.

## Intent

Redesign CafeOS frontend surfaces so they feel intentionally designed rather than generated, using Hallmark principles: structural variety, strong hierarchy, deliberate typography, reduced repetitive card-grid defaults, and a distinct visual fingerprint per brief.

The redesign must preserve all current business logic, validation semantics, auth boundaries, privacy constraints, E1/E2 evidence rules, API contracts, and production gates.

## Chosen direction

The approved direction combines all three visual strategies:

1. **Operational Editorial** — the primary system backbone.
2. **Glass Control Room** — the application/data workspace layer.
3. **Warm Café Intelligence** — the public brand/marketing layer.

These are not three themes randomly mixed on one screen. They map to different product contexts while sharing common design tokens.

## Product character

CafeOS should feel like:

- a serious operator tool, not a generic SaaS dashboard;
- analytically precise without looking sterile;
- connected to café operations without relying on coffee clichés;
- calm enough for repeated daily use;
- visibly trustworthy around data provenance, privacy, synthetic-data boundaries, and non-causal measurement.

## Global design system

### Foundation

Use **Operational Editorial** as the common grammar:

- asymmetric editorial grids instead of repeated equal cards;
- strong type hierarchy and large numeric moments;
- section labels, rules, whitespace, and grouped evidence blocks;
- fewer containers; use layout, spacing, typography, and separators before adding boxes;
- one dominant visual idea per screen;
- avoid hero → three cards → CTA → footer repetition.

### Brand palette

Primary palette should combine operational precision with warm café materiality:

- warm paper / oat background;
- near-black espresso text;
- muted clay / terracotta accent;
- restrained amber for attention/warnings;
- cool smoke / glass neutrals for Control Tower surfaces;
- green reserved for verified/pass/safe states;
- red reserved for real errors/destructive states.

No purple/pink AI gradients. No decorative rainbow gradients.

### Typography

Use a two-family hierarchy rather than Inter-only presentation:

- editorial/display face for major page titles and narrative moments;
- neutral sans for data, controls, tables, labels, and dense UI.

Fallbacks must remain system-safe and performance-conscious.

### Radius and elevation

- use tighter, purposeful radii;
- do not apply the same rounded card to every block;
- flat editorial sections by default;
- glass/elevation only where hierarchy or interaction needs it;
- avoid excessive floating panels.

### Motion

Use restrained motion:

- small opacity/translate transitions for state changes;
- no perpetual decorative animation;
- reduced-motion fallback required;
- data changes must remain readable without animation.

### Accessibility

- visible keyboard focus;
- minimum AA text contrast;
- form labels remain explicit;
- state must not depend on color alone;
- touch targets remain usable on mobile;
- no interaction hidden behind hover only.

## Surface architecture

### 1. Public landing — Warm Café Intelligence + Operational Editorial

**Current problem:** current page follows a familiar hero + three feature cards + explanatory sections rhythm.

**New macrostructure:**

- editorial masthead with compact CafeOS identity;
- oversized proposition split across an asymmetric two-column opening;
- warm material/texture block carrying the core trust statement;
- an operator-proof strip for deterministic metrics / privacy / no POS replacement;
- target-ICP section laid out as an editorial field note, not cards;
- file compatibility section shown as a compact operational checklist;
- privacy boundary as a dedicated trust panel;
- final CTA integrated into the page rhythm rather than a generic CTA card.

**Visual tone:** warm, tactile, restrained, confident.

**Do not add:** stock café photography, beans/cup illustrations, fake customer logos, fabricated metrics, testimonials, decorative dashboard screenshots.

### 2. Analyzer — Operational Editorial workspace

**Current problem:** report output is dominated by repeated equal cards, making metrics, health, insights, and workbook details feel equally important.

**New macrostructure:**

- slim top command bar with file state, compatibility profile, report/sample links;
- upload/intake zone as a single focused operational surface;
- after analysis, switch into a report layout:
  - primary metric band with Net Sales / Orders / AOV as editorial numerals;
  - secondary coverage metrics in a narrow evidence rail;
  - Data Health as a diagnostic strip;
  - Attention as the visual center of the report;
  - Workbook/source evidence collapsed into a lower technical section;
  - validation feedback/E1 opt-in treated as a research action, visually secondary to the report itself.

**Interaction behavior:**

- preserve current upload, sheet choice, mapping, analyze, profile, feedback logic;
- current status messages become clearer inline process states;
- warnings/errors should sit adjacent to the affected step;
- loading and completed states should not move unrelated layout unexpectedly.

**Visual tone:** precise, editorial, diagnostic.

### 3. Validation feedback — Warm research form

**Current problem:** long form reads like a plain admin form.

**New macrostructure:**

- narrow editorial intro with privacy statement;
- questions grouped by evidence stage:
  1. context;
  2. import/trust;
  3. insight;
  4. repeat/sync intent;
  5. value/WTP;
- visible step progression without turning it into a wizard that changes semantics;
- conditional fields remain exactly as today;
- download action presented as the conclusion of an evidence record;
- E1 opt-in becomes a distinct adjacent research invitation after the Analyzer evidence form.

**Visual tone:** warm, human, serious, research-oriented.

### 4. Control Tower E1 — Glass Control Room + Operational Editorial

**Current problem:** current E1 UI is functional but visually reads as a generic grid of cards.

**New macrostructure:**

- persistent synthetic-data warning integrated as a high-visibility system strip;
- command header for tenant/store/session controls;
- Daily Brief as the dominant first viewport;
- metric numerals on a translucent control surface;
- Attention and Unresolved Actions arranged as a working queue, not two generic cards;
- Store Health as a focused diagnostic section;
- Action detail becomes a side-panel / detail workspace pattern where feasible without changing routing;
- Measurement gets its own evidence module with strong non-causal language;
- status/resolution controls visually separated from measurement creation.

**Glass rules:**

- glass is functional, not decorative;
- only top-level control surfaces get translucency;
- avoid nested glass cards;
- blur must not reduce contrast;
- support fallback when backdrop-filter is unavailable.

**Visual tone:** calm, premium, control-room precision.

## Shared components / tokens

Create a lightweight shared frontend style system that can be consumed by current static HTML surfaces without introducing a framework migration.

Likely shared primitives:

- page shell;
- masthead / command bar;
- section label;
- editorial heading;
- metric display;
- evidence/meta row;
- trust/privacy panel;
- status strip;
- action button variants;
- form field group;
- queue row;
- diagnostic state;
- glass surface;
- synthetic-data banner.

Prefer shared CSS variables and small reusable classes over a component-framework rewrite.

## Structural anti-slop rules

The implementation should fail review if it introduces any of these:

- three equal feature cards immediately under a centered hero;
- all content inside rounded white cards;
- repeated 3-column grids as the main layout for every section;
- purple/pink gradients;
- centered body copy across most of the page;
- one font family used for every visual role;
- excessive pill badges;
- decorative glass everywhere;
- fake social proof;
- fake KPI growth numbers;
- icons used as decoration without information value;
- UI copy rewritten into generic AI/SaaS marketing language.

## Copy and semantics

Preserve current product claims and evidence boundaries.

Do not weaken or obscure:

- validation-build status;
- public preview file/privacy constraints;
- deterministic metric wording;
- target ICP 3–15 stores;
- synthetic Control Tower warning;
- "before/after measured change — not causal attribution";
- membership-derived tenant access;
- E1/E2 provenance separation;
- E1 opt-in public/privacy warning.

Copy may be visually regrouped, but semantic claims must not be expanded without evidence.

## Responsive behavior

### Mobile

- collapse editorial grids into a clear reading order;
- keep upload and report actions reachable without horizontal scroll;
- use stacked metric rhythm rather than miniature dashboard cards;
- E1 command controls stack with full-width inputs;
- Action detail remains readable as an inline lower section if side-panel layout cannot fit.

### Desktop

- use asymmetric grid widths to establish hierarchy;
- limit line length for narrative copy;
- data surfaces may use wider canvases than landing/feedback forms.

## Technical constraints

- keep current static HTML + CSS + vanilla JS architecture;
- no React/framework migration;
- no API changes;
- no auth changes;
- no DB changes;
- no Vercel function additions;
- no evidence-registry changes;
- no new analytics/PII collection;
- no new outbound acquisition workflow;
- existing tests remain authoritative;
- add frontend contract/a11y/style regression tests where practical.

## Surface order

Recommended implementation order:

1. shared design tokens/foundation;
2. public landing;
3. Analyzer;
4. feedback/E1 opt-in;
5. Control Tower E1;
6. responsive/accessibility polish;
7. Hallmark anti-slop self-review and production verification.

This order establishes the brand language before applying the denser control-room treatment.

## Non-goals

- redesigning backend workflows;
- changing CafeOS product scope;
- introducing a design framework;
- adding dashboard modules;
- adding charts merely for visual richness;
- adding customer/CRM/inventory/accounting/labor features;
- changing #11/#62 empirical gates.

## Success criteria

The redesign is successful if:

- each major surface has a visibly different macrostructure appropriate to its job;
- all surfaces still feel like the same CafeOS product;
- Analyzer report hierarchy clearly favors actionable evidence over metadata;
- Control Tower reads as an operational workspace rather than a card dashboard;
- public surfaces feel warmer and more approachable without looking decorative or consumer-brand heavy;
- existing behavior/tests remain unchanged;
- accessibility and responsive behavior improve or remain at least equivalent;
- Hallmark anti-pattern review finds no major structural-default violations.

## Approaches considered

### A — Operational Editorial only

Strongest for clarity and evidence hierarchy, but could make Control Tower feel too flat and public marketing too austere.

### B — Glass Control Room only

Strong for application polish, but would overfit the dashboard aesthetic and risk generic SaaS visual language.

### C — Warm Café Intelligence only

Strong for public brand warmth, but not disciplined enough for dense operational and measurement workflows.

### Chosen — A backbone + B application layer + C brand layer

This keeps one coherent identity while letting each context use the visual language that best serves its task.
