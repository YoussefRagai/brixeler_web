begin;

-- Reuse the Expo delivery pipeline for operational notifications while making
-- creation of each push batch part of the in-app notification transaction.
alter table public.push_delivery_batches
  alter column campaign_id drop not null,
  alter column request_id drop not null;

alter table public.push_delivery_batches
  add column notification_id uuid references public.notifications(id) on delete cascade,
  add column notification_batch_index integer;

alter table public.push_delivery_batches
  drop constraint push_delivery_batches_status_check,
  add constraint push_delivery_batches_status_check
    check (status in ('prepared', 'queued', 'retry_wait', 'ticketed', 'receipt_queued', 'delivered', 'partial', 'failed', 'cancelled')),
  drop constraint push_delivery_batches_attempts_check,
  add constraint push_delivery_batches_attempts_check
    check (attempts between 0 and 3),
  add constraint push_delivery_batches_source_check
    check (
      (campaign_id is not null and notification_id is null and notification_batch_index is null)
      or (
        campaign_id is null
        and notification_id is not null
        and notification_batch_index is not null
        and notification_batch_index >= 0
      )
    ),
  add constraint push_delivery_batches_request_status_check
    check (
      (status = 'prepared' and notification_id is not null and request_id is null)
      or (status = 'cancelled' and notification_id is not null)
      or (status not in ('prepared', 'cancelled') and request_id is not null)
    );

drop index if exists public.push_delivery_batches_pending_idx;
create index push_delivery_batches_pending_idx
  on public.push_delivery_batches(status, next_retry_at, receipt_check_after)
  where status in ('prepared', 'queued', 'retry_wait', 'ticketed', 'receipt_queued');

create unique index push_delivery_batches_notification_idx
  on public.push_delivery_batches(notification_id, notification_batch_index)
  where notification_id is not null;

create or replace function public.enqueue_transactional_notification_pushes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  push_title text;
  push_body text;
  push_action_url text;
  push_preference text;
  push_batch record;
begin
  if new.type::text <> 'admin_message' or new.is_demo then
    return new;
  end if;

  if new.related_entity_type = 'deal_stage_entry' then
    if new.related_entity_id is null or not exists (
      select 1
      from public.deal_stage_entries entry
      where entry.id = new.related_entity_id
        and entry.agent_id = new.agent_id
        and not entry.is_demo
    ) then
      return new;
    end if;
    push_title := 'Sales claim update';
    push_body := 'Your sales claim has an update.';
    push_action_url := '/deals';
  elsif new.related_entity_type = 'support_ticket' and new.title = 'Support replied' then
    if new.related_entity_id is null or not exists (
      select 1
      from public.support_tickets ticket
      where ticket.id = new.related_entity_id
        and ticket.agent_id = new.agent_id
        and not ticket.is_demo
    ) then
      return new;
    end if;
    push_title := 'New support reply';
    push_body := 'A support agent replied to your message.';
    push_action_url := '/support';
  else
    return new;
  end if;

  select profile.notification_preferences ->> 'push'
  into push_preference
  from public.users_profile profile
  where profile.id = new.agent_id
    and profile.account_status = 'active'
  for share of profile;

  if not found or push_preference is distinct from 'true' then
    return new;
  end if;

  perform token.id
  from public.device_push_tokens token
  where token.agent_id = new.agent_id
    and token.enabled
  order by token.id
  for share;

  for push_batch in
    with eligible_tokens as (
      select
        token.id,
        token.expo_push_token,
        row_number() over (order by token.id) - 1 as position
      from public.device_push_tokens token
      where token.agent_id = new.agent_id
        and token.enabled
    )
    select
      (position / 100)::integer as batch_index,
      array_agg(id order by position) as token_ids,
      jsonb_agg(
        jsonb_build_object(
          'to', expo_push_token,
          'title', push_title,
          'body', push_body,
          'sound', 'default',
          'priority', 'high',
          'channelId', 'brixeler-default',
          'data', jsonb_build_object('actionUrl', push_action_url)
        ) order by position
      ) as payload
    from eligible_tokens
    group by (position / 100)::integer
    order by (position / 100)::integer
  loop
    insert into public.push_delivery_batches(
      campaign_id,
      notification_id,
      notification_batch_index,
      request_id,
      token_ids,
      request_payload,
      token_count,
      status,
      attempts
    ) values (
      null,
      new.id,
      push_batch.batch_index,
      null,
      push_batch.token_ids,
      push_batch.payload,
      cardinality(push_batch.token_ids),
      'prepared',
      0
    )
    on conflict (notification_id, notification_batch_index)
      where notification_id is not null
      do nothing;
  end loop;

  return new;
end;
$$;

revoke all on function public.enqueue_transactional_notification_pushes() from public, anon, authenticated;
grant execute on function public.enqueue_transactional_notification_pushes() to service_role;

drop trigger if exists notifications_transactional_push on public.notifications;
create trigger notifications_transactional_push
after insert on public.notifications
for each row execute function public.enqueue_transactional_notification_pushes();

