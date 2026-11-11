begin;

-- Keep this contract network-free even if an assertion or eligibility guard
-- regresses. The function replacement is reverted by the final rollback.
grant create on schema net to postgres;
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type":"application/json"}'::jsonb,
  timeout_milliseconds integer default 2000
)
returns bigint
language plpgsql
as $$
begin
  return -1;
end;
$$;

insert into auth.users(id) values
  ('98000000-0000-0000-0000-000000000001'),
  ('98000000-0000-0000-0000-000000000002'),
  ('98000000-0000-0000-0000-000000000003'),
  ('98000000-0000-0000-0000-000000000004'),
  ('98000000-0000-0000-0000-000000000005'),
  ('98000000-0000-0000-0000-000000000006'),
  ('98000000-0000-0000-0000-000000000007'),
  ('98000000-0000-0000-0000-000000000008');

insert into public.users_profile(
  id, first_name_en, last_name_en, first_name_ar, last_name_ar,
  phone, referral_code, account_status, notification_preferences
) values
  ('98000000-0000-0000-0000-000000000001', 'Opt', 'Out', 'Opt', 'Out', '+201098000001', 'PUSH980001', 'active', '{"push":true}'),
  ('98000000-0000-0000-0000-000000000002', 'Status', 'Inactive', 'Status', 'Inactive', '+201098000002', 'PUSH980002', 'active', '{"push":true}'),
  ('98000000-0000-0000-0000-000000000003', 'Already', 'OptedOut', 'Already', 'OptedOut', '+201098000003', 'PUSH980003', 'active', '{"push":false}'),
  ('98000000-0000-0000-0000-000000000004', 'Disabled', 'Token', 'Disabled', 'Token', '+201098000004', 'PUSH980004', 'active', '{"push":true}'),
  ('98000000-0000-0000-0000-000000000005', 'Reassigned', 'Token', 'Reassigned', 'Token', '+201098000005', 'PUSH980005', 'active', '{"push":true}'),
  ('98000000-0000-0000-0000-000000000006', 'Inactive', 'Account', 'Inactive', 'Account', '+201098000006', 'PUSH980006', 'suspended', '{"push":true}'),
  ('98000000-0000-0000-0000-000000000007', 'New', 'Owner', 'New', 'Owner', '+201098000007', 'PUSH980007', 'active', '{"push":true}'),
  ('98000000-0000-0000-0000-000000000008', 'Eligible', 'Agent', 'Eligible', 'Agent', '+201098000008', 'PUSH980008', 'active', '{"push":true}');

insert into public.deal_stage_entries(id, agent_id, stage, property_name) values
  ('98000000-0000-0000-0000-000000000101', '98000000-0000-0000-0000-000000000001', 'CIL', 'Private deal A'),
  ('98000000-0000-0000-0000-000000000102', '98000000-0000-0000-0000-000000000002', 'CIL', 'Private deal B'),
  ('98000000-0000-0000-0000-000000000103', '98000000-0000-0000-0000-000000000003', 'CIL', 'Private deal C'),
  ('98000000-0000-0000-0000-000000000104', '98000000-0000-0000-0000-000000000004', 'CIL', 'Private deal D'),
  ('98000000-0000-0000-0000-000000000105', '98000000-0000-0000-0000-000000000005', 'CIL', 'Private deal E'),
  ('98000000-0000-0000-0000-000000000106', '98000000-0000-0000-0000-000000000006', 'CIL', 'Private deal F'),
  ('98000000-0000-0000-0000-000000000108', '98000000-0000-0000-0000-000000000008', 'CIL', 'Hidden Property Name');

insert into public.support_tickets(id, agent_id, subject, description)
values ('98000000-0000-0000-0000-000000000301', '98000000-0000-0000-0000-000000000008', 'Private ticket subject', 'Private ticket description');

insert into public.device_push_tokens(id, agent_id, expo_push_token, platform, enabled) values
  ('98000000-0000-0000-0000-000000000401', '98000000-0000-0000-0000-000000000001', 'ExpoPushToken[push_test_opt_out]', 'android', true),
  ('98000000-0000-0000-0000-000000000402', '98000000-0000-0000-0000-000000000002', 'ExpoPushToken[push_test_account]', 'android', true),
  ('98000000-0000-0000-0000-000000000403', '98000000-0000-0000-0000-000000000004', 'ExpoPushToken[push_test_disabled]', 'ios', true),
  ('98000000-0000-0000-0000-000000000404', '98000000-0000-0000-0000-000000000005', 'ExpoPushToken[push_test_reassigned]', 'ios', true),
  ('98000000-0000-0000-0000-000000000405', '98000000-0000-0000-0000-000000000006', 'ExpoPushToken[push_test_inactive]', 'android', true),
  ('98000000-0000-0000-0000-000000000408', '98000000-0000-0000-0000-000000000008', 'ExpoPushToken[push_test_eligible]', 'ios', true);

