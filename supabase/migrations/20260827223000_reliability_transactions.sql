begin;

create or replace function public.create_support_ticket_with_message(
  p_subject text,
  p_category text,
  p_priority text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_id uuid := auth.uid();
  ticket_id uuid;
  subject_value text := btrim(coalesce(p_subject, ''));
  description_value text := btrim(coalesce(p_description, ''));
begin
  if caller_id is null or not public.current_account_not_suspended() then
    raise exception 'Active authentication required';
  end if;
  if char_length(subject_value) not between 1 and 300 then
    raise exception 'Subject must contain between 1 and 300 characters';
  end if;
  if char_length(description_value) not between 1 and 20000 then
    raise exception 'Description must contain between 1 and 20000 characters';
  end if;
  if p_category not in ('verification', 'deal', 'payout', 'technical', 'property', 'property_request', 'other') then
    raise exception 'Invalid support category';
  end if;
  if p_priority not in ('normal', 'high', 'urgent') then
    raise exception 'Invalid support priority';
  end if;

  insert into public.support_tickets(
    agent_id, subject, category, priority, description, channel, status,
    last_message_preview, last_message_at
  ) values (
    caller_id, subject_value, p_category, p_priority, description_value, 'in_app', 'new',
    description_value, now()
  ) returning id into ticket_id;

  insert into public.support_ticket_messages(ticket_id, author_type, author_id, message)
  values (ticket_id, 'agent', caller_id, description_value);

  return ticket_id;
end;
$$;

revoke all on function public.create_support_ticket_with_message(text, text, text, text) from public, anon;
grant execute on function public.create_support_ticket_with_message(text, text, text, text) to authenticated;

create or replace function public.create_developer_contact_request_with_notification(
  p_developer_id uuid,
  p_project_id uuid,
  p_property_id uuid,
  p_requester_user_id uuid,
  p_request_type text,
  p_request_body text,
  p_requester_display_name text,
  p_requester_email text,
  p_requester_phone text,
  p_requester_total_deals integer,
  p_developer_name_snapshot text,
  p_project_name_snapshot text,
  p_property_name_snapshot text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_id uuid;
begin
  if p_request_type not in ('call', 'meeting') then
    raise exception 'Invalid request type';
  end if;

  insert into public.developer_contact_requests(
    developer_id, project_id, property_id, requester_user_id, request_type,
    request_body, requester_display_name, requester_email, requester_phone,
    requester_total_deals, developer_name_snapshot, project_name_snapshot,
    property_name_snapshot
  ) values (
    p_developer_id, p_project_id, p_property_id, p_requester_user_id, p_request_type,
    p_request_body, p_requester_display_name, p_requester_email, p_requester_phone,
    coalesce(p_requester_total_deals, 0), p_developer_name_snapshot, p_project_name_snapshot,
    p_property_name_snapshot
  ) returning id into request_id;

  insert into public.developer_notifications(
    developer_id, contact_request_id, title, message
  ) values (
    p_developer_id,
    request_id,
    format('%s request from %s', case when p_request_type = 'meeting' then 'Meeting' else 'Call' end, p_requester_display_name),
    format('%s: %s', p_project_name_snapshot, p_request_body)
  );

  return request_id;
end;
$$;

revoke all on function public.create_developer_contact_request_with_notification(uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.create_developer_contact_request_with_notification(uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text, text) to service_role;

create or replace function public.update_developer_contact_request_with_notification(
  p_developer_id uuid,
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_row public.developer_contact_requests%rowtype;
begin
  if p_status not in ('open', 'contacted', 'closed') then
    raise exception 'Invalid request status';
  end if;

  select * into request_row
  from public.developer_contact_requests
  where id = p_request_id and developer_id = p_developer_id
  for update;
  if not found then raise exception 'Contact request not found'; end if;

  update public.developer_contact_requests
  set status = p_status, updated_at = now()
  where id = p_request_id;

  insert into public.notifications(
    agent_id, type, title, message, action_url,
    related_entity_type, related_entity_id
  ) values (
    request_row.requester_user_id,
    'admin_message',
    'Developer request updated',
    format('Your %s request is now %s.', request_row.project_name_snapshot, p_status),
    '/properties',
    'developer_contact_request',
    request_row.id
  );
end;
$$;

revoke all on function public.update_developer_contact_request_with_notification(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.update_developer_contact_request_with_notification(uuid, uuid, text) to service_role;

create or replace function public.admin_reply_to_support_ticket(
  p_ticket_id uuid,
  p_admin_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ticket_row public.support_tickets%rowtype;
  message_value text := btrim(coalesce(p_message, ''));
begin
  if not exists (select 1 from public.admins where id = p_admin_id and is_active) then
    raise exception 'Active admin required';
  end if;
  if char_length(message_value) not between 1 and 20000 then
    raise exception 'Reply must contain between 1 and 20000 characters';
  end if;

  select * into ticket_row from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Support ticket not found'; end if;

  insert into public.support_ticket_messages(ticket_id, author_type, author_id, message)
  values (p_ticket_id, 'admin', p_admin_id, message_value);

  update public.support_tickets
  set status = 'waiting_agent',
      assigned_to = p_admin_id,
      first_response_at = coalesce(first_response_at, now()),
      updated_at = now()
  where id = p_ticket_id;

  insert into public.notifications(
    agent_id, type, title, message, related_entity_type,
    related_entity_id, action_url
  ) values (
    ticket_row.agent_id, 'admin_message', 'Support replied', left(message_value, 240),
    'support_ticket', p_ticket_id, '/support'
  );
end;
$$;

revoke all on function public.admin_reply_to_support_ticket(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_reply_to_support_ticket(uuid, uuid, text) to service_role;

commit;