create or replace function public.dispatch_transactional_notification_pushes()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  delivery record;
  notification_row record;
  eligible_token_ids uuid[];
  payload jsonb;
  request_id_value bigint;
  dispatched integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;

  for delivery in
    select id, notification_id
    from public.push_delivery_batches
    where status = 'prepared'
      and notification_id is not null
      and request_id is null
    order by created_at
    limit 100
  loop
    select notification.agent_id, notification.related_entity_type
    into notification_row
    from public.notifications notification
    join public.users_profile profile
      on profile.id = notification.agent_id
    where notification.id = delivery.notification_id
      and notification.type::text = 'admin_message'
      and not notification.is_demo
      and profile.account_status = 'active'
      and profile.notification_preferences ->> 'push' = 'true'
      and (
        (
          notification.related_entity_type = 'deal_stage_entry'
          and exists (
            select 1
            from public.deal_stage_entries entry
            where entry.id = notification.related_entity_id
              and entry.agent_id = notification.agent_id
              and not entry.is_demo
          )
        )
        or (
          notification.related_entity_type = 'support_ticket'
          and notification.title = 'Support replied'
          and exists (
            select 1
            from public.support_tickets ticket
            where ticket.id = notification.related_entity_id
              and ticket.agent_id = notification.agent_id
              and not ticket.is_demo
          )
        )
      )
    for share of profile;

    if not found then
      update public.push_delivery_batches
      set status = 'cancelled',
          error_message = 'Notification is no longer eligible for push delivery',
          updated_at = now()
      where id = delivery.id
        and status = 'prepared';
      continue;
    end if;

    select * into delivery
    from public.push_delivery_batches batch
    where batch.id = delivery.id
      and batch.status = 'prepared'
      and batch.request_id is null
    for update skip locked;
    if not found then
      continue;
    end if;

    perform token.id
    from public.device_push_tokens token
    where token.id = any(delivery.token_ids)
    order by token.id
    for share;

    select
      array_agg(token.id order by token.id),
      jsonb_agg(
        jsonb_build_object(
          'to', token.expo_push_token,
          'title', case
            when notification_row.related_entity_type = 'deal_stage_entry' then 'Sales claim update'
            else 'New support reply'
          end,
          'body', case
            when notification_row.related_entity_type = 'deal_stage_entry' then 'Your sales claim has an update.'
            else 'A support agent replied to your message.'
          end,
          'sound', 'default',
          'priority', 'high',
          'channelId', 'brixeler-default',
          'data', jsonb_build_object(
            'actionUrl', case
              when notification_row.related_entity_type = 'deal_stage_entry' then '/deals'
              else '/support'
            end
          )
        ) order by token.id
      )
    into eligible_token_ids, payload
    from public.device_push_tokens token
    where token.id = any(delivery.token_ids)
      and token.agent_id = notification_row.agent_id
      and token.enabled;

    if coalesce(cardinality(eligible_token_ids), 0) = 0 then
      update public.push_delivery_batches
      set status = 'cancelled',
          error_message = 'No opted-in device remains enabled for push delivery',
          updated_at = now()
      where id = delivery.id;
      continue;
    end if;

    request_id_value := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := payload,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );

    if request_id_value is null then
      raise exception 'Expo push request was not queued';
    end if;

    update public.push_delivery_batches
    set request_id = request_id_value,
        token_ids = eligible_token_ids,
        request_payload = payload,
        token_count = cardinality(eligible_token_ids),
        status = 'queued',
        attempts = 1,
        next_retry_at = null,
        error_message = null,
        updated_at = now()
    where id = delivery.id
      and status = 'prepared'
      and request_id is null;
    if found then
      update public.notifications
      set push_sent = true
      where id = delivery.notification_id;
      dispatched := dispatched + 1;
    end if;
  end loop;

  return dispatched;
end;
$$;

revoke all on function public.dispatch_transactional_notification_pushes() from public, anon, authenticated;
grant execute on function public.dispatch_transactional_notification_pushes() to service_role;