insert into public.notifications(id, agent_id, type, title, message, related_entity_type, related_entity_id, action_url)
values
  ('98000000-0000-0000-0000-000000000201', '98000000-0000-0000-0000-000000000001', 'admin_message', 'Sales claim approved', 'Private deal detail and secret review reason.', 'deal_stage_entry', '98000000-0000-0000-0000-000000000101', '/deals'),
  ('98000000-0000-0000-0000-000000000202', '98000000-0000-0000-0000-000000000002', 'admin_message', 'Sales claim approved', 'Private deal detail and secret review reason.', 'deal_stage_entry', '98000000-0000-0000-0000-000000000102', '/deals'),
  ('98000000-0000-0000-0000-000000000203', '98000000-0000-0000-0000-000000000003', 'admin_message', 'Sales claim approved', 'Private deal detail and secret review reason.', 'deal_stage_entry', '98000000-0000-0000-0000-000000000103', '/deals'),
  ('98000000-0000-0000-0000-000000000204', '98000000-0000-0000-0000-000000000004', 'admin_message', 'Sales claim approved', 'Private deal detail and secret review reason.', 'deal_stage_entry', '98000000-0000-0000-0000-000000000104', '/deals'),
  ('98000000-0000-0000-0000-000000000205', '98000000-0000-0000-0000-000000000005', 'admin_message', 'Sales claim approved', 'Private deal detail and secret review reason.', 'deal_stage_entry', '98000000-0000-0000-0000-000000000105', '/deals'),
  ('98000000-0000-0000-0000-000000000206', '98000000-0000-0000-0000-000000000006', 'admin_message', 'Sales claim approved', 'Private deal detail and secret review reason.', 'deal_stage_entry', '98000000-0000-0000-0000-000000000106', '/deals'),
  ('98000000-0000-0000-0000-000000000208', '98000000-0000-0000-0000-000000000008', 'admin_message', 'Sales claim approved', 'Private deal detail: Hidden Property Name; reason: confidential.', 'deal_stage_entry', '98000000-0000-0000-0000-000000000108', '/deals'),
  ('98000000-0000-0000-0000-000000000209', '98000000-0000-0000-0000-000000000008', 'admin_message', 'Support replied', 'Secret support reply: private account details.', 'support_ticket', '98000000-0000-0000-0000-000000000301', '/support'),
  ('98000000-0000-0000-0000-000000000210', '98000000-0000-0000-0000-000000000008', 'admin_message', 'Support ticket updated', 'Your support ticket was marked resolved.', 'support_ticket', '98000000-0000-0000-0000-000000000301', '/support'),
  ('98000000-0000-0000-0000-000000000211', '98000000-0000-0000-0000-000000000008', 'admin_message', 'Sales claim approved', 'Private detail from another owner.', 'deal_stage_entry', '98000000-0000-0000-0000-000000000105', '/deals');

do $$
declare
  payload jsonb;
begin
  select request_payload into payload
  from public.push_delivery_batches
  where notification_id = '98000000-0000-0000-0000-000000000208';
  if payload #>> '{0,title}' <> 'Sales claim update'
     or payload #>> '{0,body}' <> 'Your sales claim has an update.'
     or payload #>> '{0,data,actionUrl}' <> '/deals'
     or payload::text like '%Hidden Property Name%'
     or payload::text like '%confidential%'
     or payload::text like '%Secret support reply%' then
    raise exception 'Deal push included private notification details or the wrong action';
  end if;

  select request_payload into payload
  from public.push_delivery_batches
  where notification_id = '98000000-0000-0000-0000-000000000209';
  if payload #>> '{0,title}' <> 'New support reply'
     or payload #>> '{0,body}' <> 'A support agent replied to your message.'
     or payload #>> '{0,data,actionUrl}' <> '/support'
     or payload::text like '%Secret support reply%'
     or payload::text like '%private account details%' then
    raise exception 'Support push included reply content or the wrong action';
  end if;

  if (select count(*) from public.push_delivery_batches where notification_id in (
        '98000000-0000-0000-0000-000000000208',
        '98000000-0000-0000-0000-000000000209'
      ) and status = 'prepared') <> 2 then
    raise exception 'Eligible deal and support notifications were not transactionally queued';
  end if;
  if exists (
    select 1 from public.push_delivery_batches
    where notification_id in (
      '98000000-0000-0000-0000-000000000210',
      '98000000-0000-0000-0000-000000000211'
    )
  ) then
    raise exception 'Support status or another agent’s deal produced a push';
  end if;
