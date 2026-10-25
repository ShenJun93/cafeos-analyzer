# Agent operating rules

1. Repository files, tests, CI and current Git state are canonical authority.
2. Product-level decisions follow the authority hierarchy in \`MISSION.md\`; module PRDs may narrow implementation scope but must not silently redefine CafeOS.
3. **CafeOS is a full café operating ecosystem.** Core Commerce / CafeOS POS may own first-party execution; external POS integration remains a supported mode.
4. **CafeOS Analyzer is a module/acquisition/onboarding/reconciliation wedge, not the whole CafeOS product.**
5. Preserve deterministic metric semantics defined in \`docs/METRICS.md\`.
6. LLM output must never create or modify numeric business truth: prices, order totals, payment totals, balances, inventory or business metrics.
7. Every business insight must expose scope, baseline, coverage and evidence.
8. Identity resolution is deterministic only; no fuzzy person matching.
9. Tenant isolation, idempotent writes and metric correctness are release blockers.
10. Keep the **Analyzer** boundary narrow. Do not add POS, payments, loyalty, payroll, inventory or accounting to Analyzer. Those capabilities belong in explicit CafeOS modules.
11. Prefer integration over rebuilding when an external system is the lower-risk system of record, but do not prohibit first-party execution that is explicitly part of CafeOS Core Commerce or another approved module.
12. Preserve source provenance. Do not create fake import lineage to make CafeOS-native facts look like external imports.
13. Payment v1 is a settlement record/reconciliation capability, not a payment processor or acquiring claim.
14. A validation mechanism exists to reduce uncertainty; it must not become the product by default.
15. New modules must state the user job, source evidence, system-of-record boundary, action owner and measurable outcome before implementation.
16. Primary business distribution must remain **pull/inbound**; do not make CafeOS depend on cold outbound sales.
17. Do not promote merchant commerce writes to production until staging migration, RLS/role isolation, advisors and synthetic E2E gates pass.