-- Campaign retries keep their original payload semantics. Transactional
-- notification retries rebuild recipients from current ownership and consent.
create or replace function public.retry_due_push_delivery_batches()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  candidate record;
  delivery record;
  notification_row record;
  eligible_token_ids uuid[];
  payload jsonb;
  net_request_id bigint;
  retried integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;

  for candidate in
    select id, notification_id
    from public.push_delivery_batches
    where status = 'retry_wait'
      and next_retry_at <= now()
      and attempts < 3
    order by next_retry_at
    limit 50
  loop
    if candidate.notification_id is not null then
      select notification.agent_id, notification.related_entity_type
      into notification_row
      from public.notifications notification
      join public.users_profile profile
        on profile.id = notification.agent_id
      where notification.id = candidate.notification_id
        and notification.type::text = 'admin_message'
        and not notification.is_demo
        and profile.account_status = 'active'
        and profile.notification_preferences ->> 'push' = 'true'
        and (
          (
            notification.related_entity_type = 'deal_stage_entry'
            and exists (
              select 1
              from public.deal_stage_entries entry
              where entry.id = notification.related_entity_id
                and entry.agent_id = notification.agent_id
                and not entry.is_demo
            )
          )
          or (
            notification.related_entity_type = 'support_ticket'
            and notification.title = 'Support replied'
            and exists (
              select 1
              from public.support_tickets ticket
              where ticket.id = notification.related_entity_id
                and ticket.agent_id = notification.agent_id
                and not ticket.is_demo
            )
          )
        )
      for share of profile;

      if not found then
        update public.push_delivery_batches
        set status = 'cancelled',
            error_message = 'Notification is no longer eligible for push retry',
            updated_at = now()
        where id = candidate.id
          and status = 'retry_wait';
        continue;
      end if;
    end if;

    select * into delivery
    from public.push_delivery_batches batch
    where batch.id = candidate.id
      and batch.status = 'retry_wait'
      and batch.next_retry_at <= now()
      and batch.attempts < 3
    for update skip locked;
    if not found then
      continue;
    end if;

    if delivery.notification_id is null then
      -- Preserve the existing campaign delivery behavior.
      net_request_id := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := delivery.request_payload,
        headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
        timeout_milliseconds := 10000
      );

      update public.push_delivery_batches
      set request_id = net_request_id,
          status = 'queued',
          attempts = attempts + 1,
          response_status = null,
          response_body = null,
          error_message = null,
          next_retry_at = null,
          updated_at = now()
      where id = delivery.id;
      retried := retried + 1;
      continue;
    end if;

    perform token.id
    from public.device_push_tokens token
    where token.id = any(delivery.token_ids)
    order by token.id
    for share;

    select
      array_agg(token.id order by token.id),
      jsonb_agg(
        jsonb_build_object(
          'to', token.expo_push_token,
          'title', case
            when notification_row.related_entity_type = 'deal_stage_entry' then 'Sales claim update'
            else 'New support reply'
          end,
          'body', case
            when notification_row.related_entity_type = 'deal_stage_entry' then 'Your sales claim has an update.'
            else 'A support agent replied to your message.'
          end,
          'sound', 'default',
          'priority', 'high',
          'channelId', 'brixeler-default',
          'data', jsonb_build_object(
            'actionUrl', case
              when notification_row.related_entity_type = 'deal_stage_entry' then '/deals'
              else '/support'
            end
          )
        ) order by token.id
      )
    into eligible_token_ids, payload
    from public.device_push_tokens token
    where token.id = any(delivery.token_ids)
      and token.agent_id = notification_row.agent_id
      and token.enabled;

    if coalesce(cardinality(eligible_token_ids), 0) = 0 then
      update public.push_delivery_batches
      set status = 'cancelled',
          error_message = 'No opted-in device remains enabled for push retry',
          updated_at = now()
      where id = delivery.id;
      continue;
    end if;

    net_request_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := payload,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
    if net_request_id is null then
      raise exception 'Expo push retry was not queued';
    end if;

    update public.push_delivery_batches
    set request_id = net_request_id,
        token_ids = eligible_token_ids,
        request_payload = payload,
        token_count = cardinality(eligible_token_ids),
        status = 'queued',
        attempts = attempts + 1,
        response_status = null,
        response_body = null,
        error_message = null,
        next_retry_at = null,
        updated_at = now()
    where id = delivery.id;
    retried := retried + 1;
  end loop;

  return retried;
end;
$$;

revoke all on function public.retry_due_push_delivery_batches() from public, anon, authenticated;
grant execute on function public.retry_due_push_delivery_batches() to service_role;

create or replace function public.cancel_prepared_notification_pushes_on_opt_out()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if (
    old.notification_preferences ->> 'push' = 'true'
    and new.notification_preferences ->> 'push' is distinct from 'true'
  ) or (
    old.account_status = 'active'
    and new.account_status is distinct from 'active'
  ) then
    update public.push_delivery_batches batch
    set status = 'cancelled',
        error_message = 'Recipient is no longer eligible for push delivery',
        updated_at = now()
    where batch.status in ('prepared', 'retry_wait')
      and batch.notification_id in (
        select notification.id
        from public.notifications notification
        where notification.agent_id = new.id
      );
  end if;

  return new;
end;
$$;

revoke all on function public.cancel_prepared_notification_pushes_on_opt_out() from public, anon, authenticated;
grant execute on function public.cancel_prepared_notification_pushes_on_opt_out() to service_role;

drop trigger if exists users_profile_cancel_prepared_notification_pushes on public.users_profile;
create trigger users_profile_cancel_prepared_notification_pushes
after update of notification_preferences, account_status on public.users_profile
for each row
when (
  old.notification_preferences ->> 'push' is distinct from new.notification_preferences ->> 'push'
  or old.account_status is distinct from new.account_status
)
execute function public.cancel_prepared_notification_pushes_on_opt_out();

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'brixeler-transactional-notification-pushes'
  ) then
    perform cron.schedule(
      'brixeler-transactional-notification-pushes',
      '* * * * *',
      'select public.dispatch_transactional_notification_pushes();'
    );
  end if;
end;
$$;

commit;
