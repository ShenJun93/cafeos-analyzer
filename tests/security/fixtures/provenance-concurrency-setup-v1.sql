\set ON_ERROR_STOP on
-- Standalone synthetic PostgreSQL 17 fixture.
-- Never execute outside the disposable GitHub-hosted local DB.
DO $guard$
BEGIN
  IF current_database() <> 'cafeos_provenance_preflight'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'STOP: disposable preflight superuser required';
  END IF;
END $guard$;

BEGIN;
CREATE ROLE cafeos_concurrency_worker NOLOGIN NOBYPASSRLS;
CREATE SCHEMA cafeos_preflight_private;
REVOKE ALL ON SCHEMA cafeos_preflight_private FROM PUBLIC;

CREATE TABLE cafeos_preflight_private.stores (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  PRIMARY KEY (tenant_id,id)
);
CREATE TABLE cafeos_preflight_private.bindings (
  id uuid NOT NULL PRIMARY KEY,
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  source_namespace text NOT NULL,
  provider_family text NOT NULL,
  account_digest char(64) NOT NULL,
  UNIQUE (tenant_id,store_id,id),
  UNIQUE (tenant_id,store_id,source_namespace),
  FOREIGN KEY (tenant_id,store_id)
    REFERENCES cafeos_preflight_private.stores(tenant_id,id)
);
CREATE TABLE cafeos_preflight_private.binding_events (
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  binding_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision > 0),
  lifecycle text NOT NULL CHECK(lifecycle IN ('proposed','rejected','revoked')),
  recorded_at timestamptz NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  PRIMARY KEY(binding_id,revision),
  FOREIGN KEY(tenant_id,store_id,binding_id)
    REFERENCES cafeos_preflight_private.bindings(tenant_id,store_id,id),
  CHECK(effective_until IS NULL OR effective_until > effective_from)
);

-- The candidate is shared with the original rollback-only acceptance fixture.
\ir provenance-append-only-candidate-v1.sql

ALTER TABLE cafeos_preflight_private.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.binding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.stores FORCE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.binding_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA cafeos_preflight_private FROM PUBLIC;

INSERT INTO cafeos_preflight_private.stores(tenant_id,id) VALUES
 ('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002');
INSERT INTO cafeos_preflight_private.bindings
 (id,tenant_id,store_id,source_namespace,provider_family,account_digest)
VALUES
 ('51000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'synthetic:a','synthetic',repeat('a',64)),
 ('52000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000002',
  'synthetic:b','synthetic',repeat('b',64));
INSERT INTO cafeos_preflight_private.binding_events
 (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
VALUES
 ('10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  1,'proposed','2026-10-28T08:00:00Z','2026-10-28T08:00:00Z'),
 ('20000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000002',
  1,'proposed','2026-10-28T08:00:00Z','2026-10-28T08:00:00Z');

-- A worker can append for its own tenant only. It cannot administer
-- bindings, change history or alter the schema. Synthetic test role only.
GRANT USAGE ON SCHEMA cafeos_preflight_private TO cafeos_concurrency_worker;
GRANT SELECT ON cafeos_preflight_private.bindings,
  cafeos_preflight_private.binding_events TO cafeos_concurrency_worker;
GRANT INSERT ON cafeos_preflight_private.binding_events
  TO cafeos_concurrency_worker;
CREATE POLICY worker_binding_read ON cafeos_preflight_private.bindings
  FOR SELECT TO cafeos_concurrency_worker
  USING (tenant_id='10000000-0000-4000-8000-000000000001'::uuid);
CREATE POLICY worker_event_read ON cafeos_preflight_private.binding_events
  FOR SELECT TO cafeos_concurrency_worker
  USING (tenant_id='10000000-0000-4000-8000-000000000001'::uuid);
CREATE POLICY worker_event_insert ON cafeos_preflight_private.binding_events
  FOR INSERT TO cafeos_concurrency_worker
  WITH CHECK(tenant_id='10000000-0000-4000-8000-000000000001'::uuid);

DO $privilege$
BEGIN
  IF (SELECT rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb
      FROM pg_roles WHERE rolname='cafeos_concurrency_worker') THEN
    RAISE EXCEPTION 'FAIL: worker privileged role';
  END IF;
  IF has_table_privilege('cafeos_concurrency_worker',
       'cafeos_preflight_private.bindings','UPDATE')
     OR has_table_privilege('cafeos_concurrency_worker',
       'cafeos_preflight_private.binding_events','UPDATE')
     OR has_table_privilege('cafeos_concurrency_worker',
       'cafeos_preflight_private.binding_events','DELETE')
     OR has_table_privilege('cafeos_concurrency_worker',
       'cafeos_preflight_private.binding_events','TRUNCATE')
     OR has_table_privilege('cafeos_concurrency_worker',
       'cafeos_preflight_private.bindings','INSERT') THEN
    RAISE EXCEPTION 'FAIL: worker has forbidden DML';
  END IF;
END $privilege$;
COMMIT;
\echo PROVENANCE_RACE_SETUP_PASS
