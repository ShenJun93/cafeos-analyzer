-- CafeOS Daily Brief correctness gate.
-- Locks timezone assumptions before persisted Daily Brief metrics become authoritative.

create or replace function private.is_valid_timezone(zone_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select nullif(btrim(zone_name), '') is not null
    and exists (
      select 1
      from pg_timezone_names()
      where name = zone_name
    );
$$;

revoke all on function private.is_valid_timezone(text) from public, anon;
grant execute on function private.is_valid_timezone(text) to authenticated, service_role;

alter table public.imports
  add column if not exists source_timezone text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'imports_source_timezone_valid_check'
      and conrelid = 'public.imports'::regclass
  ) then
    alter table public.imports
      add constraint imports_source_timezone_valid_check
      check (
        source_timezone is null
        or private.is_valid_timezone(source_timezone)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_timezone_valid_check'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_timezone_valid_check
      check (private.is_valid_timezone(timezone));
  end if;
end
$$;

comment on column public.imports.source_timezone is
  'IANA timezone assumption used to interpret source timestamps that arrive without an explicit offset. NULL is allowed only for legacy imports or sources whose timestamps are already absolute instants.';
