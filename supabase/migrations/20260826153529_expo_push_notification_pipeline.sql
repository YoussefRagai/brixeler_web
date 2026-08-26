begin;

create extension if not exists pg_net with schema extensions;

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete cascade,
  expo_push_token text not null unique check (expo_push_token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  device_label text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_push_tokens_agent_enabled_idx
  on public.device_push_tokens(agent_id, enabled);

create table public.push_delivery_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.notification_campaigns(id) on delete cascade,
  request_id bigint not null,
  token_ids uuid[] not null,
  request_payload jsonb not null,
  token_count integer not null check (token_count > 0 and token_count <= 100),
  status text not null default 'queued' check (status in ('queued', 'retry_wait', 'delivered', 'partial', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 3),
  response_status integer,
  response_body jsonb,
  error_message text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_delivery_batches_campaign_idx on public.push_delivery_batches(campaign_id, created_at desc);
create index push_delivery_batches_pending_idx on public.push_delivery_batches(status, next_retry_at)
  where status in ('queued', 'retry_wait');

alter table public.notification_campaigns
  add column if not exists push_recipient_count integer not null default 0,
  add column if not exists push_batch_count integer not null default 0;

alter table public.device_push_tokens enable row level security;
alter table public.device_push_tokens force row level security;
alter table public.push_delivery_batches enable row level security;
alter table public.push_delivery_batches force row level security;

revoke all on public.device_push_tokens, public.push_delivery_batches from public, anon, authenticated;
grant all on public.device_push_tokens, public.push_delivery_batches to service_role;

create policy device_push_tokens_service_role on public.device_push_tokens
  for all to service_role using (true) with check (true);
create policy push_delivery_batches_service_role on public.push_delivery_batches
  for all to service_role using (true) with check (true);

create or replace function public.register_device_push_token(
  p_token text,
  p_platform text,
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_id uuid := auth.uid();
  token_id uuid;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_token is null or p_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid Expo push token';
  end if;
  if p_platform not in ('ios', 'android') then raise exception 'Invalid device platform'; end if;

  insert into public.device_push_tokens(agent_id, expo_push_token, platform, device_label)
  values (caller_id, p_token, p_platform, nullif(btrim(p_device_label), ''))
  on conflict (expo_push_token) do update
  set agent_id = excluded.agent_id,
      platform = excluded.platform,
      device_label = excluded.device_label,
      enabled = true,
      last_seen_at = now(),
      last_error = null,
      updated_at = now()
  returning id into token_id;
  return token_id;
end;
$$;

create or replace function public.unregister_device_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_id uuid := auth.uid();
  affected integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  update public.device_push_tokens
  set enabled = false, updated_at = now()
  where agent_id = caller_id and expo_push_token = p_token;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function public.disable_my_push_tokens()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_id uuid := auth.uid();
  affected integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  update public.device_push_tokens set enabled = false, updated_at = now() where agent_id = caller_id and enabled;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.register_device_push_token(text, text, text) from public, anon;
revoke all on function public.unregister_device_push_token(text) from public, anon;
revoke all on function public.disable_my_push_tokens() from public, anon;
grant execute on function public.register_device_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_device_push_token(text) to authenticated;
grant execute on function public.disable_my_push_tokens() to authenticated;

create or replace function public.enqueue_campaign_pushes(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  campaign public.notification_campaigns%rowtype;
  batch record;
  queued integer := 0;
  batch_count integer := 0;
  net_request_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  select * into campaign from public.notification_campaigns where id = p_campaign_id;
  if not found then raise exception 'Campaign not found'; end if;
  if campaign.channel <> 'in_app_push' then return 0; end if;

  for batch in
    with eligible as (
      select
        token.id,
        token.expo_push_token,
        row_number() over (order by token.id) - 1 as position
      from public.device_push_tokens token
      join public.users_profile agent on agent.id = token.agent_id
      where token.enabled
        and agent.account_status = 'active'
        and (
          campaign.audience = 'all'
          or (campaign.audience = 'verified' and agent.verification_status = 'verified')
          or (campaign.audience = 'no_deals' and coalesce(agent.total_deals, 0) = 0)
          or (
            campaign.audience = 'waiting_payment'
            and exists (select 1 from public.deals d where d.agent_id = agent.id and d.status in ('approved', 'confirmed', 'awaiting_payment'))
          )
        )
    )
    select
      array_agg(id order by position) as token_ids,
      jsonb_agg(
        jsonb_build_object(
          'to', expo_push_token,
          'title', campaign.title,
          'body', campaign.message,
          'sound', 'default',
          'priority', 'high',
          'channelId', 'brixeler-default',
          'data', jsonb_build_object(
            'actionUrl', coalesce(campaign.action_url, '/'),
            'campaignId', campaign.id::text
          )
        ) order by position
      ) as payload
    from eligible
    group by floor(position / 100)
    order by floor(position / 100)
  loop
    net_request_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := batch.payload,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
    insert into public.push_delivery_batches(campaign_id, request_id, token_ids, request_payload, token_count)
    values (campaign.id, net_request_id, batch.token_ids, batch.payload, cardinality(batch.token_ids));
    queued := queued + cardinality(batch.token_ids);
    batch_count := batch_count + 1;
  end loop;

  update public.notification_campaigns
  set push_recipient_count = queued, push_batch_count = batch_count, updated_at = now()
  where id = campaign.id;
  update public.notifications notification
  set push_sent = true
  where notification.related_entity_type = 'notification_campaign'
    and notification.related_entity_id = campaign.id
    and exists (
      select 1 from public.device_push_tokens token
      where token.agent_id = notification.agent_id and token.enabled
    );
  return queued;
end;
$$;

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
      select count(*) into ticket_errors
      from jsonb_array_elements(parsed->'data') ticket
      where ticket->>'status' = 'error';

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
      set status = case when ticket_errors = 0 then 'delivered' when ticket_errors < token_count then 'partial' else 'failed' end,
          response_status = delivery.status_code,
          response_body = parsed,
          error_message = case when ticket_errors > 0 then ticket_errors || ' push ticket(s) failed' else null end,
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
  return handled;
end;
$$;

create or replace function public.retry_due_push_delivery_batches()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  delivery record;
  net_request_id bigint;
  retried integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  for delivery in
    select * from public.push_delivery_batches
    where status = 'retry_wait' and next_retry_at <= now() and attempts < 3
    order by next_retry_at
    limit 50
    for update skip locked
  loop
    net_request_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := delivery.request_payload,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
    update public.push_delivery_batches
    set request_id = net_request_id, status = 'queued', attempts = attempts + 1,
        response_status = null, response_body = null, error_message = null,
        next_retry_at = null, updated_at = now()
    where id = delivery.id;
    retried := retried + 1;
  end loop;
  return retried;
end;
$$;

revoke all on function public.enqueue_campaign_pushes(uuid) from public, anon, authenticated;
revoke all on function public.process_push_delivery_responses() from public, anon, authenticated;
revoke all on function public.retry_due_push_delivery_batches() from public, anon, authenticated;
grant execute on function public.enqueue_campaign_pushes(uuid) to service_role;
grant execute on function public.process_push_delivery_responses() to service_role;
grant execute on function public.retry_due_push_delivery_batches() to service_role;

create or replace function public.dispatch_notification_campaign(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  campaign public.notification_campaigns%rowtype;
  inserted_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  select * into campaign from public.notification_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if campaign.status not in ('scheduled', 'failed') then return campaign.recipient_count; end if;
  if campaign.scheduled_for > now() then return 0; end if;

  update public.notification_campaigns set status = 'processing', updated_at = now(), error_message = null where id = campaign.id;
  insert into public.notifications (
    agent_id, type, title, message, action_url, push_sent,
    related_entity_type, related_entity_id, is_demo, demo_batch
  )
  select
    agent.id, 'admin_message'::public.notification_type, campaign.title, campaign.message,
    campaign.action_url, false, 'notification_campaign', campaign.id, campaign.is_demo, campaign.demo_batch
  from public.users_profile agent
  where agent.account_status = 'active'
    and (
      campaign.audience = 'all'
      or (campaign.audience = 'verified' and agent.verification_status = 'verified')
      or (campaign.audience = 'no_deals' and coalesce(agent.total_deals, 0) = 0)
      or (
        campaign.audience = 'waiting_payment'
        and exists (select 1 from public.deals d where d.agent_id = agent.id and d.status in ('approved', 'confirmed', 'awaiting_payment'))
      )
    );
  get diagnostics inserted_count = row_count;

  update public.notification_campaigns
  set status = 'sent', recipient_count = inserted_count, sent_at = now(), updated_at = now()
  where id = campaign.id;
  if campaign.channel = 'in_app_push' then perform public.enqueue_campaign_pushes(campaign.id); end if;
  return inserted_count;
exception when others then
  update public.notification_campaigns set status = 'failed', error_message = sqlerrm, updated_at = now() where id = p_campaign_id;
  raise;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'brixeler-push-delivery-responses') then
    perform cron.schedule(
      'brixeler-push-delivery-responses',
      '* * * * *',
      'select public.process_push_delivery_responses(); select public.retry_due_push_delivery_batches();'
    );
  end if;
end;
$$;

commit;
