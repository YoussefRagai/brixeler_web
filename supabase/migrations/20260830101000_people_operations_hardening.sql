begin;

-- People account lifecycle ---------------------------------------------------
-- Keep the user/profile row so deals, commissions, support, referrals, and
-- audit records remain addressable.  The irreversible operation below only
-- removes direct identifiers after an independent super-admin approval.
alter table public.users_profile
  add column if not exists account_lifecycle_state text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.admins(id),
  add column if not exists archive_reason text,
  add column if not exists anonymized_at timestamptz,
  add column if not exists purged_at timestamptz,
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_reviewed_by uuid references public.admins(id),
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_review_version bigint not null default 0;

update public.users_profile
set account_lifecycle_state = case
      when account_status = 'suspended' then 'suspended'
      when account_status = 'banned' then 'archived'
      else 'active'
    end
where account_lifecycle_state is null;

update public.users_profile
set verification_submitted_at = coalesce(verification_submitted_at, created_at, account_created_at, now())
where verification_status = 'pending'
  and coalesce(array_length(verification_documents_url, 1), 0) > 0;

alter table public.users_profile
  alter column account_lifecycle_state set default 'active',
  alter column account_lifecycle_state set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users_profile'::regclass
      and conname = 'users_profile_account_lifecycle_state_check'
  ) then
    alter table public.users_profile
      add constraint users_profile_account_lifecycle_state_check
      check (account_lifecycle_state in ('active', 'suspended', 'archived', 'anonymized', 'purged'));
  end if;
end;
$$;

create index if not exists users_profile_lifecycle_queue_idx
  on public.users_profile(account_lifecycle_state, account_status, verification_status, verification_submitted_at);

create table if not exists public.agent_account_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete restrict,
  event_type text not null check (event_type in (
    'suspended', 'restored', 'archived', 'purge_requested', 'purge_approved', 'purged'
  )),
  actor_id uuid not null references public.admins(id),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_account_lifecycle_events_agent_idx
  on public.agent_account_lifecycle_events(agent_id, created_at desc);

-- A short-lived, auditable snapshot is required before an irreversible purge.
-- It is downloadable by the operator who generated it (or a super admin), and
-- the profile row remains the durable business-record anchor after purge.
create table if not exists public.agent_account_retention_snapshots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete restrict,
  generated_by uuid not null references public.admins(id),
  generated_at timestamptz not null default now(),
  downloaded_by uuid references public.admins(id),
  downloaded_at timestamptz,
  snapshot_schema_version integer not null default 1,
  snapshot jsonb not null,
  constraint agent_account_retention_snapshots_payload_check
    check (jsonb_typeof(snapshot) = 'object')
);

create index if not exists agent_account_retention_snapshots_agent_idx
  on public.agent_account_retention_snapshots(agent_id, generated_at desc);

create table if not exists public.agent_account_purge_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete restrict,
  requested_by uuid not null references public.admins(id),
  retention_snapshot_id uuid references public.agent_account_retention_snapshots(id) on delete restrict,
  request_reason text not null check (char_length(btrim(request_reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'rejected', 'executed', 'cancelled')),
  approved_by uuid references public.admins(id),
  approval_reason text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  executed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint agent_account_purge_requests_approval_reason_check
    check (approval_reason is null or char_length(btrim(approval_reason)) between 3 and 1000),
  constraint agent_account_purge_requests_independent_approver_check
    check (approved_by is null or approved_by <> requested_by)
);

create unique index if not exists agent_account_purge_requests_one_pending_idx
  on public.agent_account_purge_requests(agent_id)
  where status = 'pending';

create index if not exists agent_account_purge_requests_status_idx
  on public.agent_account_purge_requests(status, requested_at desc);

-- Support operations ---------------------------------------------------------
alter table public.support_tickets
  add column if not exists unread_for_admin boolean not null default false,
  add column if not exists unread_for_agent boolean not null default false,
  add column if not exists last_admin_read_at timestamptz,
  add column if not exists last_agent_read_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists revision bigint not null default 1;

create index if not exists support_tickets_inbox_filters_idx
  on public.support_tickets(status, priority, assigned_to, unread_for_admin, last_message_at desc);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  event_type text not null check (event_type in ('claimed', 'status_changed', 'replied', 'read')),
  actor_id uuid not null references public.admins(id),
  from_status text,
  to_status text,
  from_owner uuid,
  to_owner uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_events_ticket_idx
  on public.support_ticket_events(ticket_id, created_at desc);

-- Macros are edited through versioned RPCs.  Deactivation is recoverable and
-- keeps the prior text available in the immutable audit history.
alter table public.support_macros
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_by uuid references public.admins(id),
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.admins(id),
  add column if not exists deactivation_reason text;

create table if not exists public.support_macro_versions (
  id uuid primary key default gen_random_uuid(),
  macro_id uuid not null references public.support_macros(id) on delete cascade,
  version bigint not null,
  action text not null check (action in ('created', 'updated', 'activated', 'deactivated')),
  title text not null,
  message text not null,
  category text,
  is_active boolean not null,
  changed_by uuid not null references public.admins(id),
  reason text,
  changed_at timestamptz not null default now(),
  constraint support_macro_versions_reason_check
    check (reason is null or char_length(btrim(reason)) between 3 and 1000),
  unique (macro_id, version)
);

create index if not exists support_macro_versions_macro_idx
  on public.support_macro_versions(macro_id, changed_at desc);

