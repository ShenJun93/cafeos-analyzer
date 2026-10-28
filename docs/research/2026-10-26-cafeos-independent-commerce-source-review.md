# CafeOS Commerce RPC — secondary AI source security review

Checkpoint: 2026-10-26. Source HEAD 305ffea53caa029a306da0d6b775916418219bd2, branch feat/cafeos-core-commerce-v1, PR #74 Draft. Performed via a distinct Codex CLI 0.149.1 read-only ephemeral session on a clean working tree. No staging credentials, live data, write operations or deployments were supplied to the reviewer.

## Scope and independent review result

The reviewer inspected tracked SQL under supabase/migrations, the existing supabase/tests/database Commerce suite, helpers private.has_tenant_role / private.has_tenant_access and related code. It examined authorization, cross-tenant references, permissions, order/payment idempotency, financial state consistency, and both pending Commerce integrity guards.

**Result: NO NEW VERIFIED SOURCE-LEVEL SECURITY FINDINGS IN SCOPE.** This is evidence from a second AI reviewer, not a penetration test or an approved security sign-off.

Supported observations:
- Three public Commerce SECURITY DEFINER RPCs check auth.uid() and private.has_tenant_role on the target tenant before business mutations (supabase/migrations/20261025094352_core_commerce_v1.sql:293,581,826).
- Tenant-scoped composite foreign keys bind order, line, payment and close records to the intended tenant (same migration:83,121,152,186).
- Authenticated clients have no direct write grants on order/payment/close tables; anonymous/PUBLIC function EXECUTE is revoked (same migration:213,576,699,986).
- Order idempotency key is guarded by advisory transaction lock and unique constraint (same migration:92,375).
- Payment capture locks the order row, compares remaining balance, and requires captured payment uniqueness (same migration:163,625,642).
- Create order and close day serialize over tenant/store/business-date advisory locks (same migration:399,874).
- Pending future-close and price snapshot guards remain source migrations only. Their staged/non-staged distinction is documented separately.

## Remaining unverified operational hypotheses

1. Existing SQL tests are sequential, not a genuine parallel-session race test. No independent live proof for concurrent duplicate orders, simultaneous captures or create/close interleavings.
2. No real staging authenticated JWT E2E for valid merchant role, cashier, viewer, cross-tenant and anonymous calls. Static SQL and simulated request.jwt.claim.sub are not equivalent to signed access-token behavior.
3. Three intentional authenticated SECURITY DEFINER RPCs still trigger Supabase advisor warnings; the reviewer did not authorize a policy exception. Privileged owner/security review remains required.
4. Existing staging still lacks the two data-integrity guard migrations; do not infer CI source behavior is present in staging.
5. Backup/network/TLS/off-host recovery blockers remain independent NO-GO criteria.

## Decision

No security fixes are justified from this bounded source review alone. Do NOT reopen synthetic-test proliferation. Reserve the next security effort for actual authenticated staging JWT E2E (using explicitly authorized isolated fixtures) and controlled concurrency tests after operational backup gates are satisfied. This report does not authorize staging mutation, history reconciliation, merge or production release. PR stays DRAFT / NO-GO.
