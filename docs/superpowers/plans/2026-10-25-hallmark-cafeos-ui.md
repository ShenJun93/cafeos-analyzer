# Hallmark Hybrid CafeOS UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Redesign the four core CafeOS frontend surfaces using the approved Hallmark hybrid system while preserving all existing product, privacy, auth, evidence and API behavior.

**Architecture:** Keep the existing static HTML + vanilla JS application. Add one shared stylesheet at \`public/cafeos-ui.css\` containing global tokens, common primitives and surface-scoped layout rules; public pages reference it directly and the local Control Tower preview server serves the same file. Each page receives a distinct macrostructure while all behavior scripts and backend contracts remain unchanged.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node.js test runner, existing Vercel/static hosting.

**Spec:** \`docs/superpowers/specs/2026-10-25-hallmark-cafeos-ui-design.md\`

## Global Constraints

- Preserve all current API, auth, privacy, E1/E2 provenance and evidence semantics.
- Keep static HTML + CSS + vanilla JS; no framework migration.
- Add no Vercel function, database change, analytics sink, PII collection or outbound workflow.
- Preserve the exact synthetic-data warning and the exact phrase \`before/after measured change — not causal attribution\`.
- Preserve public Analyzer 4 MB disclosure, transient-processing disclosure, compatibility-profile flow and validation feedback flow.
- Preserve target ICP wording: owner/operator 3–15 café locations.
- Preserve the E1 opt-in privacy/public-warning semantics and CTA target.
- No purple/pink AI gradients, fake KPI growth, fake social proof, decorative dashboards or stock café imagery.
- Responsive layout must avoid horizontal scrolling at 320 CSS px.
- Interactive controls must retain visible labels, keyboard focus and usable touch targets.
- Existing \`npm run test:dist\` remains the release gate.

## Review Focus

1. Shared CSS missing from local E1 server — \`/control-tower-e1\` must load the same \`/cafeos-ui.css\` successfully.
2. Visual refactor accidentally changing inline behavior scripts — tests must pin behavioral script equality where semantics must remain unchanged.
3. Hallmark redesign drifting back to repeated equal-card grids — structural contract tests must require distinct macrostructure markers per surface.
4. Mobile regression from asymmetric desktop grids — CSS must include explicit small-screen fallbacks and no fixed-width content primitives.
5. Accessibility regression from visual polish — shared CSS must include \`:focus-visible\`, \`prefers-reduced-motion\`, sufficient state differentiation and minimum control sizing.

---

### Task 1: Shared Hallmark design foundation

**Files:**
- Create: \`public/cafeos-ui.css\`
- Modify: \`scripts/serve-vercel-preview.mjs\`
- Modify: \`scripts/verify-deploy.mjs\`
- Create: \`tests/hallmark-ui-contract.test.mjs\`
- Modify: \`package.json\`

**Interfaces:**
- Consumes: existing static page routes from \`scripts/serve-vercel-preview.mjs\`.
- Produces: \`/cafeos-ui.css\` shared stylesheet available in both Vercel public hosting and local E1 preview.

- [ ] **Step 1: Write failing shared-foundation tests**

Add tests asserting:

- \`public/cafeos-ui.css\` exists;
- CSS defines named tokens for paper, espresso, clay, amber, smoke, verified and danger roles;
- CSS defines two-family typography variables;
- CSS contains \`:focus-visible\`;
- CSS contains \`@media (prefers-reduced-motion: reduce)\`;
- CSS contains mobile breakpoint rules;
- local preview GET \`/cafeos-ui.css\` returns 200 with \`text/css\`;
- \`scripts/verify-deploy.mjs\` requires \`public/cafeos-ui.css\`;
- \`package.json\` runs \`tests/hallmark-ui-contract.test.mjs\` in both \`test\` and \`test:dist\`.

- [ ] **Step 2: Run the new test and verify RED**

Run:

\`node --test tests/hallmark-ui-contract.test.mjs\`

Expected: FAIL because the stylesheet and local static route do not exist.

- [ ] **Step 3: Implement the shared foundation**

Create \`public/cafeos-ui.css\` with:

- common token variables;
- editorial/display + neutral/system font stacks;
- shared shell, masthead, command bar, buttons, section labels, metric display, evidence rows, trust panels, form controls, status strips, queue rows, glass surfaces and synthetic banner primitives;
- responsive fallbacks;
- reduced-motion behavior;
- focus-visible states;
- no external font dependency required for correctness.

Update \`scripts/serve-vercel-preview.mjs\`:

- add \`/cafeos-ui.css\` to the static map from \`public/cafeos-ui.css\`;
- add \`.css: text/css; charset=utf-8\` to content types;
- do not alter API routes.

Update \`scripts/verify-deploy.mjs\` to require \`public/cafeos-ui.css\`.

Update \`package.json\` to include the new contract test in both test gates.

- [ ] **Step 4: Run focused tests**

Run:

\`node --test tests/hallmark-ui-contract.test.mjs tests/control-tower-e1-ui.test.mjs\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add public/cafeos-ui.css scripts/serve-vercel-preview.mjs scripts/verify-deploy.mjs tests/hallmark-ui-contract.test.mjs package.json
git commit -m "feat: add Hallmark CafeOS UI foundation"
\`\`\`

### Task 2: Landing page — Warm Café Intelligence + Operational Editorial

**Files:**
- Modify: \`public/index.html\`
- Modify: \`tests/hallmark-ui-contract.test.mjs\`

**Interfaces:**
- Consumes: common primitives from \`/cafeos-ui.css\`.
- Produces: landing-specific structural markers \`landing-shell\`, \`landing-masthead\`, \`landing-hero\`, \`operator-proof\`, \`field-note\`, \`compatibility-checklist\`, \`privacy-boundary\`.

- [ ] **Step 1: Write failing landing structure tests**

Assert:

- stylesheet link to \`/cafeos-ui.css\`;
- canonical URL and existing meta description remain;
- existing CTA hrefs remain;
- exact target ICP 3–15 copy remains;
- privacy/transient-processing disclosure remains;
- new structural markers listed above exist;
- legacy equal-card feature grid pattern is absent from the opening section;
- no forbidden \`purple\`, fake testimonial, fake logo or fabricated-growth copy is introduced.

- [ ] **Step 2: Run focused test and verify RED**

Run:

\`node --test tests/hallmark-ui-contract.test.mjs tests/indexability.test.mjs\`

Expected: landing structure assertions FAIL; canonical/indexability assertions remain PASS.

- [ ] **Step 3: Restructure \`public/index.html\`**

Implement:

- compact masthead;
- asymmetric hero split;
- warm trust/material block;
- operator-proof strip;
- target ICP as editorial field note;
- file compatibility checklist;
- dedicated privacy boundary;
- integrated final CTA.

Keep existing claims semantically unchanged.

- [ ] **Step 4: Run focused tests**

Run:

\`node --test tests/hallmark-ui-contract.test.mjs tests/indexability.test.mjs\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add public/index.html tests/hallmark-ui-contract.test.mjs
git commit -m "feat: redesign CafeOS landing with Hallmark editorial system"
\`\`\`

### Task 3: Analyzer — Operational Editorial workspace

**Files:**
- Modify: \`public/analyzer.html\`
- Modify: \`tests/hallmark-ui-contract.test.mjs\`

**Interfaces:**
- Consumes: current Analyzer DOM IDs and inline script contract.
- Produces: layout markers \`analyzer-shell\`, \`analyzer-commandbar\`, \`intake-stage\`, \`metric-band\`, \`evidence-rail\`, \`diagnostic-strip\`, \`attention-stage\`, \`technical-evidence\`, \`research-action\`.

- [ ] **Step 1: Write failing Analyzer structure/behavior-preservation tests**

Capture the current inline behavior script before restructuring and assert after redesign:

- all existing element IDs referenced by the script still exist;
- upload accepts \`.csv,.xlsx\`;
- 4 MB disclosure remains;
- compatibility-profile CTA remains;
- sample-report link remains;
- feedback link remains;
- new structure markers exist;
- metric band separates Net Sales / Orders / AOV from coverage;
- Attention has a dedicated stage;
- workbook/source evidence has a technical section;
- behavior script body remains byte-identical unless a DOM-class-only adaptation is unavoidable.

- [ ] **Step 2: Run focused test and verify RED**

Run:

\`node --test tests/hallmark-ui-contract.test.mjs\`

Expected: new Analyzer structure assertions FAIL.

- [ ] **Step 3: Restructure Analyzer markup only**

Implement the approved macrostructure around the existing IDs and script:

- command bar;
- focused intake stage;
- report header;
- primary metric band;
- secondary evidence rail;
- diagnostic Data Health strip;
- dominant Attention stage;
- technical workbook section;
- subdued research/validation action.

Do not change fetch paths, mapping logic, rendering calculations or feedback attribution logic.

- [ ] **Step 4: Run Analyzer and deploy-contract tests**

Run:

\`node --test tests/hallmark-ui-contract.test.mjs tests/indexability.test.mjs\`

Then:

\`node scripts/verify-deploy.mjs\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add public/analyzer.html tests/hallmark-ui-contract.test.mjs
git commit -m "feat: redesign Analyzer as editorial operations workspace"
\`\`\`

### Task 4: Validation feedback — Warm research form

**Files:**
- Modify: \`public/feedback.html\`
- Modify: \`web/feedback.html\`
- Modify: \`tests/feedback-contract.test.mjs\`
- Modify: \`tests/hallmark-ui-contract.test.mjs\`

**Interfaces:**
- Consumes: exact existing feedback form IDs and identical inline behavior script requirement.
- Produces: grouped research structure \`feedback-shell\`, \`privacy-intro\`, \`evidence-stage\`, \`evidence-stage-context\`, \`evidence-stage-trust\`, \`evidence-stage-insight\`, \`evidence-stage-intent\`, \`evidence-stage-value\`, \`e1-research-invite\`.

- [ ] **Step 1: Write failing grouped-form tests**

Assert for both public and local pages:

- stylesheet link exists;
- inline scripts remain identical across public/local;
- public page retains \`noindex,nofollow\`, local page does not;
- all existing IDs remain;
- conditional \`.hidden\` rows remain;
- E1 CTA remains after \`</form>\`;
- privacy warning remains;
- new evidence-stage wrappers exist;
- stages are semantic \`section\` or \`fieldset\` groups with visible headings;
- form remains a single-page progressive form, not a wizard.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

\`node --test tests/feedback-contract.test.mjs tests/hallmark-ui-contract.test.mjs\`

Expected: stage-structure assertions FAIL; old semantics PASS.

- [ ] **Step 3: Restructure public and local feedback markup**

Apply the same markup structure to both pages while preserving the exact inline script.

Use:

- editorial privacy intro;
- five evidence-stage groups;
- clear progression markers;
- conclusion/download area;
- E1 research invitation after the form.

Do not alter record generation, dependency gating, WTP logic or attribution normalization.

- [ ] **Step 4: Run focused tests**

Run:

\`node --test tests/feedback-contract.test.mjs tests/hallmark-ui-contract.test.mjs\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add public/feedback.html web/feedback.html tests/feedback-contract.test.mjs tests/hallmark-ui-contract.test.mjs
git commit -m "feat: redesign validation feedback as warm research flow"
\`\`\`

### Task 5: Control Tower E1 — Glass Control Room

**Files:**
- Modify: \`web/control-tower-e1.html\`
- Modify: \`tests/control-tower-e1-ui.test.mjs\`
- Modify: \`tests/hallmark-ui-contract.test.mjs\`

**Interfaces:**
- Consumes: current E1 DOM IDs, auth/session flow and existing app endpoints.
- Produces: structure markers \`control-shell\`, \`synthetic-system-strip\`, \`control-commandbar\`, \`brief-stage\`, \`control-metrics\`, \`queue-board\`, \`store-diagnostic\`, \`action-workspace\`, \`measurement-evidence\`.

- [ ] **Step 1: Write failing E1 visual-structure preservation tests**

Assert:

- exact synthetic warning remains;
- \`operator_synthetic_assisted\` remains;
- memory-only auth remains and storage APIs remain absent;
- all existing app endpoints remain referenced;
- exact non-causal phrase remains;
- stylesheet link exists;
- new control-room structural markers exist;
- top-level glass surfaces are bounded in number;
- no nested generic \`.card .card\` layout pattern is required;
- tenant/store controls remain labels with associated controls;
- action status and measurement creation remain visually separate sections.

- [ ] **Step 2: Run E1 tests and verify RED**

Run:

\`node --test tests/control-tower-e1-ui.test.mjs tests/hallmark-ui-contract.test.mjs\`

Expected: new structural assertions FAIL; existing security/behavior assertions PASS.

- [ ] **Step 3: Restructure E1 markup and rendering templates**

Implement:

- persistent synthetic system strip;
- compact command bar;
- dominant Daily Brief stage;
- glass metric surface;
- queue-board composition for Attention + unresolved Actions;
- focused Store Health diagnostic;
- action workspace;
- dedicated Measurement evidence module;
- separate status-resolution and measurement-create controls.

Keep all current JavaScript behavior and endpoints. If rendering template class names need changes, only alter presentation classes; do not alter payloads, fetch paths, auth handling or state transitions.

- [ ] **Step 4: Run E1 and local-server tests**

Run:

\`node --test tests/control-tower-e1-ui.test.mjs tests/hallmark-ui-contract.test.mjs\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add web/control-tower-e1.html tests/control-tower-e1-ui.test.mjs tests/hallmark-ui-contract.test.mjs
git commit -m "feat: redesign Control Tower E1 as glass operations workspace"
\`\`\`

### Task 6: Responsive, accessibility and Hallmark anti-slop gate

**Files:**
- Modify: \`public/cafeos-ui.css\`
- Modify: \`tests/hallmark-ui-contract.test.mjs\`

**Interfaces:**
- Consumes: all four redesigned surfaces.
- Produces: final static contract proving responsive/accessibility/Hallmark constraints.

- [ ] **Step 1: Add failing anti-slop and accessibility tests**

Assert:

- every redesigned page has one shared stylesheet link;
- CSS includes mobile behavior at or below 720 px;
- controls have minimum 44 px target sizing or equivalent padding/line-height;
- focus-visible rules are present;
- reduced-motion rules are present;
- no page contains purple/pink gradient declarations;
- landing does not contain a three-equal-card opening structure;
- Analyzer and E1 do not use the same primary macrostructure marker set;
- feedback retains labels for every select/input;
- no new external tracking/analytics script is present.

- [ ] **Step 2: Run the new checks and verify RED where needed**

Run:

\`node --test tests/hallmark-ui-contract.test.mjs\`

Expected: any missing responsive/a11y guard fails.

- [ ] **Step 3: Fix only the surfaced responsive/a11y gaps**

Adjust shared CSS and surface-scoped CSS rules. Do not alter business behavior.

- [ ] **Step 4: Run complete test gate**

Run:

\`npm run test:dist\`

Expected: all tests PASS; deploy artifact verification includes \`public/cafeos-ui.css\`.

- [ ] **Step 5: Commit**

\`\`\`bash
git add public/cafeos-ui.css tests/hallmark-ui-contract.test.mjs
git commit -m "test: lock Hallmark responsive and accessibility gates"
\`\`\`

### Task 7: Final review, PR and production-safe handoff

**Files:**
- No planned product changes unless review finds a verified defect.
- Review: all changed files from Tasks 1–6.

**Interfaces:**
- Consumes: exact completed branch and CI evidence.
- Produces: reviewable PR; production deployment remains separate/manual because Git auto-deploy is disabled.

- [ ] **Step 1: Run full local/CI-equivalent verification**

Run:

\`npm run test:dist\`

Expected: PASS.

- [ ] **Step 2: Review changed-file scope**

Require changes limited to:

- shared stylesheet;
- four approved frontend surfaces;
- local static CSS serving;
- deploy artifact guard;
- frontend tests;
- package test wiring;
- design/plan docs.

Reject accidental API, DB, auth, evidence-registry or Vercel-function changes.

- [ ] **Step 3: Hallmark self-review**

Check manually against the spec:

- distinct macrostructure per surface;
- no repeated generic card-grid default;
- glass only in Control Tower top-level surfaces;
- warm brand treatment only where appropriate;
- copy/evidence boundaries unchanged;
- no fabricated proof or KPI claims.

- [ ] **Step 4: Open PR and require CI green**

PR title:

\`feat: redesign CafeOS frontend with Hallmark hybrid system\`

Do not merge until exact-head CI passes.

- [ ] **Step 5: Post-merge production process**

Because \`vercel.json\` has \`git.deploymentEnabled=false\`, do not assume production updated automatically.

After merge:

1. fresh-check exact \`origin/main\`;
2. use a clean exact-main worktree;
3. run \`npm run test:dist\`;
4. perform one manual production deployment;
5. run \`npm run verify:live -- https://cafeos-analyzer.vercel.app\`;
6. verify \`/feedback\` still exposes the E1 opt-in CTA;
7. verify the four redesigned pages load \`/cafeos-ui.css\`;
8. do not retry deployment automatically on failure.