-- Seed history for operator-created legacy rows where the original actor is
-- available. New and edited macros always write an actor and reason.
insert into public.support_macro_versions(macro_id, version, action, title, message, category, is_active, changed_by, reason, changed_at)
select macro.id, coalesce(macro.revision, 1), 'created', macro.title, macro.message, macro.category,
       macro.is_active, macro.created_by, 'Legacy macro baseline', coalesce(macro.created_at, now())
from public.support_macros macro
where macro.created_by is not null
on conflict (macro_id, version) do nothing;

-- Every direct update receives a monotonic revision, allowing dashboard
-- mutations to reject stale forms instead of silently overwriting work.
create or replace function public.touch_support_ticket_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.revision := coalesce(new.revision, 1);
  elsif new.revision is null or new.revision = old.revision then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

create or replace function public.sync_support_ticket_message_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.support_tickets
  set last_message_preview = new.message,
      last_message_at = new.created_at,
      unread_for_admin = case when new.author_type = 'agent' then true else unread_for_admin end,
      unread_for_agent = case when new.author_type = 'admin' then true else unread_for_agent end
  where id = new.ticket_id;
  return new;
end;
$$;

-- Recreate the activity trigger once so the migration is idempotent.
drop trigger if exists support_ticket_messages_sync_activity on public.support_ticket_messages;
create trigger support_ticket_messages_sync_activity
after insert on public.support_ticket_messages
for each row execute function public.sync_support_ticket_message_activity();

update public.support_tickets ticket
set unread_for_admin = coalesce((
      select message.author_type = 'agent'
      from public.support_ticket_messages message
      where message.ticket_id = ticket.id
      order by message.created_at desc
      limit 1
    ), false),
    unread_for_agent = coalesce((
      select message.author_type = 'admin'
      from public.support_ticket_messages message
      where message.ticket_id = ticket.id
      order by message.created_at desc
      limit 1
    ), false)
where exists (select 1 from public.support_ticket_messages message where message.ticket_id = ticket.id);

-- Verification review ledger -------------------------------------------------
create table if not exists public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete restrict,
  reviewer_id uuid not null references public.admins(id),
  decision text not null check (decision in ('approved', 'request_changes')),
  previous_status text not null,
  document_count integer not null check (document_count between 0 and 3),
  reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz not null default now(),
  review_version bigint not null,
  created_at timestamptz not null default now(),
  constraint verification_reviews_reason_check
    check (decision = 'approved' or (reason is not null and char_length(btrim(reason)) between 3 and 2000))
);

create index if not exists verification_reviews_agent_idx
  on public.verification_reviews(agent_id, reviewed_at desc);

create or replace function public.touch_verification_submission_timestamp()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.verification_documents_url is distinct from old.verification_documents_url then
    new.verification_submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists users_profile_verification_submission_timestamp on public.users_profile;
create trigger users_profile_verification_submission_timestamp
before update of verification_documents_url on public.users_profile
for each row execute function public.touch_verification_submission_timestamp();

-- Role checks are kept in SECURITY DEFINER helpers so service-role dashboard
-- calls cannot accidentally widen access when a UI role is changed.
create or replace function public.people_admin_has_role(p_admin_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.admins a
    where a.id = p_admin_id
      and coalesce(a.is_active, false)
      and (
        a.role::text in ('super_admin', p_role)
        or exists (
          select 1
          from unnest(coalesce(a.roles, '{}'::public.admin_role[])) assigned_role
          where assigned_role::text in ('super_admin', p_role)
        )
      )
  );
$$;

