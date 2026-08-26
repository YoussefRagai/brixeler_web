begin;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 300),
  category text not null default 'other' check (
    category in ('verification', 'deal', 'payout', 'technical', 'property', 'property_request', 'other')
  ),
  description text not null default '' check (char_length(description) <= 20000),
  status text not null default 'new' check (
    status in ('new', 'in_progress', 'waiting_agent', 'resolved', 'closed')
  ),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'phone', 'whatsapp')),
  last_message_preview text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (last_message_preview is null or char_length(last_message_preview) <= 20000)
);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_type text not null check (author_type in ('agent', 'admin', 'system')),
  author_id uuid,
  message text not null check (char_length(btrim(message)) between 1 and 20000),
  created_at timestamptz not null default now(),
  check (
    (author_type = 'system' and author_id is null)
    or (author_type in ('agent', 'admin') and author_id is not null)
  )
);

create index support_tickets_agent_activity_idx
  on public.support_tickets (agent_id, last_message_at desc);
create index support_tickets_status_activity_idx
  on public.support_tickets (status, last_message_at desc);
create index support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at);

create or replace function public.touch_support_ticket_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger support_tickets_touch_updated_at
before update on public.support_tickets
for each row execute function public.touch_support_ticket_updated_at();

alter table public.support_tickets enable row level security;
alter table public.support_tickets force row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_messages force row level security;

revoke all on table public.support_tickets from public, anon, authenticated;
revoke all on table public.support_ticket_messages from public, anon, authenticated;
grant select, insert on table public.support_tickets to authenticated;
grant select, insert on table public.support_ticket_messages to authenticated;
grant all on table public.support_tickets to service_role;
grant all on table public.support_ticket_messages to service_role;

create policy support_tickets_agent_select
on public.support_tickets
for select
to authenticated
using (agent_id = (select auth.uid()));

create policy support_tickets_agent_insert
on public.support_tickets
for insert
to authenticated
with check (
  agent_id = (select auth.uid())
  and status = 'new'
  and channel = 'in_app'
);

create policy support_ticket_messages_agent_select
on public.support_ticket_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = support_ticket_messages.ticket_id
      and ticket.agent_id = (select auth.uid())
  )
);

create policy support_ticket_messages_agent_insert
on public.support_ticket_messages
for insert
to authenticated
with check (
  author_type = 'agent'
  and author_id = (select auth.uid())
  and exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = support_ticket_messages.ticket_id
      and ticket.agent_id = (select auth.uid())
  )
);

commit;
