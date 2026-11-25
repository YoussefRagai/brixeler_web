begin;

-- Keep the JWT/RPC regression self-contained. This fixture is rolled back with
-- the suite and must not depend on whichever central admins exist in the
-- target database.
create temporary table developer_rbac_claim_fixture (
  admin_id uuid primary key
) on commit drop;

insert into developer_rbac_claim_fixture (admin_id)
values (extensions.uuid_generate_v4());

insert into auth.users (id, email)
select admin_id, format('developer-rbac-claims-%s@example.invalid', admin_id)
from developer_rbac_claim_fixture;

insert into public.admins (id, role, roles, is_active)
select admin_id, 'super_admin', array['super_admin'::public.admin_role], true
from developer_rbac_claim_fixture;

do $$
declare
  required_roles text[] := array['developer_super_admin'];
  required_functions text[] := array[
    'developer_role_has_capability',
    'developer_account_has_capability',
    'invite_developer_team_member',
    'resend_developer_team_invite',
    'update_developer_team_member_role',
    'revoke_developer_team_member'
  ];
  role_name text;
  function_name text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'developer_accounts'
      and column_name = 'role' and data_type = 'text'
  ) then
    raise exception 'Developer membership role must be stored as text';
  end if;

  foreach role_name in array required_roles loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.developer_accounts'::regclass
        and conname = 'developer_accounts_role_check'
        and pg_get_constraintdef(oid) like '%' || role_name || '%'
    ) then
      raise exception 'Missing canonical role in membership check: %', role_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.developer_accounts'::regclass
      and tgname = 'developer_accounts_tenant_and_super_admin_guard'
  ) then
    raise exception 'Developer membership tenant/super-admin trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.developer_accounts'::regclass
      and tgname = 'developer_accounts_role_canonicalize'
  ) then
    raise exception 'Developer membership role canonicalization trigger is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.developer_accounts'::regclass
      and conname = 'developer_accounts_status_check'
      and pg_get_constraintdef(oid) like '%pending%active%revoked%'
  ) then
    raise exception 'Developer membership status check is missing';
  end if;

  foreach function_name in array required_functions loop
    if not exists (
      select 1 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public' and procedure.proname = function_name
    ) then
      raise exception 'Missing developer RBAC function: %', function_name;
    end if;
  end loop;

  if not public.developer_role_has_capability('developer_super_admin', 'manage_team') then
    raise exception 'Super admin must manage the company team';
  end if;
  if not public.developer_role_has_capability('developer_super_admin', 'manage_company')
     or not public.developer_role_has_capability('developer_super_admin', 'manage_projects')
     or not public.developer_role_has_capability('developer_super_admin', 'manage_inventory')
     or not public.developer_role_has_capability('developer_super_admin', 'view_contacts')
     or not public.developer_role_has_capability('developer_super_admin', 'manage_contacts')
     or not public.developer_role_has_capability('developer_super_admin', 'view_analytics') then
    raise exception 'Company super admin capability contract is incomplete';
  end if;
  if public.developer_role_has_capability('project_manager', 'manage_team')
     or public.developer_role_has_capability('sales_manager', 'manage_inventory')
     or public.developer_role_has_capability('unknown', 'manage_company') then
    raise exception 'Legacy or unknown developer roles must not authorize capabilities';
  end if;

  if has_table_privilege('authenticated', 'public.developer_accounts', 'update')
     or has_table_privilege('authenticated', 'public.developer_accounts', 'delete') then
    raise exception 'Authenticated users must not directly mutate developer memberships';
  end if;
  if has_function_privilege('authenticated', 'public.invite_developer_team_member(uuid,uuid,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.resend_developer_team_invite(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.update_developer_team_member_role(uuid,uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.revoke_developer_team_member(uuid,uuid,text,text)', 'execute') then
    raise exception 'Authenticated users must not execute service-only team RPCs';
  end if;
  if not has_function_privilege('service_role', 'public.invite_developer_team_member(uuid,uuid,text,text,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.resend_developer_team_invite(uuid,uuid,text)', 'execute')
     or not has_function_privilege('service_role', 'public.update_developer_team_member_role(uuid,uuid,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.revoke_developer_team_member(uuid,uuid,text,text)', 'execute') then
    raise exception 'Service role must execute all team lifecycle RPCs';
  end if;
end;
$$;

do $$
declare
  central_admin_id uuid;
  fake_project_id constant uuid := '00000000-0000-4000-8000-000000000000'::uuid;
begin
  -- PostgREST supplies the role through the claims JSON. A service claim must
  -- keep the supplied central-admin actor for moderation RPCs, even when the
  -- legacy request.jwt.claim.role setting is absent.
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  if auth.role() <> 'service_role' then
    raise exception 'auth.role() did not read the service-role JSON claim';
  end if;
  if not public.request_is_service_role() then
    raise exception 'JSON service-role claim was not recognized';
  end if;

  select fixture.admin_id
    into central_admin_id
  from developer_rbac_claim_fixture fixture
  limit 1;
  if central_admin_id is null then
    raise exception 'No active central listing admin is available for the JSON claim regression test';
  end if;

  begin
    perform public.review_developer_project(fake_project_id, central_admin_id, 'approved', null);
    raise exception 'Expected the fake project review to advance to Project not found';
  exception when others then
    if sqlerrm not like 'Project % not found' then
      raise;
    end if;
  end;

  -- A non-service JSON claim must not inherit the supplied central actor.
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000000"}', true);
  if auth.role() <> 'authenticated' then
    raise exception 'auth.role() did not read the authenticated JSON claim';
  end if;
  if public.request_is_service_role() then
    raise exception 'Authenticated JSON claim was treated as service role';
  end if;

  begin
    perform public.review_developer_project(fake_project_id, central_admin_id, 'approved', null);
    raise exception 'Expected a non-service review to reject the supplied central actor';
  exception when others then
    if sqlerrm <> 'Active listing admin required' then
      raise;
    end if;
  end;
end;
$$;

rollback;
