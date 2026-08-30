begin;

do $$
declare
  required_roles text[] := array['developer_super_admin', 'project_manager', 'sales_manager'];
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
  if not public.developer_role_has_capability('project_manager', 'manage_projects') then
    raise exception 'Project manager must manage projects';
  end if;
  if not public.developer_role_has_capability('sales_manager', 'manage_inventory')
     or not public.developer_role_has_capability('sales_manager', 'manage_contacts') then
    raise exception 'Sales manager capability contract is incomplete';
  end if;
  if public.developer_role_has_capability('sales_manager', 'manage_team')
     or public.developer_role_has_capability('project_manager', 'manage_company') then
    raise exception 'Delegated developer roles have excess company authority';
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

rollback;