end;
$$;

update public.users_profile
set notification_preferences = jsonb_set(notification_preferences, '{push}', 'false'::jsonb)
where id = '98000000-0000-0000-0000-000000000001';
update public.users_profile
set account_status = 'suspended'
where id = '98000000-0000-0000-0000-000000000002';

do $$
begin
  if exists (
    select 1 from public.push_delivery_batches
    where notification_id in (
      '98000000-0000-0000-0000-000000000201',
      '98000000-0000-0000-0000-000000000202'
    ) and status <> 'cancelled'
  ) then
    raise exception 'Opt-out or account suspension did not cancel prepared pushes';
  end if;
end;
$$;

update public.device_push_tokens
set enabled = false
where id = '98000000-0000-0000-0000-000000000403';
update public.device_push_tokens
set agent_id = '98000000-0000-0000-0000-000000000007'
where id = '98000000-0000-0000-0000-000000000404';

update public.push_delivery_batches
set request_id = 980000000001,
    status = 'retry_wait',
    attempts = 1,
    next_retry_at = now() - interval '1 minute'
where notification_id in (
  '98000000-0000-0000-0000-000000000204',
  '98000000-0000-0000-0000-000000000205'
) and status = 'prepared';

insert into public.push_delivery_batches(
  campaign_id, notification_id, notification_batch_index, request_id,
  token_ids, request_payload, token_count, status, attempts, next_retry_at
) values
  (null, '98000000-0000-0000-0000-000000000203', 0, 980000000002, '{}', '[{"to":"ExpoPushToken[invalid_opted_out]","title":"Private prior payload"}]', 1, 'retry_wait', 1, now() - interval '1 minute'),
  (null, '98000000-0000-0000-0000-000000000206', 0, 980000000003, '{}', '[{"to":"ExpoPushToken[invalid_inactive]","title":"Private prior payload"}]', 1, 'retry_wait', 1, now() - interval '1 minute');

update public.device_push_tokens
set enabled = false
where id = '98000000-0000-0000-0000-000000000408';

do $$
declare
  dispatched integer;
begin
  dispatched := public.dispatch_transactional_notification_pushes();
  if dispatched <> 0 then
    raise exception 'Disabled device token was dispatched';
  end if;
  if exists (
    select 1 from public.push_delivery_batches
    where notification_id in (
      '98000000-0000-0000-0000-000000000208',
      '98000000-0000-0000-0000-000000000209'
    ) and (status <> 'cancelled' or request_id is not null)
  ) then
    raise exception 'Dispatcher did not cancel batches whose tokens were disabled';
  end if;
end;
$$;

do $$
declare
  retried integer;
begin
  if exists (
    select 1 from public.push_delivery_batches
    where status = 'retry_wait'
      and next_retry_at <= now()
      and notification_id not in (
        '98000000-0000-0000-0000-000000000203',
        '98000000-0000-0000-0000-000000000204',
        '98000000-0000-0000-0000-000000000205',
        '98000000-0000-0000-0000-000000000206'
      )
  ) then
    raise exception 'Test requires a database with no other due push retries';
  end if;

  retried := public.retry_due_push_delivery_batches();
  if retried <> 0 then
    raise exception 'Ineligible notification retries were submitted to Expo';
  end if;
  if exists (
    select 1 from public.push_delivery_batches
    where notification_id in (
      '98000000-0000-0000-0000-000000000203',
      '98000000-0000-0000-0000-000000000204',
      '98000000-0000-0000-0000-000000000205',
      '98000000-0000-0000-0000-000000000206'
    ) and status <> 'cancelled'
  ) then
    raise exception 'Retry did not cancel opted-out, inactive, disabled, or reassigned recipients';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('authenticated', 'public.dispatch_transactional_notification_pushes()', 'execute')
     or has_function_privilege('authenticated', 'public.retry_due_push_delivery_batches()', 'execute') then
    raise exception 'Authenticated clients can dispatch or retry push batches';
  end if;
  if not has_function_privilege('service_role', 'public.dispatch_transactional_notification_pushes()', 'execute')
     or not has_function_privilege('service_role', 'public.retry_due_push_delivery_batches()', 'execute') then
    raise exception 'Service role cannot dispatch or retry push batches';
  end if;
end;
$$;

rollback;
