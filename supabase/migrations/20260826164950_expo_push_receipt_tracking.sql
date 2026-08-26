begin;

alter table public.push_delivery_batches
  add column if not exists expo_ticket_map jsonb not null default '{}'::jsonb,
  add column if not exists ticket_error_count integer not null default 0,
  add column if not exists receipt_request_id bigint,
  add column if not exists receipt_attempts integer not null default 0,
  add column if not exists receipt_check_after timestamptz,
  add column if not exists receipt_response_status integer,
  add column if not exists receipt_response_body jsonb;

alter table public.push_delivery_batches
  drop constraint if exists push_delivery_batches_status_check;
alter table public.push_delivery_batches
  add constraint push_delivery_batches_status_check
  check (status in ('queued', 'retry_wait', 'ticketed', 'receipt_queued', 'delivered', 'partial', 'failed'));

alter table public.push_delivery_batches
  drop constraint if exists push_delivery_batches_receipt_attempts_check;
alter table public.push_delivery_batches
  add constraint push_delivery_batches_receipt_attempts_check
  check (receipt_attempts between 0 and 3);

drop index if exists public.push_delivery_batches_pending_idx;
create index push_delivery_batches_pending_idx
  on public.push_delivery_batches(status, next_retry_at, receipt_check_after)
  where status in ('queued', 'retry_wait', 'ticketed', 'receipt_queued');

