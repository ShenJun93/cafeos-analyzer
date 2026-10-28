\set ON_ERROR_STOP on
-- TEST ONLY. Not a migration. Run against an isolated, disposable PostgreSQL
-- database named cafeos_provenance_preflight, NEVER staging/production.
-- The complete transaction is ROLLED BACK, including roles and schema.
\echo PROVENANCE_PG_PREFLIGHT_BEGIN
DO $guard$
BEGIN
  IF current_database() <> 'cafeos_provenance_preflight' THEN
    RAISE EXCEPTION 'STOP: disposable PostgreSQL fixture database required';
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'STOP: expected disposable fixture admin role';
  END IF;
END
$guard$;

BEGIN;
CREATE ROLE cafeos_preflight_anon NOLOGIN;
CREATE ROLE cafeos_preflight_auth NOLOGIN;
CREATE ROLE cafeos_preflight_probe_a NOLOGIN;
CREATE ROLE cafeos_preflight_probe_b NOLOGIN;

CREATE SCHEMA cafeos_preflight_private;
REVOKE ALL ON SCHEMA cafeos_preflight_private FROM PUBLIC;
REVOKE ALL ON SCHEMA cafeos_preflight_private FROM cafeos_preflight_anon, cafeos_preflight_auth;

CREATE TABLE cafeos_preflight_private.stores (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE cafeos_preflight_private.bindings (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  source_namespace text NOT NULL,
  provider_family text NOT NULL,
  account_digest char(64) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, store_id, id),
  UNIQUE (tenant_id, store_id, source_namespace),
  CONSTRAINT same_tenant_store FOREIGN KEY (tenant_id, store_id)
    REFERENCES cafeos_preflight_private.stores (tenant_id, id)
);
CREATE TABLE cafeos_preflight_private.binding_events (
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  binding_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  lifecycle text NOT NULL CHECK (lifecycle IN ('proposed','rejected','revoked')),
  recorded_at timestamptz NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  CONSTRAINT valid_window CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  PRIMARY KEY (binding_id, revision),
  CONSTRAINT scoped_binding_event FOREIGN KEY (tenant_id, store_id, binding_id)
    REFERENCES cafeos_preflight_private.bindings (tenant_id, store_id, id)
);
ALTER TABLE cafeos_preflight_private.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.binding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.stores FORCE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE cafeos_preflight_private.binding_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA cafeos_preflight_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA cafeos_preflight_private FROM cafeos_preflight_anon,cafeos_preflight_auth;

-- Internal test probes are NOT application roles. Giving only these synthetic
-- roles SELECT allows testing actual PostgreSQL RLS rather than just grants.
GRANT USAGE ON SCHEMA cafeos_preflight_private TO
  cafeos_preflight_probe_a, cafeos_preflight_probe_b;
GRANT SELECT ON cafeos_preflight_private.bindings,
  cafeos_preflight_private.binding_events TO
  cafeos_preflight_probe_a, cafeos_preflight_probe_b;
CREATE POLICY probe_a_binding_read ON cafeos_preflight_private.bindings
  FOR SELECT TO cafeos_preflight_probe_a
  USING (tenant_id='10000000-0000-4000-8000-000000000001'::uuid);
CREATE POLICY probe_b_binding_read ON cafeos_preflight_private.bindings
  FOR SELECT TO cafeos_preflight_probe_b
  USING (tenant_id='20000000-0000-4000-8000-000000000002'::uuid);
CREATE POLICY probe_a_event_read ON cafeos_preflight_private.binding_events
  FOR SELECT TO cafeos_preflight_probe_a
  USING (tenant_id='10000000-0000-4000-8000-000000000001'::uuid);
CREATE POLICY probe_b_event_read ON cafeos_preflight_private.binding_events
  FOR SELECT TO cafeos_preflight_probe_b
  USING (tenant_id='20000000-0000-4000-8000-000000000002'::uuid);

INSERT INTO cafeos_preflight_private.stores(tenant_id,id) VALUES
 ('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002');
INSERT INTO cafeos_preflight_private.bindings
 (id,tenant_id,store_id,source_namespace,provider_family,account_digest)
 VALUES
 ('51000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001','synthetic:a','fake',repeat('a',64)),
 ('52000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000002','synthetic:b','fake',repeat('b',64));
INSERT INTO cafeos_preflight_private.binding_events
 (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from) VALUES
 ('10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',1,'proposed',
  '2026-10-28T08:00:00+00','2026-10-28T08:00:00+00'),
 ('20000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000002',1,'proposed',
  '2026-10-28T08:00:00+00','2026-10-28T08:00:00+00');

-- Catalog privilege and defense-in-depth gate.
DO $check$
DECLARE
  role_name text;
  obj_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'cafeos_preflight_anon','cafeos_preflight_auth'] LOOP
    IF has_schema_privilege(role_name,'cafeos_preflight_private','USAGE') THEN
      RAISE EXCEPTION 'FAIL: app role can use private schema %',role_name;
    END IF;
    FOREACH obj_name IN ARRAY ARRAY[
      'stores','bindings','binding_events'] LOOP
      IF has_table_privilege(role_name,
        'cafeos_preflight_private.'||obj_name,
        'SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'FAIL: app table privileges % %',role_name,obj_name;
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='cafeos_preflight_private'
      AND c.relname IN ('stores','bindings','binding_events')
      AND c.relrowsecurity AND c.relforcerowsecurity) <> 3 THEN
    RAISE EXCEPTION 'FAIL: RLS/FORCE RLS missing';
  END IF;
  IF (SELECT count(*) FROM pg_roles
    WHERE rolname IN ('cafeos_preflight_probe_a','cafeos_preflight_probe_b')
      AND NOT rolbypassrls AND NOT rolsuper) <> 2 THEN
    RAISE EXCEPTION 'FAIL: probe role bypasses RLS';
  END IF;
