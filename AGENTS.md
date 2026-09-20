# Agent operating rules

1. Repository files, tests, CI and current Git state are canonical authority.
2. Preserve deterministic metric semantics defined in `docs/METRICS.md`.
3. LLM output must never create or modify numeric business metrics.
4. Every business insight must expose scope, baseline, coverage and evidence.
5. Identity resolution is deterministic only; no fuzzy person matching.
6. Tenant isolation, idempotent import and metric correctness are release blockers.
7. Keep the v0.1 boundary narrow. Do not add POS, payments, CRM delivery, payroll, inventory or accounting without an explicit product decision.
