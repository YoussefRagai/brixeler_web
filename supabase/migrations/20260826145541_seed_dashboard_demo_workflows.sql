begin;

do $$
declare
  demo_admin uuid;
  demo_agent uuid;
  demo_ticket uuid;
begin
  select id into demo_admin from public.admins order by created_at nulls last, id limit 1;
  select id into demo_agent from public.users_profile order by created_at nulls last, id limit 1;

  if demo_admin is not null then
    insert into public.admin_tasks (
      title, description, assigned_to, related_entity_type, priority, status,
      due_at, created_by, is_demo, demo_batch
    ) select
      'Review demo reservation paperwork',
      'Walk through the deal-room follow-up flow using the demonstration listing.',
      demo_admin, 'deal', 'high', 'open', now() + interval '2 days', demo_admin,
      true, 'dashboard-demo-20260826'
    where not exists (select 1 from public.admin_tasks where is_demo and demo_batch = 'dashboard-demo-20260826');

    insert into public.notification_campaigns (
      created_by, audience, channel, title, message, action_url, scheduled_for,
      status, recipient_count, sent_at, is_demo, demo_batch
    ) select demo_admin, 'verified', 'in_app',
      'Demo: Northline launch inventory',
      'This sample campaign demonstrates the notification review and reporting workflow.',
      '/properties', now() - interval '1 day', 'sent', 0, now() - interval '1 day',
      true, 'dashboard-demo-20260826'
    where not exists (select 1 from public.notification_campaigns where is_demo and demo_batch = 'dashboard-demo-20260826');

    insert into public.admin_export_jobs (
      created_by, export_type, file_format, filters, status, row_count, file_name,
      is_demo, demo_batch
    ) select demo_admin, 'properties', 'xlsx',
      '{"scope":"demo"}'::jsonb, 'ready', 2, 'demo-properties.xlsx',
      true, 'dashboard-demo-20260826'
    where not exists (select 1 from public.admin_export_jobs where is_demo and demo_batch = 'dashboard-demo-20260826');
  end if;

  if demo_agent is not null then
    insert into public.support_tickets (
      agent_id, subject, category, description, status, priority, channel,
      last_message_preview, last_message_at, is_demo, demo_batch
    ) select demo_agent, 'Demo: verify reservation documents', 'deal',
      'Use this ticket to test assignment, macros, replies, and resolution without affecting a real agent request.',
      'new', 'normal', 'in_app', 'Can you confirm which documents are required?', now() - interval '35 minutes',
      true, 'dashboard-demo-20260826'
    where not exists (select 1 from public.support_tickets where is_demo and demo_batch = 'dashboard-demo-20260826')
    returning id into demo_ticket;

    if demo_ticket is null then
      select id into demo_ticket from public.support_tickets where is_demo and demo_batch = 'dashboard-demo-20260826' order by created_at limit 1;
    end if;

    insert into public.support_ticket_messages (ticket_id, author_type, author_id, message, created_at)
    select demo_ticket, 'agent', demo_agent,
      'Can you confirm which documents are required for this demonstration reservation?',
      now() - interval '35 minutes'
    where demo_ticket is not null and not exists (select 1 from public.support_ticket_messages where ticket_id = demo_ticket);

    if demo_admin is not null then
      insert into public.admin_agent_notes (agent_id, note, created_by, is_demo, demo_batch)
      select demo_agent,
        'Demo note: use this profile to validate internal notes and support context.',
        demo_admin, true, 'dashboard-demo-20260826'
      where not exists (select 1 from public.admin_agent_notes where is_demo and demo_batch = 'dashboard-demo-20260826');
    end if;
  end if;
end;
$$;

commit;