END
$check$;
\echo PROVENANCE_PG_PRIVILEGES_PASS

-- PostgreSQL enforces the scoped FK and declared uniqueness independently
-- from the untrusted Node claim reviewer. Assert expected SQLSTATE using
-- plpgsql subtransactions (EXCEPTION blocks).
DO $negative$
BEGIN
  BEGIN
    INSERT INTO cafeos_preflight_private.bindings
      (id,tenant_id,store_id,source_namespace,provider_family,account_digest)
    VALUES ('53000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000002',
      'synthetic:foreign-store','fake',repeat('c',64));
    RAISE EXCEPTION 'FAIL: foreign Store was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO cafeos_preflight_private.bindings
      (id,tenant_id,store_id,source_namespace,provider_family,account_digest)
    VALUES ('53000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      'synthetic:a','fake',repeat('c',64));
    RAISE EXCEPTION 'FAIL: duplicate namespace was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO cafeos_preflight_private.binding_events
      (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
    VALUES ('20000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',2,'proposed',now(),now());
    RAISE EXCEPTION 'FAIL: foreign binding event was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO cafeos_preflight_private.binding_events
      (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
    VALUES ('10000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',1,'proposed',now(),now());
    RAISE EXCEPTION 'FAIL: replay revision was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$negative$;
\echo PROVENANCE_PG_FK_AND_UNIQUENESS_PASS

SET ROLE cafeos_preflight_probe_a;
DO $tenant_a$
DECLARE binding_count integer; event_count integer;
BEGIN
  SELECT count(*) INTO binding_count FROM cafeos_preflight_private.bindings;
  SELECT count(*) INTO event_count FROM cafeos_preflight_private.binding_events;
  IF binding_count <> 1 OR event_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: RLS Tenant A counts bindings %, events %',
      binding_count,event_count;
  END IF;
  IF EXISTS (SELECT 1 FROM cafeos_preflight_private.bindings
    WHERE tenant_id = '20000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: Tenant A can read Tenant B binding';
  END IF;
  BEGIN
    DELETE FROM cafeos_preflight_private.bindings
      WHERE tenant_id='10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL: read-only probe role can delete';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE cafeos_preflight_private.bindings
      SET source_namespace='spoofed' WHERE source_namespace='synthetic:a';
    RAISE EXCEPTION 'FAIL: read-only probe role can update';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$tenant_a$;
RESET ROLE;
\echo PROVENANCE_PG_RLS_TENANT_A_PASS

SET ROLE cafeos_preflight_probe_b;
DO $tenant_b$
DECLARE binding_count integer; event_count integer;
BEGIN
  SELECT count(*) INTO binding_count FROM cafeos_preflight_private.bindings;
  SELECT count(*) INTO event_count FROM cafeos_preflight_private.binding_events;
  IF binding_count <> 1 OR event_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: RLS Tenant B counts bindings %, events %',
      binding_count,event_count;
  END IF;
  IF EXISTS (SELECT 1 FROM cafeos_preflight_private.bindings
    WHERE tenant_id='10000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: Tenant B can read Tenant A binding';
  END IF;
  BEGIN
    INSERT INTO cafeos_preflight_private.binding_events
      (tenant_id,store_id,binding_id,revision,lifecycle,recorded_at,effective_from)
    VALUES ('20000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000002',
      '52000000-0000-4000-8000-000000000002',2,'proposed',now(),now());
    RAISE EXCEPTION 'FAIL: read-only probe role can insert event';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$tenant_b$;
RESET ROLE;
\echo PROVENANCE_PG_RLS_TENANT_B_PASS

-- Generic app role cannot access the schema or data even after SET ROLE.
SET ROLE cafeos_preflight_auth;
DO $private_deny$
BEGIN
  BEGIN
    PERFORM * FROM cafeos_preflight_private.bindings LIMIT 1;
    RAISE EXCEPTION 'FAIL: generic app role read private binding';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM cafeos_preflight_private.binding_events LIMIT 1;
    RAISE EXCEPTION 'FAIL: generic app role read private event';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$private_deny$;
RESET ROLE;
\echo PROVENANCE_PG_GENERIC_AUTH_DENIED_PASS

-- No objects/roles from the fixture survive. Tests have no production DDL.
ROLLBACK;
DO $cleanup$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace
      WHERE nspname='cafeos_preflight_private')
    OR EXISTS (SELECT 1 FROM pg_roles
      WHERE rolname LIKE 'cafeos_preflight_%') THEN
    RAISE EXCEPTION 'FAIL: disposable fixture leaked roles or schema';
  END IF;
END
$cleanup$;
\echo PROVENANCE_PG_DISPOSABLE_ROLLBACK_PASS