create or replace function public.people_admin_is_super_admin(p_admin_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.people_admin_has_role(p_admin_id, 'super_admin');
$$;

create or replace function public.support_admin_can_access_category(p_admin_id uuid, p_category text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.people_admin_has_role(p_admin_id, 'user_support_admin')
      or (
        public.people_admin_has_role(p_admin_id, 'developers_admin')
        and p_category in ('technical', 'property', 'property_request')
      );
$$;

-- Account access changes are recoverable and never remove Auth or business
-- records.  Auth banning/unbanning is performed by the route with
-- compensation, while this function is the transactional profile boundary.
create or replace function public.set_agent_account_access(
  p_agent_id uuid,
  p_admin_id uuid,
  p_suspended boolean,
  p_reason text default 'Account access state changed by an administrator'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  profile_row public.users_profile%rowtype;
  reason_value text := btrim(coalesce(p_reason, ''));
  next_state text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_admin_id, 'user_auth_admin') then raise exception 'User auth admin required'; end if;
  if char_length(reason_value) not between 3 and 1000 then raise exception 'A reason between 3 and 1000 characters is required'; end if;

  if exists (select 1 from public.admins where id = p_agent_id)
     or exists (select 1 from public.developer_accounts where auth_user_id = p_agent_id) then
    raise exception 'Dashboard identities must be separated before changing agent access';
  end if;

  select * into profile_row from public.users_profile where id = p_agent_id for update;
  if not found then raise exception 'Agent not found'; end if;
  if profile_row.account_lifecycle_state in ('archived', 'anonymized', 'purged') then
    raise exception 'Archived or purged accounts require their lifecycle workflow';
  end if;

  if p_suspended then
    next_state := 'suspended';
    update public.users_profile
    set account_status = 'suspended', account_lifecycle_state = next_state, updated_at = now()
    where id = p_agent_id;
    update public.device_push_tokens set enabled = false, updated_at = now() where agent_id = p_agent_id;
    insert into public.agent_account_lifecycle_events(agent_id, event_type, actor_id, reason, metadata)
    values (p_agent_id, 'suspended', p_admin_id, reason_value, jsonb_build_object('account_status', 'suspended'));
  else
    if profile_row.account_lifecycle_state <> 'suspended' then
      raise exception 'Only suspended accounts can be restored with this action';
    end if;
    next_state := 'active';
    update public.users_profile
    set account_status = 'active', account_lifecycle_state = next_state, updated_at = now()
    where id = p_agent_id;
    insert into public.agent_account_lifecycle_events(agent_id, event_type, actor_id, reason, metadata)
    values (p_agent_id, 'restored', p_admin_id, reason_value, jsonb_build_object('account_status', 'active'));
  end if;
  return jsonb_build_object('agent_id', p_agent_id, 'state', next_state);
end;
$$;

create or replace function public.archive_agent_account(
  p_agent_id uuid,
  p_admin_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  profile_row public.users_profile%rowtype;
  reason_value text := btrim(coalesce(p_reason, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_admin_id, 'user_auth_admin') then raise exception 'User auth admin required'; end if;
  if char_length(reason_value) not between 3 and 1000 then raise exception 'A reason between 3 and 1000 characters is required'; end if;
  if exists (select 1 from public.admins where id = p_agent_id)
     or exists (select 1 from public.developer_accounts where auth_user_id = p_agent_id) then
    raise exception 'Dashboard identities must be separated before archiving';
  end if;

  select * into profile_row from public.users_profile where id = p_agent_id for update;
  if not found then raise exception 'Agent not found'; end if;
  if profile_row.account_lifecycle_state in ('anonymized', 'purged') then raise exception 'This account is already irreversibly processed'; end if;
  if profile_row.account_lifecycle_state = 'archived' then
    return jsonb_build_object('agent_id', p_agent_id, 'state', 'archived', 'idempotent', true);
  end if;

  update public.users_profile
  set account_status = 'suspended', account_lifecycle_state = 'archived',
      archived_at = now(), archived_by = p_admin_id, archive_reason = reason_value, updated_at = now()
  where id = p_agent_id;
  update public.device_push_tokens set enabled = false, updated_at = now() where agent_id = p_agent_id;
  insert into public.agent_account_lifecycle_events(agent_id, event_type, actor_id, reason, metadata)
  values (p_agent_id, 'archived', p_admin_id, reason_value, jsonb_build_object('recoverable', true));
  return jsonb_build_object('agent_id', p_agent_id, 'state', 'archived', 'idempotent', false);
end;
$$;

create or replace function public.restore_archived_agent_account(
  p_agent_id uuid,
  p_admin_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  profile_row public.users_profile%rowtype;
  reason_value text := btrim(coalesce(p_reason, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_admin_id, 'user_auth_admin') then raise exception 'User auth admin required'; end if;
  if char_length(reason_value) not between 3 and 1000 then raise exception 'A reason between 3 and 1000 characters is required'; end if;
  select * into profile_row from public.users_profile where id = p_agent_id for update;
  if not found then raise exception 'Agent not found'; end if;
  if profile_row.account_lifecycle_state in ('anonymized', 'purged') then raise exception 'Purged accounts cannot be restored'; end if;
  if profile_row.account_status = 'banned' then raise exception 'Banned accounts require a separate review process'; end if;
  if profile_row.account_lifecycle_state <> 'archived' then raise exception 'Only archived accounts can be restored'; end if;

  update public.users_profile
  set account_status = 'active', account_lifecycle_state = 'active', archived_at = null,
      archived_by = null, archive_reason = null, updated_at = now()
  where id = p_agent_id;
  insert into public.agent_account_lifecycle_events(agent_id, event_type, actor_id, reason, metadata)
  values (p_agent_id, 'restored', p_admin_id, reason_value, jsonb_build_object('recoverable', true));
  return jsonb_build_object('agent_id', p_agent_id, 'state', 'active');
end;
$$;

create or replace function public.create_agent_retention_snapshot(
  p_agent_id uuid,
  p_generated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  profile_row public.users_profile%rowtype;
  snapshot_id uuid;
  snapshot_payload jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_generated_by, 'user_auth_admin') then raise exception 'User auth admin required'; end if;

  select * into profile_row from public.users_profile where id = p_agent_id for update;
  if not found then raise exception 'Agent not found'; end if;
  if profile_row.account_lifecycle_state <> 'archived' then raise exception 'Archive the account before creating a retention snapshot'; end if;

  snapshot_payload := jsonb_build_object(
    'snapshot_schema_version', 1,
    'generated_at', now(),
    'agent_id', p_agent_id,
    'retention_notice', 'Retained for regulated business continuity. This operator-only snapshot contains selected business metadata; direct identifiers, document paths, and financial secrets are excluded.',
    'profile', jsonb_build_object(
      'id', profile_row.id,
      'account_status', profile_row.account_status,
      'account_lifecycle_state', profile_row.account_lifecycle_state,
      'verification_status', profile_row.verification_status,
      'account_created_at', profile_row.account_created_at,
      'account_expires_at', profile_row.account_expires_at,
      'total_deals', profile_row.total_deals,
      'successful_deals', profile_row.successful_deals,
      'total_earnings', profile_row.total_earnings,
      'total_referrals', profile_row.total_referrals,
      'verified_referrals', profile_row.verified_referrals,
      'referrals_with_first_deal', profile_row.referrals_with_first_deal,
      'base_commission_rate', profile_row.base_commission_rate,
      'referral_bonus_rate', profile_row.referral_bonus_rate,
      'phone_verified', profile_row.phone_verified,
      'created_at', profile_row.created_at,
      'updated_at', profile_row.updated_at
    ),
    'sensitive_fields_redacted', jsonb_build_array('first_name_en', 'last_name_en', 'first_name_ar', 'last_name_ar', 'display_name', 'phone', 'bio', 'profile_picture_url', 'verification_documents_url', 'contract_signature_url', 'bank_name', 'bank_account_holder', 'bank_account_number', 'bank_iban', 'bank_swift_code', 'national_id', 'national_id_number'),
    'preserved_business_records', jsonb_build_object(
      'profile_id', p_agent_id,
      'deals_count', coalesce(profile_row.total_deals, 0),
      'earnings_total', profile_row.total_earnings,
      'referrals_count', coalesce(profile_row.total_referrals, 0),
      'verified_referrals_count', coalesce(profile_row.verified_referrals, 0),
      'referrals_with_first_deal_count', coalesce(profile_row.referrals_with_first_deal, 0),
      'note', 'The users_profile identity and related business records remain addressable after purge.'
    ),
    'lifecycle_events', coalesce((
      select jsonb_agg(to_jsonb(lifecycle_event) order by lifecycle_event.created_at)
      from public.agent_account_lifecycle_events lifecycle_event
      where lifecycle_event.agent_id = p_agent_id
    ), '[]'::jsonb)
  );

  insert into public.agent_account_retention_snapshots(agent_id, generated_by, snapshot)
  values (p_agent_id, p_generated_by, snapshot_payload)
  returning id into snapshot_id;

  return jsonb_build_object(
    'snapshot_id', snapshot_id,
    'agent_id', p_agent_id,
    'generated_at', snapshot_payload->>'generated_at',
    'download_url', '/api/admin/agents/retained-snapshot?snapshotId=' || snapshot_id::text
  );
end;
$$;

-- The four-argument form lets the UI bind a purge request to the exact
-- snapshot the operator downloaded.  It still accepts the latest recent
-- snapshot for compatibility with older dashboard clients.
create or replace function public.request_agent_purge(
  p_agent_id uuid,
  p_requested_by uuid,
  p_reason text,
  p_snapshot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  profile_row public.users_profile%rowtype;
  snapshot_id uuid;
  existing_id uuid;
  request_id uuid;
  reason_value text := btrim(coalesce(p_reason, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_requested_by, 'user_auth_admin') then raise exception 'User auth admin required'; end if;
  if char_length(reason_value) not between 3 and 1000 then raise exception 'A reason between 3 and 1000 characters is required'; end if;
  select * into profile_row from public.users_profile where id = p_agent_id for update;
  if not found then raise exception 'Agent not found'; end if;
  if profile_row.account_lifecycle_state <> 'archived' then raise exception 'Archive the account before requesting purge'; end if;

  if p_snapshot_id is null then
    select id into snapshot_id
    from public.agent_account_retention_snapshots
    where agent_id = p_agent_id and generated_at >= now() - interval '24 hours' and downloaded_at is not null
    order by generated_at desc
    limit 1
    for update;
  else
    select id into snapshot_id
    from public.agent_account_retention_snapshots
    where id = p_snapshot_id
      and agent_id = p_agent_id
      and generated_at >= now() - interval '24 hours'
      and downloaded_at is not null
    for update;
  end if;
  if snapshot_id is null then raise exception 'Download a recent retained-data snapshot before requesting purge'; end if;

  select id into existing_id from public.agent_account_purge_requests where agent_id = p_agent_id and status = 'pending' for update;
  if existing_id is not null then return existing_id; end if;

  insert into public.agent_account_purge_requests(agent_id, requested_by, retention_snapshot_id, request_reason, metadata)
  values (p_agent_id, p_requested_by, snapshot_id, reason_value, jsonb_build_object('retention_snapshot_id', snapshot_id, 'snapshot_required_before_request', true))
  returning id into request_id;
  insert into public.agent_account_lifecycle_events(agent_id, event_type, actor_id, reason, metadata)
  values (p_agent_id, 'purge_requested', p_requested_by, reason_value, jsonb_build_object('requires_independent_super_admin', true, 'retention_snapshot_id', snapshot_id));
  return request_id;
end;
$$;

-- Preserve the original callable shape while enforcing the same snapshot gate.
create or replace function public.request_agent_purge(
  p_agent_id uuid,
  p_requested_by uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return public.request_agent_purge(p_agent_id, p_requested_by, p_reason, null);
end;
$$;

create or replace function public.approve_agent_purge(
  p_request_id uuid,
  p_approved_by uuid,
  p_approval_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_row public.agent_account_purge_requests%rowtype;
  profile_row public.users_profile%rowtype;
  reason_value text := btrim(coalesce(p_approval_reason, ''));
  replacement_phone text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_is_super_admin(p_approved_by) then raise exception 'Independent super admin approval required'; end if;
  if char_length(reason_value) not between 3 and 1000 then raise exception 'An approval reason between 3 and 1000 characters is required'; end if;

  select * into request_row from public.agent_account_purge_requests where id = p_request_id for update;
  if not found then raise exception 'Purge request not found'; end if;
  if request_row.status <> 'pending' then raise exception 'Purge request is no longer pending'; end if;
  if request_row.requested_by = p_approved_by then raise exception 'The purge must be approved by an independent administrator'; end if;
  if request_row.retention_snapshot_id is null then raise exception 'Purge request has no retained-data snapshot'; end if;
  select * into profile_row from public.users_profile where id = request_row.agent_id for update;
  if not found then raise exception 'Agent not found'; end if;
  if profile_row.account_lifecycle_state <> 'archived' then raise exception 'Only archived accounts can be purged'; end if;

  loop
    replacement_phone := '+1999' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    exit when not exists (select 1 from public.users_profile where phone = replacement_phone);
  end loop;

  -- Preserve the profile identity used by business records while removing
  -- direct identifiers, documents, financial details, and device reachability.
  update public.users_profile
  set first_name_en = 'Archived', last_name_en = 'Agent',
      first_name_ar = 'Archived', last_name_ar = 'Agent',
      display_name = 'Archived agent ' || substr(id::text, 1, 8),
      phone = replacement_phone, bio = null, profile_picture_url = null,
      verification_documents_url = null, contract_signature_url = null,
      verification_rejection_reason = null, verification_status = 'rejected', verified_at = null,
      bank_name = null, bank_account_holder = null, bank_account_number = null,
      bank_iban = null, bank_swift_code = null, bank_details_approved = false,
      referral_code = 'PURGED' || upper(replace(substr(id::text, 1, 8), '-', '')),
      account_status = 'suspended', account_lifecycle_state = 'purged',
      anonymized_at = now(), purged_at = now(), verification_reviewed_by = p_approved_by,
      verification_reviewed_at = now(), updated_at = now()
  where id = request_row.agent_id;
  update public.device_push_tokens set enabled = false, updated_at = now() where agent_id = request_row.agent_id;

  update public.agent_account_purge_requests
  set status = 'executed', approved_by = p_approved_by, approval_reason = reason_value,
      approved_at = now(), executed_at = now(),
      metadata = metadata || jsonb_build_object('preserved_business_records', true, 'fresh_session_required', true)
  where id = request_row.id;
  insert into public.agent_account_lifecycle_events(agent_id, event_type, actor_id, reason, metadata)
  values (request_row.agent_id, 'purge_approved', p_approved_by, reason_value, jsonb_build_object('request_id', request_row.id));
  insert into public.agent_account_lifecycle_events(agent_id, event_type, actor_id, reason, metadata)
  values (request_row.agent_id, 'purged', p_approved_by, reason_value, jsonb_build_object('request_id', request_row.id, 'business_records_preserved', true));

  return jsonb_build_object('agent_id', request_row.agent_id, 'request_id', request_row.id, 'state', 'purged');
end;
$$;

-- Verification review is one locked transaction: state preconditions,
-- reviewer/version metadata, review history, and mobile notification commit or
-- roll back together.
create or replace function public.review_agent_verification(
  p_agent_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_reason text default null,
  p_expected_review_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  profile_row public.users_profile%rowtype;
  document_count integer;
  reason_value text := nullif(btrim(coalesce(p_reason, '')), '');
  next_version bigint;
  next_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_reviewer_id, 'user_auth_admin') then raise exception 'User auth admin required'; end if;
  if p_decision not in ('approved', 'request_changes') then raise exception 'Invalid verification decision'; end if;
  if p_decision = 'request_changes' and (reason_value is null or char_length(reason_value) not between 3 and 2000) then
    raise exception 'A change-request reason between 3 and 2000 characters is required';
  end if;

  select * into profile_row from public.users_profile where id = p_agent_id for update;
  if not found then raise exception 'Verification profile not found'; end if;
  if profile_row.account_status <> 'active' or profile_row.account_lifecycle_state <> 'active' then raise exception 'Only active profiles can be reviewed'; end if;
  if profile_row.verification_status <> 'pending' then raise exception 'Only pending verification profiles can be reviewed'; end if;
  if p_expected_review_version is not null and p_expected_review_version <> coalesce(profile_row.verification_review_version, 0) then
    raise exception 'Verification request changed; reload the queue';
  end if;

  document_count := coalesce(array_length(profile_row.verification_documents_url, 1), 0);
  if p_decision = 'approved' then
    if document_count < 1 or document_count > 3 then raise exception 'At least one and at most three verification documents are required'; end if;
    if exists (
      select 1 from unnest(profile_row.verification_documents_url) document_path
      where document_path is null or char_length(btrim(document_path)) = 0
    ) then raise exception 'Verification documents must not be empty'; end if;
    next_status := 'verified';
  else
    next_status := 'pending';
  end if;
  next_version := coalesce(profile_row.verification_review_version, 0) + 1;

  update public.users_profile
  set verification_status = next_status::public.verification_status,
      verification_rejection_reason = case when p_decision = 'request_changes' then reason_value else null end,
      verified_at = case when p_decision = 'approved' then now() else null end,
      verification_reviewed_by = p_reviewer_id, verification_reviewed_at = now(),
      verification_review_version = next_version, updated_at = now()
  where id = p_agent_id;

  insert into public.verification_reviews(
    agent_id, reviewer_id, decision, previous_status, document_count,
    reason, submitted_at, reviewed_at, review_version
  ) values (
    p_agent_id, p_reviewer_id, p_decision, profile_row.verification_status::text,
    document_count, reason_value, profile_row.verification_submitted_at, now(), next_version
  );

  insert into public.notifications(
    agent_id, type, title, message, related_entity_type, related_entity_id, action_url
  ) values (
    p_agent_id,
    'admin_message',
    case when p_decision = 'approved' then 'Verification approved' else 'Verification changes requested' end,
    case when p_decision = 'approved' then 'Your verification is complete and your workspace is available.'
         else 'Please review the requested changes and submit updated verification documents.' end,
    'verification', p_agent_id, '/profile'
  );

  return jsonb_build_object('agent_id', p_agent_id, 'status', next_status, 'review_version', next_version, 'document_count', document_count);
end;
$$;

-- Preserve the mobile document-upload contract while recording the exact
-- submission timestamp and reopening a previously reviewed profile.
create or replace function public.submit_verification_documents(p_paths text[])
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller uuid := auth.uid();
  item text;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_paths is null or coalesce(array_length(p_paths, 1), 0) < 1 or array_length(p_paths, 1) > 3 then
    raise exception 'Upload one to three verification documents';
  end if;
  foreach item in array p_paths loop
    if item is null or length(item) > 512 or item !~ ('^' || caller::text || '/[^/].*') then
      raise exception 'Invalid verification document path';
    end if;
  end loop;
  update public.users_profile
  set verification_documents_url = p_paths,
      verification_status = 'pending', verification_rejection_reason = null,
      verification_reviewed_by = null, verification_reviewed_at = null,
      verification_submitted_at = now(), updated_at = now()
  where id = caller and account_status = 'active' and account_lifecycle_state = 'active';
  if not found then raise exception 'Only active profiles can submit verification documents'; end if;
  return true;
end;
$$;

-- Support authorization and atomic operations --------------------------------
create or replace function public.admin_claim_support_ticket(
  p_ticket_id uuid,
  p_admin_id uuid,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ticket_row public.support_tickets%rowtype;
  next_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into ticket_row from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Support ticket not found'; end if;
  if not public.support_admin_can_access_category(p_admin_id, ticket_row.category) then raise exception 'Support category is outside your role scope'; end if;
  if p_expected_updated_at is not null and ticket_row.updated_at is distinct from p_expected_updated_at then raise exception 'Support ticket changed; reload before claiming'; end if;
  if ticket_row.status = 'closed' then raise exception 'Closed tickets cannot be claimed'; end if;
  if ticket_row.assigned_to is not null and ticket_row.assigned_to <> p_admin_id then raise exception 'Ticket is already assigned to another administrator'; end if;
  next_status := case when ticket_row.status = 'new' then 'in_progress' else ticket_row.status end;

  update public.support_tickets
  set assigned_to = p_admin_id, status = next_status, unread_for_admin = false,
      last_admin_read_at = now(), revision = revision + 1
  where id = p_ticket_id;
  insert into public.support_ticket_events(ticket_id, event_type, actor_id, from_status, to_status, from_owner, to_owner)
  values (p_ticket_id, 'claimed', p_admin_id, ticket_row.status, next_status, ticket_row.assigned_to, p_admin_id);
  return jsonb_build_object('ticket_id', p_ticket_id, 'status', next_status, 'assigned_to', p_admin_id);
end;
$$;

create or replace function public.admin_update_support_ticket_status(
  p_ticket_id uuid,
  p_admin_id uuid,
  p_status text,
  p_expected_updated_at timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ticket_row public.support_tickets%rowtype;
  reason_value text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_status not in ('new', 'in_progress', 'waiting_agent', 'resolved', 'closed') then raise exception 'Invalid support status'; end if;
  select * into ticket_row from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Support ticket not found'; end if;
  if not public.support_admin_can_access_category(p_admin_id, ticket_row.category) then raise exception 'Support category is outside your role scope'; end if;
  if p_expected_updated_at is not null and ticket_row.updated_at is distinct from p_expected_updated_at then raise exception 'Support ticket changed; reload before updating'; end if;
  if ticket_row.status = 'closed' and p_status <> 'closed' then raise exception 'Closed tickets must be reopened through the recovery workflow'; end if;
  if p_status = 'closed' and reason_value is null then raise exception 'A close reason is required'; end if;

  update public.support_tickets
  set status = p_status,
      resolved_at = case when p_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end,
      closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else null end,
      unread_for_admin = false, last_admin_read_at = now(), revision = revision + 1
  where id = p_ticket_id;
  insert into public.support_ticket_events(ticket_id, event_type, actor_id, from_status, to_status, metadata)
  values (p_ticket_id, 'status_changed', p_admin_id, ticket_row.status, p_status, jsonb_build_object('reason', reason_value));
  if p_status in ('resolved', 'closed') then
    insert into public.notifications(agent_id, type, title, message, related_entity_type, related_entity_id, action_url)
    values (ticket_row.agent_id, 'admin_message', 'Support ticket updated',
      case when p_status = 'closed' then 'Your support ticket has been closed.' else 'Your support ticket has been marked resolved.' end,
      'support_ticket', p_ticket_id, '/support');
  end if;
  return jsonb_build_object('ticket_id', p_ticket_id, 'status', p_status);
end;
$$;

create or replace function public.admin_reply_to_support_ticket(
  p_ticket_id uuid,
  p_admin_id uuid,
  p_message text,
  p_expected_updated_at timestamptz
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
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if char_length(message_value) not between 1 and 20000 then raise exception 'Reply must contain between 1 and 20000 characters'; end if;
  select * into ticket_row from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Support ticket not found'; end if;
  if not public.support_admin_can_access_category(p_admin_id, ticket_row.category) then raise exception 'Support category is outside your role scope'; end if;
  if p_expected_updated_at is not null and ticket_row.updated_at is distinct from p_expected_updated_at then raise exception 'Support ticket changed; reload before replying'; end if;
  if ticket_row.status = 'closed' then raise exception 'Closed tickets cannot receive replies'; end if;

  insert into public.support_ticket_messages(ticket_id, author_type, author_id, message)
  values (p_ticket_id, 'admin', p_admin_id, message_value);
  update public.support_tickets
  set status = 'waiting_agent', assigned_to = p_admin_id,
      first_response_at = coalesce(first_response_at, now()), unread_for_agent = true,
      revision = revision + 1
  where id = p_ticket_id;
  insert into public.support_ticket_events(ticket_id, event_type, actor_id, from_status, to_status, from_owner, to_owner)
  values (p_ticket_id, 'replied', p_admin_id, ticket_row.status, 'waiting_agent', ticket_row.assigned_to, p_admin_id);
  insert into public.notifications(
    agent_id, type, title, message, related_entity_type, related_entity_id, action_url
  ) values (
    ticket_row.agent_id, 'admin_message', 'Support replied', left(message_value, 240),
    'support_ticket', p_ticket_id, '/support'
  );
end;
$$;

-- Compatibility wrapper for older callers. New dashboard code always sends
-- the optimistic timestamp through the four-argument function.
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
begin
  perform public.admin_reply_to_support_ticket(p_ticket_id, p_admin_id, p_message, null);
end;
$$;

create or replace function public.admin_mark_support_ticket_read(
  p_ticket_id uuid,
  p_admin_id uuid,
  p_expected_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ticket_row public.support_tickets%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into ticket_row from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Support ticket not found'; end if;
  if not public.support_admin_can_access_category(p_admin_id, ticket_row.category) then raise exception 'Support category is outside your role scope'; end if;
  if p_expected_updated_at is not null and ticket_row.updated_at is distinct from p_expected_updated_at then raise exception 'Support ticket changed; reload before marking read'; end if;
  update public.support_tickets
  set unread_for_admin = false, last_admin_read_at = now(), revision = revision + 1
  where id = p_ticket_id;
  insert into public.support_ticket_events(ticket_id, event_type, actor_id, metadata)
  values (p_ticket_id, 'read', p_admin_id, jsonb_build_object('scope', 'admin'));
end;
$$;

create or replace function public.admin_create_support_macro(
  p_admin_id uuid,
  p_title text,
  p_message text,
  p_category text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  macro_id uuid;
  title_value text := btrim(coalesce(p_title, ''));
  message_value text := btrim(coalesce(p_message, ''));
  category_value text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_admin_id, 'user_support_admin')
     and not public.people_admin_has_role(p_admin_id, 'developers_admin') then raise exception 'Support administrator required'; end if;
  if char_length(title_value) not between 1 and 200 or char_length(message_value) not between 1 and 20000 then raise exception 'Macro title and message are required'; end if;
  if category_value is null or category_value not in ('verification', 'deal', 'payout', 'technical', 'property', 'property_request', 'other') then raise exception 'A valid macro category is required'; end if;
  if not public.support_admin_can_access_category(p_admin_id, category_value) then raise exception 'Macro category is outside your role scope'; end if;
  insert into public.support_macros(title, message, category, created_by, updated_by, is_demo)
  values (title_value, message_value, category_value, p_admin_id, p_admin_id, false)
  returning id into macro_id;
  insert into public.support_macro_versions(macro_id, version, action, title, message, category, is_active, changed_by, reason)
  values (macro_id, 1, 'created', title_value, message_value, category_value, true, p_admin_id, 'Macro created');
  return macro_id;
end;
$$;

create or replace function public.admin_update_support_macro(
  p_macro_id uuid,
  p_admin_id uuid,
  p_title text,
  p_message text,
  p_category text,
  p_expected_revision bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  macro_row public.support_macros%rowtype;
  title_value text := btrim(coalesce(p_title, ''));
  message_value text := btrim(coalesce(p_message, ''));
  category_value text := nullif(btrim(coalesce(p_category, '')), '');
  reason_value text := btrim(coalesce(p_reason, ''));
  next_revision bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_admin_id, 'user_support_admin')
     and not public.people_admin_has_role(p_admin_id, 'developers_admin') then raise exception 'Support administrator required'; end if;
  if p_expected_revision is null then raise exception 'Macro revision is required'; end if;
  if char_length(reason_value) not between 3 and 1000 then raise exception 'An edit reason between 3 and 1000 characters is required'; end if;
  if char_length(title_value) not between 1 and 200 or char_length(message_value) not between 1 and 20000 then raise exception 'Macro title and message are required'; end if;
  if category_value is null or category_value not in ('verification', 'deal', 'payout', 'technical', 'property', 'property_request', 'other') then raise exception 'A valid macro category is required'; end if;
  if not public.support_admin_can_access_category(p_admin_id, category_value) then raise exception 'Macro category is outside your role scope'; end if;

  select * into macro_row from public.support_macros where id = p_macro_id for update;
  if not found then raise exception 'Support macro not found'; end if;
  if macro_row.category is not null and not public.support_admin_can_access_category(p_admin_id, macro_row.category) then raise exception 'Macro category is outside your role scope'; end if;
  if macro_row.revision <> p_expected_revision then raise exception 'Macro changed; reload before editing'; end if;
  next_revision := macro_row.revision + 1;

  update public.support_macros
  set title = title_value, message = message_value, category = category_value,
      revision = next_revision, updated_by = p_admin_id, updated_at = now()
  where id = p_macro_id;
  insert into public.support_macro_versions(macro_id, version, action, title, message, category, is_active, changed_by, reason)
  values (p_macro_id, next_revision, 'updated', title_value, message_value, category_value, macro_row.is_active, p_admin_id, reason_value);
  return jsonb_build_object('macro_id', p_macro_id, 'revision', next_revision, 'is_active', macro_row.is_active);
end;
$$;

create or replace function public.admin_set_support_macro_active(
  p_macro_id uuid,
  p_admin_id uuid,
  p_active boolean,
  p_expected_revision bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  macro_row public.support_macros%rowtype;
  reason_value text := btrim(coalesce(p_reason, ''));
  next_revision bigint;
  action_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.people_admin_has_role(p_admin_id, 'user_support_admin')
     and not public.people_admin_has_role(p_admin_id, 'developers_admin') then raise exception 'Support administrator required'; end if;
  if p_active is null then raise exception 'Macro active state is required'; end if;
  if p_expected_revision is null then raise exception 'Macro revision is required'; end if;
  if char_length(reason_value) not between 3 and 1000 then raise exception 'A status-change reason between 3 and 1000 characters is required'; end if;

  select * into macro_row from public.support_macros where id = p_macro_id for update;
  if not found then raise exception 'Support macro not found'; end if;
  if macro_row.category is null or not public.support_admin_can_access_category(p_admin_id, macro_row.category) then raise exception 'Macro category is outside your role scope'; end if;
  if macro_row.revision <> p_expected_revision then raise exception 'Macro changed; reload before changing its status'; end if;
  if macro_row.is_active = p_active then
    return jsonb_build_object('macro_id', p_macro_id, 'revision', macro_row.revision, 'is_active', macro_row.is_active, 'idempotent', true);
  end if;
  next_revision := macro_row.revision + 1;
  action_value := case when p_active then 'activated' else 'deactivated' end;

  update public.support_macros
  set is_active = p_active, revision = next_revision, updated_by = p_admin_id, updated_at = now(),
      deactivated_at = case when p_active then null else now() end,
      deactivated_by = case when p_active then null else p_admin_id end,
      deactivation_reason = case when p_active then null else reason_value end
  where id = p_macro_id;
  insert into public.support_macro_versions(macro_id, version, action, title, message, category, is_active, changed_by, reason)
  values (p_macro_id, next_revision, action_value, macro_row.title, macro_row.message, macro_row.category, p_active, p_admin_id, reason_value);
  return jsonb_build_object('macro_id', p_macro_id, 'revision', next_revision, 'is_active', p_active);
end;
$$;

-- All tables and operations above are dashboard service-role boundaries.
alter table public.agent_account_lifecycle_events enable row level security;
alter table public.agent_account_lifecycle_events force row level security;
alter table public.agent_account_retention_snapshots enable row level security;
alter table public.agent_account_retention_snapshots force row level security;
alter table public.agent_account_purge_requests enable row level security;
alter table public.agent_account_purge_requests force row level security;
alter table public.support_ticket_events enable row level security;
alter table public.support_ticket_events force row level security;
alter table public.support_macro_versions enable row level security;
alter table public.support_macro_versions force row level security;
alter table public.verification_reviews enable row level security;
alter table public.verification_reviews force row level security;

revoke all on public.agent_account_lifecycle_events, public.agent_account_purge_requests,
  public.agent_account_retention_snapshots, public.support_ticket_events,
  public.support_macro_versions, public.verification_reviews
  from public, anon, authenticated;
grant all on public.agent_account_lifecycle_events, public.agent_account_purge_requests,
  public.agent_account_retention_snapshots, public.support_ticket_events,
  public.support_macro_versions, public.verification_reviews to service_role;

revoke all on function public.people_admin_has_role(uuid, text) from public, anon, authenticated;
revoke all on function public.people_admin_is_super_admin(uuid) from public, anon, authenticated;
revoke all on function public.support_admin_can_access_category(uuid, text) from public, anon, authenticated;
revoke all on function public.set_agent_account_access(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.archive_agent_account(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.restore_archived_agent_account(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_agent_retention_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.request_agent_purge(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.request_agent_purge(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.approve_agent_purge(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.review_agent_verification(uuid, uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.submit_verification_documents(text[]) from public, anon;
revoke all on function public.admin_claim_support_ticket(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_update_support_ticket_status(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_reply_to_support_ticket(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_reply_to_support_ticket(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_mark_support_ticket_read(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_create_support_macro(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_support_macro(uuid, uuid, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.admin_set_support_macro_active(uuid, uuid, boolean, bigint, text) from public, anon, authenticated;

grant execute on function public.set_agent_account_access(uuid, uuid, boolean, text) to service_role;
grant execute on function public.archive_agent_account(uuid, uuid, text) to service_role;
grant execute on function public.restore_archived_agent_account(uuid, uuid, text) to service_role;
grant execute on function public.create_agent_retention_snapshot(uuid, uuid) to service_role;
grant execute on function public.request_agent_purge(uuid, uuid, text) to service_role;
grant execute on function public.request_agent_purge(uuid, uuid, text, uuid) to service_role;
grant execute on function public.approve_agent_purge(uuid, uuid, text) to service_role;
grant execute on function public.review_agent_verification(uuid, uuid, text, text, bigint) to service_role;
grant execute on function public.submit_verification_documents(text[]) to authenticated;
grant execute on function public.admin_claim_support_ticket(uuid, uuid, timestamptz) to service_role;
grant execute on function public.admin_update_support_ticket_status(uuid, uuid, text, timestamptz, text) to service_role;
grant execute on function public.admin_reply_to_support_ticket(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.admin_reply_to_support_ticket(uuid, uuid, text) to service_role;
grant execute on function public.admin_mark_support_ticket_read(uuid, uuid, timestamptz) to service_role;
grant execute on function public.admin_create_support_macro(uuid, text, text, text) to service_role;
grant execute on function public.admin_update_support_macro(uuid, uuid, text, text, text, bigint, text) to service_role;
grant execute on function public.admin_set_support_macro_active(uuid, uuid, boolean, bigint, text) to service_role;

revoke all on function public.touch_verification_submission_timestamp() from public, anon, authenticated;
revoke all on function public.touch_support_ticket_updated_at() from public, anon, authenticated;
revoke all on function public.sync_support_ticket_message_activity() from public, anon, authenticated;

commit;
