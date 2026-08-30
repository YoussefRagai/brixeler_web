begin;

-- Workspace and mobile use deal_stage_entries as the operational source of
-- truth.  The legacy deals table remains available to older clients, but it
-- must not be used for mission-control counts, queues, or decisions.
alter table public.deal_stage_entries
  add column if not exists payment_reference text,
  add column if not exists payment_proof_url text,
  add column if not exists payment_amount numeric(12,2),
  add column if not exists payment_amount_confirmed boolean not null default false,
  add column if not exists payment_recorded_by uuid references public.admins(id),
  add column if not exists payment_recorded_at timestamptz,
  add column if not exists payment_approved_by uuid references public.admins(id),
  add column if not exists payment_approved_at timestamptz,
  add column if not exists payment_approval_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deal_stage_entries'::regclass
      and conname = 'deal_stage_entries_payment_amount_check'
  ) then
    alter table public.deal_stage_entries
      add constraint deal_stage_entries_payment_amount_check
      check (payment_amount is null or payment_amount > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deal_stage_entries'::regclass
      and conname = 'deal_stage_entries_payment_recorded_pair_check'
  ) then
    alter table public.deal_stage_entries
      add constraint deal_stage_entries_payment_recorded_pair_check
      check ((payment_recorded_by is null and payment_recorded_at is null)
        or (payment_recorded_by is not null and payment_recorded_at is not null));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deal_stage_entries'::regclass
      and conname = 'deal_stage_entries_payment_approved_pair_check'
  ) then
    alter table public.deal_stage_entries
      add constraint deal_stage_entries_payment_approved_pair_check
      check ((payment_approved_by is null and payment_approved_at is null)
        or (payment_approved_by is not null and payment_approved_at is not null));
  end if;
end;
$$;

create index if not exists deal_stage_entries_workspace_status_idx
  on public.deal_stage_entries (stage, status, is_demo, updated_at desc);
create index if not exists deal_stage_entries_payment_recorded_idx
  on public.deal_stage_entries (payment_recorded_by, payment_approved_at)
  where stage = 'SalesClaim' and status = 'Accepted - Processing';

