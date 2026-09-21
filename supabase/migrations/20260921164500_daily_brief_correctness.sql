-- CafeOS Daily Brief correctness gate (issue #21).
-- Locks auditable source-timezone metadata and rejects invalid IANA zones.
-- Historical imports may remain NULL because their original timestamp semantics
-- cannot be reconstructed safely after the fact.

create or replace function private.is_valid_iana_timezone(candidate text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select candidate is not null
    and candidate = btrim(candidate)
    and exists (
      select 1
      from pg_catalog.pg_timezone_names tz
      where tz.name = candidate
    );
$$;

revoke all on function private.is_valid_iana_timezone(text) from public, anon;
grant execute on function private.is_valid_iana_timezone(text) to authenticated, service_role;

alter table public.imports
  add column if not exists source_timezone text;

comment on column public.imports.source_timezone is
  'IANA timezone assumption used when naive source timestamps are interpreted. NULL is permitted only for historical imports or sources whose timestamps already carried explicit offsets.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'imports_source_timezone_iana_check'
      and conrelid = 'public.imports'::regclass
  ) then
    alter table public.imports
      add constraint imports_source_timezone_iana_check
      check (
        source_timezone is null
        or private.is_valid_iana_timezone(source_timezone)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_timezone_iana_check'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_timezone_iana_check
      check (private.is_valid_iana_timezone(timezone));
  end if;
end
$$;