create or replace function public.process_push_delivery_responses()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  delivery record;
  parsed jsonb;
  ticket_errors integer;
  ticket_map jsonb;
  receipt_errors integer;
  receipt_total integer;
  handled integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;

  for delivery in
    select batch.*, response.status_code, response.content, response.timed_out, response.error_msg
    from public.push_delivery_batches batch
    join net._http_response response on response.id = batch.request_id
    where batch.status = 'queued'
    order by batch.created_at
    limit 100
  loop
    begin
      parsed := nullif(delivery.content, '')::jsonb;
    exception when others then
      parsed := null;
    end;

    if delivery.timed_out or delivery.error_msg is not null or delivery.status_code = 429 or delivery.status_code >= 500 then
      update public.push_delivery_batches
      set status = case when attempts < 3 then 'retry_wait' else 'failed' end,
          response_status = delivery.status_code,
          response_body = parsed,
          error_message = coalesce(delivery.error_msg, 'Temporary Expo push service failure'),
          next_retry_at = case when attempts < 3 then now() + make_interval(mins => (2 ^ attempts)::integer) else null end,
          updated_at = now()
      where id = delivery.id;
    elsif delivery.status_code between 200 and 299 and jsonb_typeof(parsed->'data') = 'array' then
      with tickets as (
        select value as ticket, ordinality::integer as position
        from jsonb_array_elements(parsed->'data') with ordinality
      )
      select
        count(*) filter (where ticket->>'status' = 'error'),
        coalesce(
          jsonb_object_agg(ticket->>'id', delivery.token_ids[position]::text)
            filter (where ticket->>'status' = 'ok' and ticket->>'id' is not null),
          '{}'::jsonb
        )
      into ticket_errors, ticket_map
      from tickets;

      with tickets as (
        select value as ticket, ordinality::integer as position
        from jsonb_array_elements(parsed->'data') with ordinality
      )
      update public.device_push_tokens token
      set enabled = case when tickets.ticket#>>'{details,error}' = 'DeviceNotRegistered' then false else token.enabled end,
          last_error = case when tickets.ticket->>'status' = 'error' then coalesce(tickets.ticket->>'message', tickets.ticket#>>'{details,error}') else null end,
          updated_at = now()
      from tickets
      where token.id = delivery.token_ids[tickets.position];

      update public.push_delivery_batches
      set status = case when jsonb_object_length(ticket_map) > 0 then 'ticketed' else 'failed' end,
          response_status = delivery.status_code,
          response_body = parsed,
          expo_ticket_map = ticket_map,
          ticket_error_count = ticket_errors,
          receipt_check_after = case when jsonb_object_length(ticket_map) > 0 then now() + interval '15 minutes' else null end,
          error_message = case when ticket_errors > 0 then ticket_errors || ' push ticket(s) rejected before receipt tracking' else null end,
          updated_at = now()
      where id = delivery.id;
    else
      update public.push_delivery_batches
      set status = 'failed', response_status = delivery.status_code, response_body = parsed,
          error_message = coalesce(parsed#>>'{errors,0,message}', 'Expo push request rejected'), updated_at = now()
      where id = delivery.id;
    end if;
    handled := handled + 1;
  end loop;

  for delivery in
    select batch.*, response.status_code, response.content, response.timed_out, response.error_msg
    from public.push_delivery_batches batch
    join net._http_response response on response.id = batch.receipt_request_id
    where batch.status = 'receipt_queued'
    order by batch.updated_at
    limit 100
  loop
    begin
      parsed := nullif(delivery.content, '')::jsonb;
    exception when others then
      parsed := null;
    end;

    if delivery.timed_out or delivery.error_msg is not null or delivery.status_code = 429 or delivery.status_code >= 500 then
      update public.push_delivery_batches
      set status = case when receipt_attempts < 3 then 'ticketed' else 'failed' end,
          receipt_response_status = delivery.status_code,
          receipt_response_body = parsed,
          receipt_check_after = case when receipt_attempts < 3 then now() + make_interval(mins => (2 ^ receipt_attempts)::integer) else null end,
          error_message = coalesce(delivery.error_msg, 'Temporary Expo receipt service failure'),
          updated_at = now()
      where id = delivery.id;
    elsif delivery.status_code between 200 and 299 and jsonb_typeof(parsed->'data') = 'object' then
      select count(*), count(*) filter (where receipt.value->>'status' = 'error')
      into receipt_total, receipt_errors
      from jsonb_each(parsed->'data') receipt;

      update public.device_push_tokens token
      set enabled = case when receipt.value#>>'{details,error}' = 'DeviceNotRegistered' then false else token.enabled end,
          last_error = case when receipt.value->>'status' = 'error' then coalesce(receipt.value->>'message', receipt.value#>>'{details,error}') else null end,
          updated_at = now()
      from jsonb_each(parsed->'data') receipt
      where token.id = nullif(delivery.expo_ticket_map->>receipt.key, '')::uuid;

      update public.push_delivery_batches
      set status = case
            when receipt_total = 0 then 'failed'
            when receipt_errors = 0 and receipt_total = jsonb_object_length(expo_ticket_map) then 'delivered'
            when receipt_errors < receipt_total then 'partial'
            else 'failed'
          end,
          receipt_response_status = delivery.status_code,
          receipt_response_body = parsed,
          error_message = case
            when receipt_errors > 0 then receipt_errors || ' Expo receipt(s) reported delivery errors'
            when receipt_total < jsonb_object_length(expo_ticket_map) then 'Expo receipt response was incomplete'
            else null
          end,
          receipt_check_after = null,
          updated_at = now()
      where id = delivery.id;
    else
      update public.push_delivery_batches
      set status = 'failed', receipt_response_status = delivery.status_code, receipt_response_body = parsed,
          error_message = coalesce(parsed#>>'{errors,0,message}', 'Expo receipt request rejected'), updated_at = now()
      where id = delivery.id;
    end if;
    handled := handled + 1;
  end loop;

  return handled;
end;
$$;

create or replace function public.queue_due_push_receipts()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  delivery record;
  receipt_ids jsonb;
  net_request_id bigint;
  queued integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;

  for delivery in
    select * from public.push_delivery_batches
    where status = 'ticketed'
      and receipt_check_after <= now()
      and receipt_attempts < 3
      and jsonb_object_length(expo_ticket_map) > 0
    order by receipt_check_after
    limit 50
    for update skip locked
  loop
    select jsonb_agg(key order by key) into receipt_ids
    from jsonb_object_keys(delivery.expo_ticket_map) key;

    net_request_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/getReceipts',
      body := jsonb_build_object('ids', receipt_ids),
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );

    update public.push_delivery_batches
    set receipt_request_id = net_request_id,
        receipt_attempts = receipt_attempts + 1,
        status = 'receipt_queued',
        receipt_response_status = null,
        receipt_response_body = null,
        updated_at = now()
    where id = delivery.id;
    queued := queued + 1;
  end loop;

  return queued;
end;
$$;

revoke all on function public.queue_due_push_receipts() from public, anon, authenticated;
grant execute on function public.queue_due_push_receipts() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'brixeler-push-delivery-responses') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'brixeler-push-delivery-responses'));
  end if;
  perform cron.schedule(
    'brixeler-push-delivery-responses',
    '* * * * *',
    'select public.process_push_delivery_responses(); select public.retry_due_push_delivery_batches(); select public.queue_due_push_receipts(); select public.process_push_delivery_responses();'
  );
end;
$$;

commit;