-- One narrow, server-only event ledger makes every admin decision traceable
-- and gives a retry-safe handoff point for future push/email delivery.  The
-- in-app notification is inserted in the same transaction below, so a
-- decision cannot commit without its user-facing notification.
create table if not exists public.deal_operation_outbox (
  id uuid primary key default gen_random_uuid(),
  deal_stage_entry_id uuid not null references public.deal_stage_entries(id) on delete cascade,
  agent_id uuid not null,
  event_type text not null check (event_type in (
    'sales_claim.reviewed',
    'sales_claim.accepted',
    'sales_claim.change_requested',
    'sales_claim.rejected',
    'sales_claim.payment_evidence_recorded',
    'sales_claim.paid'
  )),
  from_status text,
  to_status text not null,
  actor_id uuid not null references public.admins(id),
  notification_id uuid references public.notifications(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists deal_operation_outbox_entry_idx
  on public.deal_operation_outbox (deal_stage_entry_id, created_at desc);
create index if not exists deal_operation_outbox_pending_idx
  on public.deal_operation_outbox (processed_at, created_at)
  where processed_at is null;

alter table public.deal_operation_outbox enable row level security;
alter table public.deal_operation_outbox force row level security;
drop policy if exists deal_operation_outbox_service_role on public.deal_operation_outbox;
create policy deal_operation_outbox_service_role
  on public.deal_operation_outbox
  for all to service_role
  using (true)
  with check (true);
revoke all on public.deal_operation_outbox from public, anon, authenticated;
grant all on public.deal_operation_outbox to service_role;

-- Canonical workspace projection.  Keep the mobile field names in payload
-- while exposing normalized aliases for dashboard queries and exports.
create or replace view public.workspace_operations as
select
  entry.id,
  entry.agent_id,
  entry.stage,
  entry.property_name,
  entry.developer_name,
  entry.status,
  entry.attachments,
  entry.payload,
  entry.source_entry_id,
  entry.created_at,
  entry.updated_at,
  entry.payment_method,
  entry.fast_payment_acknowledged,
  entry.sales_claim_document,
  entry.payment_reference,
  entry.payment_proof_url,
  entry.payment_amount,
  entry.payment_amount_confirmed,
  entry.payment_recorded_by,
  entry.payment_recorded_at,
  entry.payment_approved_by,
  entry.payment_approved_at,
  entry.payment_approval_notes,
  entry.is_demo,
  entry.demo_batch,
  entry.payload ->> 'saleAmount' as sale_amount,
  entry.payload ->> 'commissionRate' as commission_rate,
  entry.payload ->> 'clientName' as client_name,
  entry.payload ->> 'clientPhone' as client_phone,
  entry.payload ->> 'unitCode' as unit_code,
  entry.payload ->> 'notes' as notes,
  (entry.stage = 'SalesClaim'
    and entry.status not in ('Paid', 'Rejected')
    and entry.updated_at < now() - interval '48 hours') as is_overdue,
  'deal_stage_entries'::text as source_of_truth
from public.deal_stage_entries entry;

revoke all on public.workspace_operations from public, anon, authenticated;
grant select on public.workspace_operations to service_role;

create or replace function public.workspace_operations_metrics(p_mode text default 'live')
returns table (
  operation_count bigint,
  active_agent_count bigint,
  pending_verification_count bigint,
  sales_claim_change_count bigint,
  overdue_task_count bigint
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  mode_value text := coalesce(nullif(lower(btrim(p_mode)), ''), 'live');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if mode_value not in ('live', 'demo', 'all') then
    raise exception 'Invalid workspace data mode';
  end if;

  return query
  with selected_operations as (
    select operation.*
    from public.workspace_operations operation
    where mode_value = 'all'
      or (mode_value = 'demo' and operation.is_demo)
      or (mode_value = 'live' and not operation.is_demo)
  ),
  operation_agents as (
    select distinct agent_id from selected_operations
  )
  select
    (select count(*) from selected_operations),
    (select count(*)
       from operation_agents agent
       join public.users_profile profile on profile.id = agent.agent_id
      where profile.account_status = 'active'),
    (select count(*)
       from public.users_profile profile
      where profile.account_status = 'active'
        and profile.verification_status = 'pending'),
    (select count(*) from selected_operations
      where stage = 'SalesClaim' and status = 'Change Requested'),
    (select count(*) from public.admin_tasks task
      where task.related_entity_type = 'deal_stage_entry'
        and task.status in ('open', 'in_progress')
        and task.due_at is not null
        and task.due_at < now()
        and (
          mode_value = 'all'
          or (mode_value = 'demo' and task.is_demo)
          or (mode_value = 'live' and not task.is_demo)
        ));
end;
$$;

revoke all on function public.workspace_operations_metrics(text) from public, anon, authenticated;
grant execute on function public.workspace_operations_metrics(text) to service_role;

-- Do not allow direct admin/service-role table updates to bypass the state
-- machine.  Mobile may still resubmit a Change Requested claim by updating it
-- to Under Review; every other status decision must use the transition RPC.
create or replace function public.guard_sales_claim_status_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  transition_context text := current_setting('brixeler.sales_claim_transition', true);
begin
  if new.stage <> 'SalesClaim' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('Submitted', 'Under Review', 'Accepted - Processing', 'Change Requested', 'Rejected', 'Paid') then
      raise exception 'Invalid Sales Claim status %', new.status;
    end if;
    if new.status = 'Paid' then
      raise exception 'Payment evidence and independent approval are required before Paid';
    end if;
    if new.payment_reference is not null
       or new.payment_proof_url is not null
       or new.payment_amount is not null
       or coalesce(new.payment_amount_confirmed, false)
       or new.payment_recorded_by is not null
       or new.payment_recorded_at is not null
       or new.payment_approved_by is not null
       or new.payment_approved_at is not null then
      raise exception 'Payment evidence must be recorded through the review transition';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and transition_context is distinct from '1' then
    if auth.uid() = old.agent_id
       and old.status = 'Change Requested'
       and new.status = 'Under Review'
       and new.payment_reference is not distinct from old.payment_reference
       and new.payment_proof_url is not distinct from old.payment_proof_url
       and new.payment_amount is not distinct from old.payment_amount
       and new.payment_amount_confirmed is not distinct from old.payment_amount_confirmed
       and new.payment_recorded_by is not distinct from old.payment_recorded_by
       and new.payment_recorded_at is not distinct from old.payment_recorded_at
       and new.payment_approved_by is not distinct from old.payment_approved_by
       and new.payment_approved_at is not distinct from old.payment_approved_at then
      return new;
    end if;
    raise exception 'Sales Claim status changes must use the review transition';
  end if;

  if transition_context is distinct from '1'
     and (
       new.payment_reference is distinct from old.payment_reference
       or new.payment_proof_url is distinct from old.payment_proof_url
       or new.payment_amount is distinct from old.payment_amount
       or new.payment_amount_confirmed is distinct from old.payment_amount_confirmed
       or new.payment_recorded_by is distinct from old.payment_recorded_by
       or new.payment_recorded_at is distinct from old.payment_recorded_at
       or new.payment_approved_by is distinct from old.payment_approved_by
       or new.payment_approved_at is distinct from old.payment_approved_at
       or new.payment_approval_notes is distinct from old.payment_approval_notes
     ) then
    raise exception 'Payment evidence must be recorded through the review transition';
  end if;

  return new;
end;
$$;

drop trigger if exists deal_stage_entries_guard_sales_claim_status on public.deal_stage_entries;
create trigger deal_stage_entries_guard_sales_claim_status
before insert or update on public.deal_stage_entries
for each row execute function public.guard_sales_claim_status_mutation();

revoke all on function public.guard_sales_claim_status_mutation() from public, anon, authenticated;

create or replace function public.transition_sales_claim(
  p_entry_id uuid,
  p_next_status text,
  p_actor_id uuid,
  p_feedback_type text default null,
  p_feedback_reason text default null,
  p_payment_reference text default null,
  p_payment_proof_url text default null,
  p_payment_amount numeric default null,
  p_payment_amount_confirmed boolean default false
)
returns public.deal_stage_entries
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  claim_row public.deal_stage_entries%rowtype;
  actor_row public.admins%rowtype;
  from_status text;
  next_payload jsonb;
  reason_value text := nullif(btrim(coalesce(p_feedback_reason, '')), '');
  payment_reference_value text := nullif(btrim(coalesce(p_payment_reference, '')), '');
  payment_proof_value text := nullif(btrim(coalesce(p_payment_proof_url, '')), '');
  payment_input boolean := p_payment_reference is not null
    or p_payment_proof_url is not null
    or p_payment_amount is not null
    or coalesce(p_payment_amount_confirmed, false);
  notification_id uuid;
  event_name text;
  notification_title text;
  notification_message text;
  event_payload jsonb;
begin
  if coalesce(auth.role(), '') not in ('service_role', 'authenticated') then
    raise exception 'Authenticated service required';
  end if;
  if coalesce(auth.role(), '') = 'authenticated' and auth.uid() is distinct from p_actor_id then
    raise exception 'Actor identity mismatch';
  end if;
  if p_entry_id is null or p_actor_id is null then
    raise exception 'Sales claim and actor are required';
  end if;

  select * into actor_row
  from public.admins
  where id = p_actor_id and is_active = true
  for update;
  if not found then
    raise exception 'Active deals administrator required';
  end if;
  if not (
    actor_row.role::text in ('super_admin', 'deals_admin')
    or coalesce(actor_row.roles, '{}'::public.admin_role[]) @> array['super_admin'::public.admin_role]
    or coalesce(actor_row.roles, '{}'::public.admin_role[]) @> array['deals_admin'::public.admin_role]
  ) then
    raise exception 'Deals administrator role required';
  end if;

  if p_next_status not in ('Under Review', 'Accepted - Processing', 'Change Requested', 'Rejected', 'Paid') then
    raise exception 'Invalid Sales Claim status %', p_next_status;
  end if;
  if p_feedback_type is not null and p_feedback_type not in ('request_change', 'reject') then
    raise exception 'Invalid Sales Claim feedback type';
  end if;
  if p_feedback_type is not null
     and (p_next_status not in ('Change Requested', 'Rejected')
       or (p_next_status = 'Change Requested' and p_feedback_type <> 'request_change')
       or (p_next_status = 'Rejected' and p_feedback_type <> 'reject')) then
    raise exception 'Feedback type does not match the Sales Claim decision';
  end if;
  if p_next_status in ('Change Requested', 'Rejected') and reason_value is null then
    raise exception 'A reason is required for this Sales Claim decision';
  end if;
  if reason_value is not null and char_length(reason_value) > 4000 then
    raise exception 'Sales Claim reason is too long';
  end if;

  -- This lock is the concurrency boundary.  The transition and all its
  -- audit/notification side effects happen before the lock is released.
  select * into claim_row
  from public.deal_stage_entries
  where id = p_entry_id and stage = 'SalesClaim'
  for update;
  if not found then
    raise exception 'Sales claim % not found', p_entry_id;
  end if;
  from_status := claim_row.status;

  if p_next_status = 'Under Review'
     and from_status not in ('Submitted', 'Under Review', 'Change Requested') then
    raise exception 'Sales Claim cannot move from % to Under Review', from_status;
  elsif p_next_status = 'Accepted - Processing'
     and from_status not in ('Submitted', 'Under Review', 'Change Requested', 'Accepted - Processing') then
    raise exception 'Sales Claim cannot move from % to Accepted - Processing', from_status;
  elsif p_next_status = 'Change Requested'
     and from_status not in ('Submitted', 'Under Review', 'Change Requested') then
    raise exception 'Sales Claim cannot move from % to Change Requested', from_status;
  elsif p_next_status = 'Rejected'
     and from_status not in ('Submitted', 'Under Review', 'Change Requested') then
    raise exception 'Sales Claim cannot move from % to Rejected', from_status;
  elsif p_next_status = 'Paid' and from_status <> 'Accepted - Processing' then
    raise exception 'Sales Claim must be Accepted - Processing before Paid';
  end if;

  if p_next_status = 'Accepted - Processing' and payment_input then
    if claim_row.payment_recorded_by is not null then
      raise exception 'Payment evidence is already recorded; independent approval is required';
    end if;
    if payment_reference_value is null or char_length(payment_reference_value) > 200 then
      raise exception 'Payment reference is required';
    end if;
    if payment_proof_value is null or char_length(payment_proof_value) > 2048 then
      raise exception 'Payment proof is required';
    end if;
    if p_payment_amount is null or p_payment_amount <= 0 then
      raise exception 'A confirmed payment amount greater than zero is required';
    end if;
    if not coalesce(p_payment_amount_confirmed, false) then
      raise exception 'Payment amount confirmation is required';
    end if;
  end if;

  if p_next_status = 'Paid' then
    if claim_row.payment_reference is null
       or btrim(claim_row.payment_reference) = ''
       or claim_row.payment_proof_url is null
       or btrim(claim_row.payment_proof_url) = ''
       or claim_row.payment_amount is null
       or not coalesce(claim_row.payment_amount_confirmed, false)
       or claim_row.payment_recorded_by is null
       or claim_row.payment_recorded_at is null then
      raise exception 'Payment proof, reference, amount confirmation, and first approval are required before Paid';
    end if;
    if claim_row.payment_recorded_by = p_actor_id then
      raise exception 'An independent administrator must approve the payment';
    end if;
    if claim_row.payment_approved_by is not null or claim_row.payment_approved_at is not null then
      raise exception 'Payment approval has already been recorded';
    end if;
    if not exists (
      select 1 from public.admins
      where id = claim_row.payment_recorded_by and is_active = true
    ) then
      raise exception 'The payment recorder is no longer an active administrator';
    end if;
  end if;

  if p_next_status in ('Change Requested', 'Rejected') then
    next_payload := coalesce(claim_row.payload, '{}'::jsonb)
      || jsonb_build_object(
        'feedback_type', case when p_next_status = 'Rejected' then 'reject' else 'request_change' end,
        'feedback_reason', reason_value,
        'feedback_at', now()
      );
  else
    next_payload := coalesce(claim_row.payload, '{}'::jsonb)
      - array['feedback_type', 'feedback_reason', 'feedback_at'];
  end if;

  if from_status = p_next_status
     and not payment_input
     and p_next_status <> 'Paid'
     and p_feedback_type is null
     and reason_value is null then
    return claim_row;
  end if;

  perform set_config('brixeler.sales_claim_transition', '1', true);
  update public.deal_stage_entries
  set status = p_next_status,
      payload = next_payload,
      payment_reference = case when p_next_status = 'Accepted - Processing' and payment_input then payment_reference_value else payment_reference end,
      payment_proof_url = case when p_next_status = 'Accepted - Processing' and payment_input then payment_proof_value else payment_proof_url end,
      payment_amount = case when p_next_status = 'Accepted - Processing' and payment_input then p_payment_amount else payment_amount end,
      payment_amount_confirmed = case when p_next_status = 'Accepted - Processing' and payment_input then true else payment_amount_confirmed end,
      payment_recorded_by = case when p_next_status = 'Accepted - Processing' and payment_input then p_actor_id else payment_recorded_by end,
      payment_recorded_at = case when p_next_status = 'Accepted - Processing' and payment_input then now() else payment_recorded_at end,
      payment_approved_by = case when p_next_status = 'Paid' then p_actor_id else payment_approved_by end,
      payment_approved_at = case when p_next_status = 'Paid' then now() else payment_approved_at end,
      updated_at = now()
  where id = p_entry_id
  returning * into claim_row;

  if p_next_status = 'Paid' then
    event_name := 'sales_claim.paid';
    notification_title := 'Sales claim paid';
    notification_message := format('Your sales claim for %s has been paid.', claim_row.property_name);
  elsif p_next_status = 'Rejected' then
    event_name := 'sales_claim.rejected';
    notification_title := 'Sales claim rejected';
    notification_message := format('Your sales claim for %s was rejected: %s', claim_row.property_name, reason_value);
  elsif p_next_status = 'Change Requested' then
    event_name := 'sales_claim.change_requested';
    notification_title := 'Sales claim changes requested';
    notification_message := format('Changes are required for your sales claim for %s: %s', claim_row.property_name, reason_value);
  elsif p_next_status = 'Accepted - Processing' and payment_input and from_status = p_next_status then
    event_name := 'sales_claim.payment_evidence_recorded';
    notification_title := 'Payment evidence received';
    notification_message := format('Payment evidence for your sales claim for %s is recorded and awaiting independent approval.', claim_row.property_name);
  elsif p_next_status = 'Accepted - Processing' then
    event_name := 'sales_claim.accepted';
    notification_title := 'Sales claim approved';
    notification_message := format('Your sales claim for %s was approved and is being processed for payment.', claim_row.property_name);
  else
    event_name := 'sales_claim.reviewed';
    notification_title := 'Sales claim under review';
    notification_message := format('Your sales claim for %s is under review.', claim_row.property_name);
  end if;

  event_payload := jsonb_build_object(
    'from_status', from_status,
    'to_status', p_next_status,
    'reason', reason_value,
    'payment_reference', case when p_next_status = 'Paid' then claim_row.payment_reference else null end,
    'payment_amount', case when p_next_status = 'Paid' then claim_row.payment_amount else null end,
    'source_of_truth', 'deal_stage_entries'
  );

  insert into public.notifications(
    agent_id, type, title, message, related_entity_type, related_entity_id,
    action_url, is_demo, demo_batch
  ) values (
    claim_row.agent_id,
    'admin_message'::public.notification_type,
    left(notification_title, 200),
    left(notification_message, 2000),
    'deal_stage_entry',
    claim_row.id,
    '/deals',
    claim_row.is_demo,
    claim_row.demo_batch
  ) returning id into notification_id;

  insert into public.admin_activity_log(
    admin_id, action_type, entity_type, entity_id, details
  ) values (
    p_actor_id,
    'sales_claim.' || replace(lower(p_next_status), ' ', '_'),
    'deal_stage_entries',
    claim_row.id,
    event_payload || jsonb_build_object('event_type', event_name)
  );

  insert into public.deal_operation_outbox(
    deal_stage_entry_id, agent_id, event_type, from_status, to_status,
    actor_id, notification_id, payload, is_demo, demo_batch
  ) values (
    claim_row.id, claim_row.agent_id, event_name, from_status, p_next_status,
    p_actor_id, notification_id, event_payload, claim_row.is_demo, claim_row.demo_batch
  );

  return claim_row;
end;
$$;

revoke all on function public.transition_sales_claim(uuid, text, uuid, text, text, text, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.transition_sales_claim(uuid, text, uuid, text, text, text, text, numeric, boolean) to service_role;

create or replace function public.record_sales_claim_payment(
  p_entry_id uuid,
  p_actor_id uuid,
  p_payment_reference text,
  p_payment_proof_url text,
  p_payment_amount numeric,
  p_payment_amount_confirmed boolean
)
returns public.deal_stage_entries
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return public.transition_sales_claim(
    p_entry_id, 'Accepted - Processing', p_actor_id,
    null, null, p_payment_reference, p_payment_proof_url,
    p_payment_amount, p_payment_amount_confirmed
  );
end;
$$;

revoke all on function public.record_sales_claim_payment(uuid, uuid, text, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.record_sales_claim_payment(uuid, uuid, text, text, numeric, boolean) to service_role;

create or replace function public.approve_sales_claim_payment(
  p_entry_id uuid,
  p_actor_id uuid
)
returns public.deal_stage_entries
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return public.transition_sales_claim(p_entry_id, 'Paid', p_actor_id);
end;
$$;

revoke all on function public.approve_sales_claim_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_sales_claim_payment(uuid, uuid) to service_role;

-- Keep the pre-existing authenticated RPC compatible for clients that use it,
-- while routing it through the same transition boundary.
create or replace function public.set_sales_claim_status(p_entry_id uuid, p_status text)
returns public.deal_stage_entries
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Authenticated administrator required';
  end if;
  return public.transition_sales_claim(p_entry_id, p_status, auth.uid());
end;
$$;

revoke all on function public.set_sales_claim_status(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_sales_claim_status(uuid, text) to authenticated;

-- Deal tasks need an owning admin and a canonical stage-entry link.  These
-- functions prevent an arbitrary task id from being completed by a deals user
-- and record completion under the same activity log used by other admin work.
alter table public.admin_tasks
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.admins(id);

create or replace function public.create_admin_deal_task(
  p_title text,
  p_description text,
  p_priority text,
  p_due_at timestamptz,
  p_created_by uuid,
  p_assigned_to uuid default null,
  p_related_entity_id uuid default null,
  p_is_demo boolean default false,
  p_demo_batch text default null
)
returns public.admin_tasks
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  task_row public.admin_tasks%rowtype;
  title_value text := btrim(coalesce(p_title, ''));
  description_value text := nullif(btrim(coalesce(p_description, '')), '');
  assigned_value uuid := coalesce(p_assigned_to, p_created_by);
  batch_value text := nullif(btrim(coalesce(p_demo_batch, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if not exists (select 1 from public.admins where id = p_created_by and is_active) then
    raise exception 'Active task creator required';
  end if;
  if not exists (select 1 from public.admins where id = assigned_value and is_active) then
    raise exception 'Assigned administrator must be active';
  end if;
  if char_length(title_value) not between 1 and 200 then
    raise exception 'Task title must contain between 1 and 200 characters';
  end if;
  if description_value is not null and char_length(description_value) > 4000 then
    raise exception 'Task description is too long';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid task priority';
  end if;
  if p_is_demo and batch_value is null then
    raise exception 'A demo batch is required for demo tasks';
  end if;
  if not p_is_demo and batch_value is not null then
    raise exception 'Live tasks cannot have a demo batch';
  end if;
  if p_is_demo and not exists (
    select 1 from public.demo_data_batches
    where batch_key = batch_value and status = 'active'
  ) then
    raise exception 'Demo batch is not active';
  end if;
  if p_related_entity_id is not null and not exists (
    select 1 from public.deal_stage_entries
    where id = p_related_entity_id
      and stage = 'SalesClaim'
      and is_demo = coalesce(p_is_demo, false)
  ) then
    raise exception 'Related deal stage entry was not found in the selected data mode';
  end if;

  insert into public.admin_tasks(
    title, description, assigned_to, related_entity_type, related_entity_id,
    priority, status, due_at, created_by, is_demo, demo_batch
  ) values (
    title_value, description_value, assigned_value, 'deal_stage_entry', p_related_entity_id,
    p_priority, 'open', p_due_at, p_created_by, coalesce(p_is_demo, false),
    case when coalesce(p_is_demo, false) then batch_value else null end
  ) returning * into task_row;

  insert into public.admin_activity_log(admin_id, action_type, entity_type, entity_id, details)
  values (
    p_created_by,
    'admin_task.create',
    'admin_tasks',
    task_row.id,
    jsonb_build_object(
      'related_entity_type', task_row.related_entity_type,
      'related_entity_id', task_row.related_entity_id,
      'priority', task_row.priority,
      'is_demo', task_row.is_demo
    )
  );
  return task_row;
end;
$$;

revoke all on function public.create_admin_deal_task(text, text, text, timestamptz, uuid, uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.create_admin_deal_task(text, text, text, timestamptz, uuid, uuid, uuid, boolean, text) to service_role;

create or replace function public.complete_admin_deal_task(
  p_task_id uuid,
  p_actor_id uuid
)
returns public.admin_tasks
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  task_row public.admin_tasks%rowtype;
  actor_row public.admins%rowtype;
  previous_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  select * into actor_row from public.admins where id = p_actor_id and is_active for update;
  if not found then raise exception 'Active task administrator required'; end if;
  if not (
    actor_row.role::text in ('super_admin', 'deals_admin')
    or coalesce(actor_row.roles, '{}'::public.admin_role[]) @> array['super_admin'::public.admin_role]
    or coalesce(actor_row.roles, '{}'::public.admin_role[]) @> array['deals_admin'::public.admin_role]
  ) then
    raise exception 'Deals administrator role required';
  end if;

  select * into task_row
  from public.admin_tasks
  where id = p_task_id
    and related_entity_type in ('deal', 'deal_stage_entry')
  for update;
  if not found then raise exception 'Deal task not found'; end if;
  previous_status := task_row.status;
  if task_row.status not in ('open', 'in_progress') then
    raise exception 'Only open or in-progress deal tasks can be completed';
  end if;
  if task_row.assigned_to is not null
     and task_row.assigned_to <> p_actor_id
     and task_row.created_by <> p_actor_id
     and actor_row.role::text <> 'super_admin'
     and not (coalesce(actor_row.roles, '{}'::public.admin_role[]) @> array['super_admin'::public.admin_role]) then
    raise exception 'Only the task owner or creator can complete this task';
  end if;

  update public.admin_tasks
  set status = 'done', completed_at = now(), completed_by = p_actor_id, updated_at = now()
  where id = task_row.id
  returning * into task_row;

  insert into public.admin_activity_log(admin_id, action_type, entity_type, entity_id, details)
  values (
    p_actor_id,
    'admin_task.complete',
    'admin_tasks',
      task_row.id,
    jsonb_build_object('previous_status', previous_status, 'status', task_row.status)
  );
  return task_row;
end;
$$;

revoke all on function public.complete_admin_deal_task(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_admin_deal_task(uuid, uuid) to service_role;

commit;
