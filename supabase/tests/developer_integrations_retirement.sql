begin;

do $$
declare
  table_name text;
  procedure_name text;
  write_privilege text;
  worker_procedure text;
  queued_webhooks bigint;
  queued_syncs bigint;
  enabled_schedules bigint;
  enqueue_result integer;
begin
  foreach table_name in array array[
    'developer_api_credentials',
    'developer_webhook_endpoints',
    'developer_webhook_deliveries',
    'developer_import_schedules',
    'developer_integration_field_mappings',
    'developer_sync_runs',
    'developer_sync_conflicts'
  ] loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Historical integration table was dropped: %', table_name;
    end if;
    if not has_table_privilege('service_role', 'public.' || table_name, 'select') then
      raise exception 'Read-only historical access is missing for %', table_name;
    end if;
    foreach write_privilege in array array['insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('service_role', 'public.' || table_name, write_privilege) then
        raise exception 'Retired integration table % still grants % to service_role', table_name, write_privilege;
      end if;
    end loop;
  end loop;

  if exists (select 1 from public.developer_api_credentials where revoked_at is null) then
    raise exception 'An API credential remained active after integration retirement';
  end if;
  if exists (select 1 from public.developer_webhook_endpoints where status <> 'revoked') then
    raise exception 'A webhook endpoint remained active after integration retirement';
  end if;
  select count(*) into queued_webhooks
  from public.developer_webhook_deliveries
  where status in ('pending', 'processing');
  if queued_webhooks <> 0 then
    raise exception 'Webhook deliveries remained queued after integration retirement: %', queued_webhooks;
  end if;
  select count(*) into queued_syncs
  from public.developer_sync_runs
  where status in ('queued', 'running');
  if queued_syncs <> 0 then
    raise exception 'Sync runs remained queued after integration retirement: %', queued_syncs;
  end if;
  select count(*) into enabled_schedules
  from public.developer_import_schedules
  where enabled or next_run_at is not null;
  if enabled_schedules <> 0 then
    raise exception 'Import schedules remained enabled after integration retirement: %', enabled_schedules;
  end if;

  foreach procedure_name in array array[
    'public.enqueue_developer_webhook_event(uuid,text,text,jsonb)',
    'public.create_developer_api_credential(uuid,uuid,text,text,text,text[],timestamptz)',
    'public.revoke_developer_api_credential(uuid,uuid,uuid)',
    'public.create_developer_webhook_endpoint(uuid,uuid,text,text,text,text[])',
    'public.create_developer_import_schedule(uuid,uuid,text,text,text,text,text,boolean,text,text)',
    'public.create_developer_sync_run(uuid,uuid,uuid,text,text,text)',
    'public.developer_webhook_url_is_safe(text)'
  ] loop
    if to_regprocedure(procedure_name) is null then
      raise exception 'Retirement lost expected compatibility function: %', procedure_name;
    end if;
    if has_function_privilege('public', procedure_name, 'execute')
       or has_function_privilege('anon', procedure_name, 'execute')
       or has_function_privilege('authenticated', procedure_name, 'execute')
       or has_function_privilege('service_role', procedure_name, 'execute') then
      raise exception 'Retired integration RPC remains executable: %', procedure_name;
    end if;
  end loop;

  foreach worker_procedure in array array[
    'public.claim_developer_webhook_deliveries(integer)',
    'public.complete_developer_webhook_delivery(uuid,uuid,boolean,text)'
  ] loop
    if to_regprocedure(worker_procedure) is not null
       and (has_function_privilege('public', worker_procedure, 'execute')
         or has_function_privilege('anon', worker_procedure, 'execute')
         or has_function_privilege('authenticated', worker_procedure, 'execute')
         or has_function_privilege('service_role', worker_procedure, 'execute')) then
      raise exception 'Retired webhook worker RPC remains executable: %', worker_procedure;
    end if;
  end loop;

  -- The shared mobile lead transaction still has its service-role boundary,
  -- while its historical webhook call is now a zero-write compatibility stub.
  if not has_function_privilege(
    'service_role',
    'public.create_developer_contact_request_with_notification(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,text,text,text)',
    'execute'
  ) then
    raise exception 'Core mobile contact-request RPC was revoked';
  end if;
  select public.enqueue_developer_webhook_event(
    '11111111-1111-4111-8111-111111111111',
    'lead.created',
    'retirement-contract',
    '{"test":true}'::jsonb
  ) into enqueue_result;
  if enqueue_result <> 0 then
    raise exception 'Retired enqueue helper performed work: %', enqueue_result;
  end if;
end;
$$;

rollback;
