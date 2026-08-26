begin;

create or replace function public.guard_push_delivery_terminal_status()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  expected_receipts integer := public.jsonb_object_length(coalesce(new.expo_ticket_map, '{}'::jsonb));
  returned_receipts integer := case
    when jsonb_typeof(new.receipt_response_body->'data') = 'object'
      then public.jsonb_object_length(new.receipt_response_body->'data')
    else 0
  end;
  missing_tickets integer;
begin
  if new.status = 'ticketed' then
    missing_tickets := greatest(new.token_count - expected_receipts - new.ticket_error_count, 0);
    if missing_tickets > 0 then
      new.ticket_error_count := new.ticket_error_count + missing_tickets;
      new.error_message := concat_ws('; ', nullif(new.error_message, ''), missing_tickets || ' Expo push ticket response(s) were missing');
    end if;
  end if;

  if new.status = 'delivered' and new.ticket_error_count > 0 then
    new.status := 'partial';
    new.error_message := concat_ws('; ', nullif(new.error_message, ''), new.ticket_error_count || ' push ticket(s) were rejected or missing');
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

commit;
