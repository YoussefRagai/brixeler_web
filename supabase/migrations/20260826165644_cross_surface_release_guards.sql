begin;

-- Developer portal writes are server-mediated with tenant checks. Removing
-- direct authenticated mutations prevents a developer JWT from setting its
-- own moderation fields or bypassing the pending-review triggers.
revoke insert, update, delete on public.developer_projects from authenticated;
revoke insert, update, delete on public.project_unit_types from authenticated;
revoke insert, update, delete on public.project_unit_variants from authenticated;

drop policy if exists properties_select_combined on public.properties;
create policy properties_select_combined
on public.properties
for select
to public
using (
  (
    approval_status = 'approved'
    and is_active = true
    and (
      project_id is null
      or exists (
        select 1 from public.developer_projects project
        where project.id = properties.project_id
          and project.approval_status = 'approved'
      )
    )
  )
  or auth.uid() = listed_by_agent_id
  or exists (
    select 1 from public.admins admin
    where admin.id = auth.uid() and admin.is_active
  )
);

drop policy if exists support_ticket_messages_agent_insert on public.support_ticket_messages;
create policy support_ticket_messages_agent_insert
on public.support_ticket_messages
for insert
to authenticated
with check (
  author_type = 'agent'
  and author_id = auth.uid()
  and exists (
    select 1 from public.support_tickets ticket
    where ticket.id = support_ticket_messages.ticket_id
      and ticket.agent_id = auth.uid()
      and ticket.status <> 'closed'
  )
);

update public.notifications
set action_url = '/properties'
where action_url like '/properties/%';

create or replace function public.enqueue_agent_notification(
  p_agent_id uuid,
  p_title text,
  p_message text,
  p_property_id uuid
)
returns void
language plpgsql
set search_path = public, extensions
as $$
begin
  if p_agent_id is null then return; end if;
  insert into public.notifications(
    agent_id, type, title, message, related_entity_type, related_entity_id, action_url
  ) values (
    p_agent_id, 'admin_message', p_title, p_message, 'property', p_property_id, '/properties'
  );
exception when others then
  raise notice 'notification insert skipped for agent % (% %)', p_agent_id, p_title, sqlerrm;
end;
$$;

create or replace function public.guard_push_delivery_terminal_status()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  expected_receipts integer := jsonb_object_length(coalesce(new.expo_ticket_map, '{}'::jsonb));
  returned_receipts integer := case
    when jsonb_typeof(new.receipt_response_body->'data') = 'object'
      then jsonb_object_length(new.receipt_response_body->'data')
    else 0
  end;
begin
  if new.status = 'delivered' and new.ticket_error_count > 0 then
    new.status := 'partial';
    new.error_message := concat_ws('; ', nullif(new.error_message, ''), new.ticket_error_count || ' push ticket(s) were rejected');
  end if;

  if new.status in ('partial', 'failed')
     and new.receipt_response_status between 200 and 299
     and returned_receipts < expected_receipts
     and new.receipt_attempts < 3 then
    new.status := 'ticketed';
    new.receipt_check_after := now() + make_interval(mins => (2 ^ greatest(new.receipt_attempts, 1))::integer);
    new.error_message := 'Expo receipt response was incomplete; retry scheduled';
  end if;
  return new;
end;
$$;

drop trigger if exists push_delivery_terminal_status_guard on public.push_delivery_batches;
create trigger push_delivery_terminal_status_guard
before insert or update on public.push_delivery_batches
for each row execute function public.guard_push_delivery_terminal_status();

revoke all on function public.guard_push_delivery_terminal_status() from public, anon, authenticated;

commit;
