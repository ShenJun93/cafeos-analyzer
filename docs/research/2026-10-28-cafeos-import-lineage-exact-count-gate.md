# CafeOS Phase 1.1 — Exact-count bounded lineage read gate

**Status:** DRAFT development only, stacked on PR #81 → #80 → #79 → #78 → #77 → #76 → #75 → #74. No staging/production mutation, SQL migration, API addition or cross-source matching.

## Correctness finding

The prior `GET /api/app/commerce-import-lineage` requested `limit=501` and rejected arrays longer than 500. A configured PostgREST `db-max-rows` smaller than 501 could return only a prefix, causing a result with <=500 rows to appear complete even if additional rows existed.

PostgREST documents pagination via `Content-Range` and `Prefer: count=exact`: https://postgrest.org/en/stable/references/api/pagination_count.html. Exact counts can be expensive on large tables, so this is limited to an explicit authenticated Manager/Store/day diagnostic; not a scalable aggregate.

## New request and response contract

- Execute the same authenticated JWT/RLS-filtered GET on `transaction_line_items`, selected columns only, Store-local business day, `limit=501`, `Prefer: count=exact`.
- Generic `supabaseJson` returns its prior JSON payload by default. Only this caller requests optional `includeResponseMeta`, which exposes the HTTP status and exact `content-range` header alongside parsed data.
- Accept a nonempty result only if `Content-Range` has canonical `0-(N-1)/N`, with *safe integer* N matching JSON row length and N <= 500. Accept zero only as `*/0` with an empty array.
- Reject any total >500 as `422 IMPORT_LINEAGE_LIMIT`, even if the payload is a shorter prefix. Reject missing/malformed/unknown total (`*/ *` semantics), offset, mismatched length or clipped subset as `502 SUPABASE_UPSTREAM`. Never publish a partial namespace count.
- The API additionally exposes `completeness.exactResponseVerified=true` and `exactMatchedLineItemCount`; `sourceBoundary.sourceAccountProvenance=not_verified`. This verifies only the RLS-filtered, currently returned row-set. It does **not** certify Store's business activity, account provenance, vendor invoice stability, import coverage, payment reconciliation or source deduplication.
- Maintain manager-only role checks, active Store/timezone checks and strict Tenant/Store/date validation.

## Synthetic acceptance matrix

- 0 rows with `*/0`, 3 rows `0-2/3`, and 500 rows `0-499/500` pass exact page validation.
- 3 returned with `0-2/501` or `0-2/100000` returns 422, never 3 observed rows.
- 3 returned with missing, `0-2/*`, an offset, wrong end or 2/3 rows returns 502 with no `namespaces` field.
- A genuinely complete 100-row page passes even when below max 500.
- Existing identity-collision tests must send the exact-count header and still prove no raw transaction ID is returned and no POS/import revenues are combined.

## Deferred release gates

The production-scale solution remains an independently reviewed RLS-safe SQL aggregate, requiring an authorized migration and real staging tests. Upstream HTTP behavior is still unverified in a signed-JWT staging environment. Independent backup/restore, off-host age recovery, staging migration ledger and security review remain NO-GO. No offline POS claim.

**Acceptance scope:** CI Node synthetic only until explicit separate Windows and signed-JWT staging evidence. Keep all stacked PRs DRAFT; do not merge or deploy.
