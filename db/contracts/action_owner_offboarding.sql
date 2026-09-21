-- CafeOS user-offboarding FK correction (issue #23).
-- Actions remain tenant evidence when an assigned user leaves the tenant.
-- Only the optional owner assignment is cleared; tenant_id remains intact.

alter table public.actions
  drop constraint if exists actions_owner_fk;

alter table public.actions
  add constraint actions_owner_fk
  foreign key (tenant_id, owner_user_id)
  references public.tenant_members(tenant_id, user_id)
  on delete set null (owner_user_id);
