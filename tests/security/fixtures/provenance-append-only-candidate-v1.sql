-- CANDIDATE/TEST ONLY. Referenced solely from the rollback-only fixture.
-- Never place in supabase/migrations or run on actual CafeOS databases.
DO $preflight$
BEGIN
  IF current_database() <> 'cafeos_provenance_preflight' THEN
    RAISE EXCEPTION 'STOP: candidate requires disposable preflight DB';
  END IF;
  IF to_regclass('cafeos_preflight_private.bindings') IS NULL
    OR to_regclass('cafeos_preflight_private.binding_events') IS NULL THEN
    RAISE EXCEPTION 'STOP: candidate fixture relations missing';
  END IF;
END $preflight$;

-- A candidate event insert invariant, not a trusted API or authorization
-- boundary: the future permitted writer role and owner provenance need audit.
-- Serialize appends with a transaction advisory lock keyed by binding UUID.
-- This avoids granting a worker UPDATE on the parent binding merely to lock it.
-- A hash collision only over-serializes unrelated bindings (never bypasses checks).
CREATE FUNCTION cafeos_preflight_private.guard_event_append()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $body$
DECLARE
  last_revision integer;
  last_recorded_at timestamptz;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.binding_id::text, 0));

  PERFORM 1
    FROM cafeos_preflight_private.bindings
    WHERE id = NEW.binding_id
      AND tenant_id = NEW.tenant_id
      AND store_id = NEW.store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Binding scope missing' USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(MAX(revision),0), MAX(recorded_at)
    INTO last_revision, last_recorded_at
    FROM cafeos_preflight_private.binding_events
    WHERE binding_id = NEW.binding_id;

  IF NEW.revision <> last_revision + 1 THEN
    RAISE EXCEPTION 'Binding revision gap or replay'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM cafeos_preflight_private.binding_events
             WHERE binding_id = NEW.binding_id
               AND lifecycle IN ('revoked','rejected')) THEN
    RAISE EXCEPTION 'Terminal provenance event cannot be reactivated'
      USING ERRCODE = '23514';
  END IF;

  -- In this *disposable* fixture, use DB clock rather than caller's value.
  -- Real attestation actor, signature and source-account trust remain unbuilt.
  NEW.recorded_at := pg_catalog.clock_timestamp();

  IF last_recorded_at IS NOT NULL AND NEW.recorded_at <= last_recorded_at THEN
    RAISE EXCEPTION 'Nonmonotonic binding event time'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$body$;

CREATE FUNCTION cafeos_preflight_private.deny_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $body$
BEGIN
  RAISE EXCEPTION 'Binding provenance is append-only in this candidate'
    USING ERRCODE = '23514';
END
$body$;

REVOKE ALL ON FUNCTION cafeos_preflight_private.guard_event_append()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION cafeos_preflight_private.deny_binding_mutation()
  FROM PUBLIC;

CREATE TRIGGER guard_binding_event_append
  BEFORE INSERT ON cafeos_preflight_private.binding_events
  FOR EACH ROW
  EXECUTE FUNCTION cafeos_preflight_private.guard_event_append();

CREATE TRIGGER deny_binding_update_delete
  BEFORE UPDATE OR DELETE ON cafeos_preflight_private.bindings
  FOR EACH ROW
  EXECUTE FUNCTION cafeos_preflight_private.deny_binding_mutation();

CREATE TRIGGER deny_event_update_delete
  BEFORE UPDATE OR DELETE ON cafeos_preflight_private.binding_events
  FOR EACH ROW
  EXECUTE FUNCTION cafeos_preflight_private.deny_binding_mutation();

-- TRUNCATE bypasses row triggers, hence zero direct application grants are
-- mandatory. Object owners/superusers can alter the schema; this is NOT
-- proof of a tamper-proof ledger in any deployed Supabase project.
