begin;

insert into auth.users (id) values
  ('a5000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000002'),
  ('a5000000-0000-4000-8000-000000000003'),
  ('a5000000-0000-4000-8000-000000000004'),
  ('a5000000-0000-4000-8000-000000000005');
insert into public.admins (id, role, roles, is_active) values
  ('a5000000-0000-4000-8000-000000000001', 'admin', '{user_auth_admin}', true),
  ('a5000000-0000-4000-8000-000000000002', 'super_admin', '{super_admin}', true);
insert into public.users_profile (
  id, first_name_en, last_name_en, first_name_ar, last_name_ar, phone, referral_code,
  account_status, account_lifecycle_state
) values
  ('a5000000-0000-4000-8000-000000000002', 'Dual', 'Identity', 'Dual', 'Identity', '+19990006701', 'RESTORECONTRACT2', 'suspended', 'archived'),
  ('a5000000-0000-4000-8000-000000000003', 'Archived', 'Agent', 'Archived', 'Agent', '+19990006702', 'RESTORECONTRACT3', 'suspended', 'archived'),
  ('a5000000-0000-4000-8000-000000000004', 'Active', 'Agent', 'Active', 'Agent', '+19990006703', 'RESTORECONTRACT4', 'active', 'active'),
  ('a5000000-0000-4000-8000-000000000005', 'Suspended', 'Agent', 'Suspended', 'Agent', '+19990006704', 'RESTORECONTRACT5', 'suspended', 'suspended');

set local role service_role;
do $$
declare
  actor constant uuid := 'a5000000-0000-4000-8000-000000000001';
  dashboard_identity constant uuid := 'a5000000-0000-4000-8000-000000000002';
  archived_agent constant uuid := 'a5000000-0000-4000-8000-000000000003';
  active_agent constant uuid := 'a5000000-0000-4000-8000-000000000004';
  suspended_agent constant uuid := 'a5000000-0000-4000-8000-000000000005';
  signature constant text := 'public.restore_agent_access(uuid,uuid,text,text,boolean,timestamptz)';
  authorized jsonb;
  restored jsonb;
  prepared_at timestamptz;
begin
  if has_function_privilege('anon', signature, 'execute') or has_function_privilege('authenticated', signature, 'execute') then
    raise exception 'Restore RPC is exposed to client roles';
  end if;

  begin
    perform public.restore_agent_access(dashboard_identity, actor, 'Regression check', 'archived', false, null);
    raise exception 'Dashboard Auth target passed restore authorization';
  exception when raise_exception then
    if sqlerrm <> 'Dashboard identities must be separated before changing agent access' then raise; end if;
  end;
  begin
    perform public.restore_agent_access(active_agent, actor, 'Regression check', 'suspended', false, null);
    raise exception 'Ineligible active agent passed restore authorization';
  exception when raise_exception then
    if sqlerrm <> 'Only suspended accounts can be restored with this action' then raise; end if;
  end;

  authorized := public.restore_agent_access(archived_agent, actor, 'Regression check', 'archived', false, null);
  prepared_at := (authorized->>'updated_at')::timestamptz;
  if authorized->>'state' <> 'archived'
     or not exists (select 1 from public.users_profile where id = archived_agent and account_status = 'suspended') then
    raise exception 'The agent was activated before Auth completion';
  end if;
  begin
    perform public.restore_agent_access(archived_agent, actor, 'Regression check', 'archived', true, prepared_at - interval '1 second');
    raise exception 'Stale restore version was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Agent account changed; reload before restoring' then raise; end if;
  end;

  restored := public.restore_agent_access(archived_agent, actor, 'Regression check', 'archived', true, prepared_at);
  if restored->>'state' <> 'active' then raise exception 'Archived agent was not restored'; end if;
  restored := public.restore_agent_access(archived_agent, actor, 'Regression check', 'archived', true, prepared_at);
  if restored->>'already_restored' <> 'true' then raise exception 'Concurrent completion was not idempotent'; end if;
  if (select count(*) from public.admin_activity_log where entity_id = archived_agent and action_type = 'agent.restore') <> 1 then
    raise exception 'Archive restore did not commit one audit record';
  end if;

  authorized := public.restore_agent_access(suspended_agent, actor, 'Regression check', 'suspended', false, null);
  restored := public.restore_agent_access(suspended_agent, actor, 'Regression check', 'suspended', true, (authorized->>'updated_at')::timestamptz);
  if restored->>'state' <> 'active' then raise exception 'Suspended agent was not reactivated'; end if;
end;
$$;

rollback;
