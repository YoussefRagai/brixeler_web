begin;

create or replace function public.sync_support_ticket_message_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.support_tickets
  set last_message_preview = new.message,
      last_message_at = new.created_at
  where id = new.ticket_id;
  return new;
end;
$$;

revoke all on function public.sync_support_ticket_message_activity() from public, anon, authenticated;

create trigger support_ticket_messages_sync_activity
after insert on public.support_ticket_messages
for each row execute function public.sync_support_ticket_message_activity();

commit;
