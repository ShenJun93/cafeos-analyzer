# CafeOS — Disposable Two-Session Provenance Race and Worker Least Privilege v1

**Status:** DRAFT TEST EXPERIMENT ONLY · 2026-10-28 · **NOT** a Supabase migration, staging attestation, or production authorization.

## Observed baseline

PR #88 implemented a candidate append-only PostgreSQL trigger running within a disposable PostgreSQL 17 GitHub CI service and a rollback-only fixture. It verified sequential revision gaps, event history immutability and sticky revocation; it **did not** demonstrate concurrent writers, least-privilege worker appends or real external account ownership.

## Bounded technical change

The candidate function `tests/security/fixtures/provenance-append-only-candidate-v1.sql` now acquires a PostgreSQL **transaction-scoped advisory lock** keyed by the source binding UUID before checking the parent binding and most recent event. This serializes concurrent inserts of the same binding without requiring the inserting worker to hold `UPDATE`/row-lock privilege on the protected parent binding. The key is the 64-bit extended text hash of UUID; hash collision can over-serialize unrelated bindings, not bypass the key's own revision checks. All statements and table references remain schema-qualified with `SECURITY INVOKER` and pinned `search_path=pg_catalog`.

The new `tests/security/fixtures/provenance-concurrency-setup-v1.sql` builds an entirely synthetic two-Tenant database fixture in `cafeos_provenance_preflight`. Synthetic `cafeos_concurrency_worker` is `NOLOGIN`, not a superuser, not `BYPASSRLS` and not a database owner. It receives only:
- `USAGE` on the isolated test private schema;
- `SELECT` on synthetic bindings and events;
- `INSERT` on synthetic events;
- tenant-scoped `SELECT` and `WITH CHECK` RLS policies for Tenant A only.

It does not receive binding insert/update, event update/delete/truncate, role creation or schema ownership. There is no HTTP token, service-role secret, connector, account HMAC key or real merchant information.

`scripts/run-provenance-disposable-concurrency.sh` creates this fixture only after checking localhost, DB name, port and database user. It starts two independent `psql` sessions. Session A inserts revision 2 and holds its transaction open for five seconds; a separate session confirms the candidate advisory lock is actually held before session B submits competing revision 2. Session A must commit and B must receive the expected PostgreSQL revision-gap SQLSTATE; exactly one revision 2 must persist. It also tries a foreign Tenant B event (denied by RLS/foreign-scope), inserts a Tenant A revocation and checks a later proposal fails. The script's exit trap drops all candidate tables, schema and role; workflow confirms this independently.

## Conformance markers

- `PROVENANCE_PG_RACE_WORKER_PRIVILEGES_PASS` — local role has bounded privileges/constraints.
- `PROVENANCE_PG_RACE_OVERLAP_CONFIRMED_PASS` — lock is held when the contender runs.
- `PROVENANCE_PG_RACE_SERIALIZATION_PASS` — one and only one competing revision accepted.
- `PROVENANCE_PG_RACE_FOREIGN_TENANT_DENIED_PASS` — no Tenant B append by Tenant A worker.
- `PROVENANCE_PG_RACE_FORBIDDEN_DML_DENIED_PASS` — actual worker attempts to UPDATE binding/events, DELETE/TRUNCATE events or INSERT a new binding all fail with PostgreSQL SQLSTATE 42501.
- `PROVENANCE_PG_RACE_REVOKED_TERMINAL_PASS` — no unreviewed reactivation.
- `PROVENANCE_PG_RACE_PREFLIGHT_PASS` and `PROVENANCE_PG_CONCURRENCY_JOB_PASS` — complete and cleaned up.

## Limitations and follow-up gates

1. This experiment proves only the tested PostgreSQL **READ COMMITTED**-style race with two sessions. It is not a formal proof of all concurrency, Serializable/Snapshot isolation, deadlocks, connection pooler compatibility or cross-binding throughput. A future production implementation must independently test these and document retry semantics.
2. A keyed advisory lock is a cooperative correctness mechanism: any other authorized writer that bypasses the trigger or modifies table/trigger definitions can violate guarantees. Object owners/superusers remain powerful. The candidate is not a tamper-proof ledger.
3. RLS policies grant static Tenant A access to a *synthetic database role*; this does not exercise Supabase JWT role, `auth.uid()`, membership tables or provider account attestations. Worker authentication/credential rotation and identity proof remain unbuilt.
4. The prospective table and trigger remain exclusively under `tests/security` and are never installed in `supabase/migrations`. They cannot be treated as an approved schema.
5. PostgreSQL preflight cannot assert true vendor export completeness, accounting authority, POS/import matched transactions, refund/void handling or offline POS operation.

**Required:** PR-head PostgreSQL workflow and Node CI both PASS; distinct real-DB security gates `RLS-01`–`RLS-17`, signed-JWT staging, backup/restore, off-host `age` recovery, migration ledger, connector review, source ownership proof and Windows acceptance remain **NOT RUN / RELEASE NO-GO**. No merge/deploy, database migration or staging/production action is approved.
