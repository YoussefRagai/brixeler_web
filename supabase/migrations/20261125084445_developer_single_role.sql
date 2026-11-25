begin;

-- The portal currently exposes one company-wide developer role. Fail closed
-- before changing data: an unknown legacy role or membership status needs an
-- explicit operator decision instead of being silently granted access.
do $$
begin
  if exists (
    select 1
    from public.developer_accounts account
    where account.role is null
       or lower(btrim(account.role)) not in (
         'developer_super_admin', 'developer_admin', 'super_admin', 'admin', 'owner',
         'project_manager', 'project_admin', 'manager', 'member',
         'sales_manager', 'sales'
       )
  ) then
    raise exception 'Unsupported developer membership role; review rows before single-role normalization';
  end if;

  if exists (
    select 1
    from public.developer_accounts account
    where account.status is null
       or lower(btrim(account.status)) not in ('pending', 'active', 'revoked')
  ) then
    raise exception 'Unsupported developer membership status; review rows before single-role normalization';
  end if;
end;
$$;

-- Normalize every recognized historical role to the canonical role and keep
-- the column as text so future, explicitly migrated role tiers can be added
-- without changing the data model again.
update public.developer_accounts
set role = 'developer_super_admin',
    status = lower(btrim(status)),
    updated_at = now()
where role is distinct from 'developer_super_admin'
   or status is distinct from lower(btrim(status));

alter table public.developer_accounts
  alter column role drop default,
  alter column role set default 'developer_super_admin',
  alter column role set not null,
  alter column status set not null;

alter table public.developer_accounts
  drop constraint if exists developer_accounts_role_check;
alter table public.developer_accounts
  add constraint developer_accounts_role_check
  check (role = 'developer_super_admin');

alter table public.developer_accounts
  drop constraint if exists developer_accounts_status_check;
alter table public.developer_accounts
  add constraint developer_accounts_status_check
  check (status in ('pending', 'active', 'revoked'));

-- Known legacy values are accepted only as a compatibility input and are
-- immediately canonicalized. Unknown values are rejected before the role
-- check, including writes made through a service-role client.
create or replace function public.canonicalize_developer_account_role()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_role text := lower(btrim(coalesce(new.role, '')));
begin
  if normalized_role not in (
    'developer_super_admin', 'developer_admin', 'super_admin', 'admin', 'owner',
    'project_manager', 'project_admin', 'manager', 'member',
    'sales_manager', 'sales'
  ) then
    raise exception 'Unsupported developer membership role';
  end if;
  new.role := 'developer_super_admin';
  return new;
end;
$$;

drop trigger if exists developer_accounts_role_canonicalize on public.developer_accounts;
create trigger developer_accounts_role_canonicalize
before insert or update of role on public.developer_accounts
for each row execute function public.canonicalize_developer_account_role();

revoke all on function public.canonicalize_developer_account_role() from public, anon, authenticated;

-- Keep the service-only capability predicate aligned with the portal. The
-- capability names remain stable for future role tiers and existing callers.
create or replace function public.developer_role_has_capability(
  p_role text,
  p_capability text
)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select lower(btrim(coalesce(p_role, ''))) = 'developer_super_admin'
    and lower(btrim(coalesce(p_capability, ''))) in (
      'manage_company', 'manage_team', 'manage_projects', 'manage_inventory',
      'view_contacts', 'manage_contacts', 'view_analytics', 'manage_integrations'
    );
$$;

-- PostgREST now exposes the JWT role through the claims JSON consumed by
-- auth.role(). Keep the legacy setting as a compatibility fallback, but do
-- not let service-role RPCs infer the caller from a missing legacy setting.
create or replace function public.request_is_service_role()
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  claims jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return true;
  end if;
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    claims := null;
  end;
  return coalesce(claims ->> 'role', '') = 'service_role';
end;
$$;

revoke all on function public.request_is_service_role() from public, anon, authenticated;
grant execute on function public.request_is_service_role() to service_role;

-- Preserve the deployed moderation function bodies and grants while replacing
-- only their stale service-role discriminator. This keeps developer requests
-- and central-admin checks unchanged, including tenant and role validation.
do $$
declare
  function_name text;
  function_signature text;
  function_definition text;
  legacy_check constant text := 'coalesce(current_setting(''request.jwt.claim.role'', true), '''') = ''service_role''';
begin
  for function_name, function_signature in
    select * from (values
      ('review_developer_project', 'uuid, uuid, text, text'),
      ('review_property_listing', 'uuid, uuid, text, text'),
      ('review_property_renewal_request', 'uuid, uuid, boolean, text'),
      ('request_property_renewal_active_impl', 'uuid, public.property_renewal_actor, uuid, text')
    ) as target(name, signature)
  loop
    select pg_get_functiondef(procedure.oid)
      into function_definition
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = to_regprocedure(format('public.%I(%s)', function_name, function_signature));

    if function_definition is null then
      raise exception 'Expected moderation function %(%), but it was not found', function_name, function_signature;
    end if;
    if position(legacy_check in function_definition) = 0 then
      raise exception 'Moderation function % does not contain the legacy service-role check', function_name;
    end if;

    execute replace(function_definition, legacy_check, 'public.request_is_service_role()');
  end loop;
end;
$$;

-- Do not expose a role-change endpoint while role tiers are deferred. The
-- historical service-only RPC remains in place for a future additive tier
-- migration, and its writes are canonicalized by the trigger above.
commit;
