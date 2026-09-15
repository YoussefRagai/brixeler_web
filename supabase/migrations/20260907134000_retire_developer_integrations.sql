begin;

-- Retire the optional developer CRM/integration capability without dropping its
-- historical tables or rows.  The dashboard/mobile contact-request contract
-- remains first-party; only external credentials, webhooks, and import work
-- are disabled here.
do $$
declare
  table_name text;
begin
  if to_regclass('public.developer_api_credentials') is not null then
    update public.developer_api_credentials
    set revoked_at = coalesce(revoked_at, now()),
        updated_at = now()
    where revoked_at is null;
  end if;

  if to_regclass('public.developer_webhook_endpoints') is not null then
    update public.developer_webhook_endpoints
    set status = 'revoked',
        updated_at = now()
    where status <> 'revoked';
  end if;

  if to_regclass('public.developer_webhook_deliveries') is not null then
    if exists (
      select 1
      from information_schema.columns as columns
      where columns.table_schema = 'public'
        and columns.table_name = 'developer_webhook_deliveries'
        and columns.column_name = 'lease_token'
    ) then
      update public.developer_webhook_deliveries
      set status = 'failed',
          last_error = left(
            concat_ws('; ', nullif(last_error, ''), 'Developer integrations retired; delivery cancelled'),
            2000
          ),
          lease_token = null,
          updated_at = now()
      where status in ('pending', 'processing');
    else
      update public.developer_webhook_deliveries
      set status = 'failed',
          last_error = left(
            concat_ws('; ', nullif(last_error, ''), 'Developer integrations retired; delivery cancelled'),
            2000
          ),
          updated_at = now()
      where status in ('pending', 'processing');
    end if;
  end if;

  if to_regclass('public.developer_import_schedules') is not null then
    update public.developer_import_schedules
    set enabled = false,
        next_run_at = null,
        updated_at = now()
    where enabled or next_run_at is not null;
  end if;

  if to_regclass('public.developer_sync_runs') is not null then
    update public.developer_sync_runs
    set status = 'cancelled',
        error_summary = left(
          concat_ws('; ', nullif(error_summary, ''), 'Developer integrations retired; sync cancelled'),
          2000
        ),
        finished_at = coalesce(finished_at, now()),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'retirement_reason', 'developer_integrations_retired',
          'retired_at', now()
        )
    where status in ('queued', 'running');
  end if;

  -- Preserve read-only access for diagnostics while making the integration
  -- tables immutable to the application service role.  The table owner can
  -- still retain the historical records; no rows are deleted here.
  foreach table_name in array array[
    'developer_api_credentials',
    'developer_webhook_endpoints',
    'developer_webhook_deliveries',
    'developer_import_schedules',
    'developer_integration_field_mappings',
    'developer_sync_runs',
    'developer_sync_conflicts'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on table public.%I from service_role',
        table_name
      );
      execute format('grant select on table public.%I to service_role', table_name);
    end if;
  end loop;
end;
$$;

-- Existing lead/contact RPCs call this helper as part of their transaction.
-- Keep the signature for compatibility, but make it a zero-write no-op so a
-- mobile lead can never enqueue an external webhook after retirement.
do $$
declare
  procedure_name text;
begin
  if to_regprocedure('public.enqueue_developer_webhook_event(uuid,text,text,jsonb)') is not null then
    execute $ddl$
      create or replace function public.enqueue_developer_webhook_event(
        p_developer_id uuid,
        p_event_type text,
        p_event_key text,
        p_payload jsonb
      )
      returns integer
      language plpgsql
      security definer
      set search_path = public, extensions
      as $fn$
      begin
        return 0;
      end;
      $fn$;
    $ddl$;
  end if;

  foreach procedure_name in array array[
    'public.enqueue_developer_webhook_event(uuid,text,text,jsonb)',
    'public.create_developer_api_credential(uuid,uuid,text,text,text,text[],timestamptz)',
    'public.revoke_developer_api_credential(uuid,uuid,uuid)',
    'public.create_developer_webhook_endpoint(uuid,uuid,text,text,text,text[])',
    'public.create_developer_import_schedule(uuid,uuid,text,text,text,text,text,boolean,text,text)',
    'public.create_developer_sync_run(uuid,uuid,uuid,text,text,text)',
    'public.developer_webhook_url_is_safe(text)',
    'public.claim_developer_webhook_deliveries(integer)',
    'public.complete_developer_webhook_delivery(uuid,uuid,boolean,text)'
  ] loop
    if to_regprocedure(procedure_name) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        procedure_name
      );
    end if;
  end loop;
end;
$$;

commit;
