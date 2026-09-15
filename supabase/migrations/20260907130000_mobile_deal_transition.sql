-- One source entry is one transition request: its UUID is the durable
-- idempotency key, including after an interrupted mobile response/restart.
create table public.mobile_deal_transition_receipts (
  source_entry_id uuid primary key references public.deal_stage_entries(id) on delete cascade,
  destination_entry_id uuid not null unique references public.deal_stage_entries(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.mobile_deal_transition_receipts enable row level security;
revoke all on public.mobile_deal_transition_receipts from public, anon, authenticated;

create or replace function public.transition_mobile_deal(
  p_source_entry_id uuid, p_target_stage text, p_payload jsonb
) returns setof public.deal_stage_entries
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  source_row public.deal_stage_entries%rowtype;
  destination public.deal_stage_entries%rowtype;
  stages text[] := array['CIL', 'EOI', 'Reservation', 'SalesClaim'];
begin
  if actor is null or not exists (
    select 1 from public.users_profile where id = actor and account_status = 'active'
  ) then raise exception 'Active authenticated agent required' using errcode = '42501'; end if;
  select * into source_row from public.deal_stage_entries
    where id = p_source_entry_id and agent_id = actor for update;
  if not found then raise exception 'Source entry unavailable' using errcode = '42501'; end if;
  if p_target_stage is null or array_position(stages, p_target_stage) is null
    or array_position(stages, p_target_stage) <= array_position(stages, source_row.stage::text)
  then raise exception 'Invalid destination stage'; end if;

  select entry.* into destination from public.mobile_deal_transition_receipts receipt
    join public.deal_stage_entries entry on entry.id = receipt.destination_entry_id
    where receipt.source_entry_id = source_row.id;
  if found then
    if destination.stage::text <> p_target_stage or destination.payload is distinct from p_payload then
      raise exception 'This entry already moved with different submission details';
    end if;
    return next destination;
    return;
  end if;
  if source_row.status <> 'Submitted' then raise exception 'Source entry is no longer active'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or nullif(btrim(p_payload->>'propertyName'), '') is null
    or jsonb_typeof(p_payload->'attachments') is distinct from 'array'
  then raise exception 'Property and supporting documents are required'; end if;
  if jsonb_array_length(p_payload->'attachments') = 0 then
    raise exception 'Supporting documents are required';
  end if;
  if coalesce(p_payload->>'paymentMethod', '') not in ('bank_transfer', 'cheque', 'fast_payment') then
    raise exception 'Invalid payment method';
  end if;

  insert into public.deal_stage_entries (
    agent_id, stage, property_name, developer_name, status, attachments, payload,
    source_entry_id, payment_method, fast_payment_acknowledged, sales_claim_document
  ) values (
    actor, p_target_stage::public.deal_stage_type, p_payload->>'propertyName', p_payload->>'developer',
    case when p_target_stage = 'SalesClaim' then 'Under Review' else 'Submitted' end,
    array(select jsonb_array_elements_text(p_payload->'attachments')), p_payload,
    source_row.id, p_payload->>'paymentMethod', coalesce((p_payload->>'fastPaymentAcknowledged')::boolean, false),
    p_payload->>'salesClaimDocument'
  ) returning * into destination;
  update public.deal_stage_entries
    set status = 'Moved to ' || case when p_target_stage = 'SalesClaim' then 'Sales Claim' else p_target_stage end,
        updated_at = now()
    where id = source_row.id;
  insert into public.mobile_deal_transition_receipts(source_entry_id, destination_entry_id)
    values (source_row.id, destination.id);
  return next destination;
end;
$$;
revoke all on function public.transition_mobile_deal(uuid, text, jsonb) from public, anon;
grant execute on function public.transition_mobile_deal(uuid, text, jsonb) to authenticated;
