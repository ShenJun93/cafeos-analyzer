-- READ-ONLY SHA-256 fingerprint for the complete ordered Supabase migration ledger.
-- Version, original migration name and ordered SQL statements all matter.
-- No receipt SQL text or database credentials leave this SELECT.
select encode(sha256(convert_to(
  coalesce(string_agg(
    version || chr(31) || coalesce(name,'') || chr(31) ||
    coalesce(array_to_string(statements, chr(30)), ''),
    chr(29) order by version), ''),
  'UTF8')), 'hex') as receipt_sha256
from supabase_migrations.schema_migrations;
