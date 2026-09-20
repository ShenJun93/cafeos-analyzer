# Database model v0.1

`db/migrations/001_analyzer_core.sql` is the persistence contract for Wave 6.

## Idempotency

Each normalized line receives a deterministic `source_record_key`. The database enforces `unique (tenant_id, source_namespace, source_record_key)`, so overlapping exports do not double-count previously committed lines. The occurrence index in the key preserves multiple genuinely identical rows within the same source export.

An entire normalized import also receives a deterministic fingerprint and is unique within `(tenant_id, source_namespace)`.

## Tenancy

Every mutable business row carries `tenant_id`. RLS is enabled on tenant, membership, import and line-item tables. Access is mediated by `private.has_tenant_access(...)` and the authenticated user identity.

No cross-tenant customer identity matching is allowed.

## Scope

The migration intentionally does not add campaign, loyalty, payment, inventory or accounting tables.
