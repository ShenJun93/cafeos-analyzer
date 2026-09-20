# Agent operating rules

1. Repository files, tests, CI and current Git state are canonical authority.
2. Product-level decisions must follow the authority hierarchy in `MISSION.md`; module PRDs may narrow implementation scope but must not silently redefine the CafeOS mission.
3. **CafeOS Analyzer is a module/acquisition/onboarding/data-validation wedge, not the whole CafeOS product.**
4. Preserve deterministic metric semantics defined in `docs/METRICS.md`.
5. LLM output must never create or modify numeric business metrics.
6. Every business insight must expose scope, baseline, coverage and evidence.
7. Identity resolution is deterministic only; no fuzzy person matching.
8. Tenant isolation, idempotent import and metric correctness are release blockers.
9. Keep the **Analyzer v0.1** boundary narrow. Do not add POS, payments, CRM delivery, payroll, inventory or accounting *to Analyzer* without an explicit product decision. This constraint does not prohibit separate CafeOS modules defined by `MISSION.md`, `docs/PRODUCT_ARCHITECTURE.md` and `docs/ROADMAP.md`.
10. Prefer integration over rebuilding commodity POS/payment/inventory/accounting execution.
11. A validation mechanism exists to test the mission; it must not become the mission by default.
12. New modules must state the user job, source evidence, system-of-record boundary, action owner and measurable outcome before implementation.
13. Primary business distribution must remain pull/inbound; do not make CafeOS depend on cold outbound sales.
