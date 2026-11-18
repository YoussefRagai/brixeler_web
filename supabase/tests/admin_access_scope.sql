begin;

insert into auth.users (id) values
  ('a4000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000002');
insert into public.admins (id, role, roles, is_active, permissions) values
  ('a4000000-0000-4000-8000-000000000001', 'super_admin', '{}', true, '{}'),
  ('a4000000-0000-4000-8000-000000000002', 'super_admin', '{super_admin}', true, '{"display_name":"Regression admin"}');

set local role service_role;
do $$
declare
  actor constant uuid := 'a4000000-0000-4000-8000-000000000001';
  target constant uuid := 'a4000000-0000-4000-8000-000000000002';
  signature constant text := 'public.update_admin_access(uuid,uuid,public.admin_role[],uuid[],boolean,text)';
  change_result jsonb;
begin
  if has_function_privilege('anon', signature, 'execute') or has_function_privilege('authenticated', signature, 'execute') then
    raise exception 'Admin access RPC is exposed to client roles';
  end if;

  begin
    perform public.update_admin_access(actor, actor, '{super_admin}', null, false, 'Suspend self');
    raise exception 'Self-suspension was allowed';
  exception when invalid_parameter_value then
    if sqlerrm <> 'You cannot suspend your own admin access' then raise; end if;
  end;

  begin
    perform public.update_admin_access(actor, actor, '{developers_admin}', '{}', true, 'Demote self');
    raise exception 'Self-demotion was allowed';
  exception when invalid_parameter_value then
    if sqlerrm <> 'You cannot remove your own super-admin access' then raise; end if;
  end;

  change_result := public.update_admin_access(actor, target, '{developers_admin}', '{}', false, 'Revoke delegated access');
  if change_result->>'status' <> 'suspended' or change_result->'roles' <> '["developers_admin"]'::jsonb
     or not exists (
       select 1 from public.admins where id = target
         and is_active is false and permissions = '{"developer_ids":[],"display_name":"Regression admin"}'::jsonb
     ) then
    raise exception 'Admin status, roles, or scope did not persist correctly';
  end if;

  begin
    perform public.update_admin_access(target, actor, '{developers_admin}', '{}', false, 'Stale actor access');
    raise exception 'A previously revoked actor could still change admin access';
  exception when insufficient_privilege then
    if sqlerrm <> 'Active super admin required' then raise; end if;
  end;

  change_result := public.update_admin_access(actor, target, '{developers_admin}', null, null, null);
  if change_result->>'changed' <> 'false'
     or (select count(*) from public.admin_activity_log where admin_id = actor and entity_id = target
       and action_type = 'admin.update_roles' and details->>'reason' = 'Revoke delegated access') <> 1 then
    raise exception 'Admin access change was not audited exactly once';
  end if;
end;
$$;

rollback;
