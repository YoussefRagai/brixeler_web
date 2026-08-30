begin;

-- Developer sales operations are deliberately additive.  The existing mobile
-- contact-request contract keeps writing to developer_contact_requests; this
-- migration turns that table into a tenant-scoped lead inbox while retaining
-- the original snapshots and notification behavior.
alter table public.developer_contact_requests
  drop constraint if exists developer_contact_requests_status_check;

update public.developer_contact_requests
set status = case when status = 'closed' then 'lost' else 'new' end
where status in ('open', 'closed');

alter table public.developer_contact_requests
  alter column status set default 'new',
  add column if not exists assigned_to_account_id uuid references public.developer_accounts(id) on delete set null,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists sla_due_at timestamptz,
  add column if not exists duplicate_of_request_id uuid references public.developer_contact_requests(id) on delete set null,
  add column if not exists duplicate_reason text,
  add column if not exists source text not null default 'mobile',
  add column if not exists lost_reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.developer_contact_requests
  add constraint developer_contact_requests_status_check
  check (status in ('new', 'contacted', 'qualified', 'viewing', 'reservation', 'won', 'lost'));

-- Give pre-existing inbox rows the same response window as new mobile leads;
-- this is derived from their immutable creation timestamp, not fabricated
-- engagement data.
update public.developer_contact_requests
set sla_due_at = created_at + interval '1 day'
where sla_due_at is null;

create index if not exists developer_contact_requests_tenant_status_idx
  on public.developer_contact_requests (developer_id, status, created_at desc);
create index if not exists developer_contact_requests_tenant_assignee_idx
  on public.developer_contact_requests (developer_id, assigned_to_account_id, next_follow_up_at);
create index if not exists developer_contact_requests_sla_idx
  on public.developer_contact_requests (developer_id, sla_due_at)
  where status not in ('won', 'lost');
create index if not exists developer_contact_requests_duplicate_idx
  on public.developer_contact_requests (developer_id, duplicate_of_request_id)
  where duplicate_of_request_id is not null;

-- Internal collaboration and immutable lead history.
create table if not exists public.developer_contact_request_notes (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  contact_request_id uuid not null references public.developer_contact_requests(id) on delete cascade,
  author_account_id uuid not null references public.developer_accounts(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  mentioned_account_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists developer_contact_request_notes_request_idx
  on public.developer_contact_request_notes (developer_id, contact_request_id, created_at desc);

create table if not exists public.developer_contact_request_status_history (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  contact_request_id uuid not null references public.developer_contact_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by_account_id uuid references public.developer_accounts(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  constraint developer_contact_request_status_history_status_check
    check (to_status in ('new', 'contacted', 'qualified', 'viewing', 'reservation', 'won', 'lost'))
);

create index if not exists developer_contact_request_status_history_request_idx
  on public.developer_contact_request_status_history (developer_id, contact_request_id, created_at desc);

create table if not exists public.developer_activity_events (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  actor_account_id uuid references public.developer_accounts(id) on delete set null,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 100),
  entity_type text not null check (char_length(btrim(entity_type)) between 1 and 100),
  entity_id uuid,
  summary text not null check (char_length(btrim(summary)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists developer_activity_events_tenant_idx
  on public.developer_activity_events (developer_id, created_at desc);
create index if not exists developer_activity_events_entity_idx
  on public.developer_activity_events (developer_id, entity_type, entity_id, created_at desc);

-- Existing inbox rows remain visible, while newer hooks can target a member
-- and provide a safe deep link without exposing any secret data.
alter table public.developer_notifications
  add column if not exists recipient_account_id uuid references public.developer_accounts(id) on delete cascade,
  add column if not exists notification_type text,
  add column if not exists action_url text,
  add column if not exists dedupe_key text;

create unique index if not exists developer_notifications_dedupe_idx
  on public.developer_notifications (developer_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists developer_notifications_recipient_idx
  on public.developer_notifications (developer_id, recipient_account_id, is_read, created_at desc);

-- A small first-party support queue keeps developer support separate from
-- agent tickets, whose agent_id contract is intentionally unchanged.
create table if not exists public.developer_support_tickets (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  created_by_account_id uuid not null references public.developer_accounts(id) on delete restrict,
  subject text not null check (char_length(btrim(subject)) between 1 and 300),
  category text not null default 'other' check (category in ('account', 'inventory', 'sales', 'integrations', 'billing', 'technical', 'other')),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  description text not null check (char_length(btrim(description)) between 1 and 20000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_developer', 'resolved', 'closed')),
  assigned_to_account_id uuid references public.developer_accounts(id) on delete set null,
  last_message_preview text,
  last_message_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists developer_support_tickets_tenant_idx
  on public.developer_support_tickets (developer_id, status, updated_at desc);

create table if not exists public.developer_support_messages (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  ticket_id uuid not null references public.developer_support_tickets(id) on delete cascade,
  author_account_id uuid references public.developer_accounts(id) on delete set null,
  author_type text not null check (author_type in ('developer', 'support', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now()
);

create index if not exists developer_support_messages_ticket_idx
  on public.developer_support_messages (developer_id, ticket_id, created_at asc);

-- Integration foundations are configuration and durable work contracts only.
-- No table stores a plaintext credential or webhook signing secret.
create table if not exists public.developer_api_credentials (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  key_prefix text not null check (char_length(btrim(key_prefix)) between 4 and 40),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{}'::text[],
  created_by_account_id uuid not null references public.developer_accounts(id) on delete restrict,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_api_credentials_scope_check check (
    scopes <@ array[
      'contacts:read', 'contacts:write', 'inventory:read', 'inventory:write',
      'analytics:read', 'webhooks:write', 'imports:write'
    ]::text[]
  )
);

create unique index if not exists developer_api_credentials_name_idx
  on public.developer_api_credentials (developer_id, lower(name));
create index if not exists developer_api_credentials_tenant_idx
  on public.developer_api_credentials (developer_id, created_at desc);

-- Configuration-time SSRF guard. A delivery worker must repeat the host
-- resolution and private-network check immediately before connecting because
-- a public DNS name can later resolve to a private address.
create or replace function public.developer_webhook_url_is_safe(p_endpoint_url text)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  normalized text := lower(btrim(coalesce(p_endpoint_url, '')));
  authority text;
  host text;
begin
  if normalized !~ '^https://'
     or char_length(normalized) > 2048
     or normalized ~ '[[:space:]@]' then
    return false;
  end if;

  authority := split_part(split_part(normalized, '://', 2), '/', 1);
  if authority = '' or authority ~ '[?#]' then return false; end if;
  if authority ~ '^\[' then
    if authority !~ '^\[[^]]+\](:[0-9]+)?$' then return false; end if;
    host := substring(authority from '^\[([^]]+)\]');
    if host ~ '%' then return false; end if;
    if host ~* '^(::|::1|fc|fd|fe[89ab])' or host ~* '(^|:)ffff:' then return false; end if;
  else
    if authority ~ ':' and authority !~ '^[^:]+(:[0-9]+)?$' then return false; end if;
    host := split_part(authority, ':', 1);
  end if;

  if host = ''
     or host ~ '^[0-9]+$'
     or host ~ '^[0-9]+(\.[0-9]+){1,2}$'
     or host ~* '(^|\.)(localhost|local|internal|home\.arpa|lan|test|invalid|example)$'
     or host ~* '^(0|10|127)\.'
     or host ~* '^100\.(6[4-9]|[7-9][0-9])\.'
     or host ~* '^169\.254\.'
     or host ~* '^172\.(1[6-9]|2[0-9]|3[01])\.'
     or host ~* '^192\.0\.(0|2)\.'
     or host ~* '^192\.168\.'
     or host ~* '^198\.(18|19)\.'
     or host ~* '^198\.51\.100\.'
     or host ~* '^203\.0\.113\.'
     or host ~* '^(22[4-9]|23[0-9]|24[0-9]|25[0-5])\.' then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.developer_webhook_url_is_safe(text) from public, anon, authenticated;
grant execute on function public.developer_webhook_url_is_safe(text) to service_role;

create table if not exists public.developer_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  endpoint_url text not null check (public.developer_webhook_url_is_safe(endpoint_url)),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  events text[] not null default array['lead.created', 'lead.updated', 'lead.note_added', 'integration.sync']::text[],
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  created_by_account_id uuid not null references public.developer_accounts(id) on delete restrict,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists developer_webhook_endpoints_name_idx
  on public.developer_webhook_endpoints (developer_id, lower(name));
create index if not exists developer_webhook_endpoints_tenant_idx
  on public.developer_webhook_endpoints (developer_id, status, created_at desc);
alter table public.developer_webhook_endpoints
  drop constraint if exists developer_webhook_endpoints_endpoint_url_check;
alter table public.developer_webhook_endpoints
  add constraint developer_webhook_endpoints_endpoint_url_check
  check (public.developer_webhook_url_is_safe(endpoint_url));
alter table public.developer_webhook_endpoints
  drop constraint if exists developer_webhook_endpoints_events_check;
alter table public.developer_webhook_endpoints
  add constraint developer_webhook_endpoints_events_check
  check (
    cardinality(events) > 0
    and events <@ array['lead.created', 'lead.updated', 'lead.note_added', 'integration.sync']::text[]
  );

create table if not exists public.developer_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  endpoint_id uuid not null references public.developer_webhook_endpoints(id) on delete cascade,
  event_type text not null,
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint_id, event_key)
);

create index if not exists developer_webhook_deliveries_retry_idx
  on public.developer_webhook_deliveries (developer_id, status, next_attempt_at);

create table if not exists public.developer_import_schedules (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  source_kind text not null default 'manual_file' check (source_kind in ('manual_file', 'api_contract', 'sftp_contract')),
  source_label text not null check (char_length(btrim(source_label)) between 1 and 200),
  cadence text not null default 'manual' check (cadence in ('manual', 'hourly', 'daily', 'weekly')),
  timezone text not null default 'UTC',
  enabled boolean not null default false,
  dry_run_default boolean not null default true,
  idempotency_strategy text not null default 'source_key' check (idempotency_strategy in ('source_key', 'checksum', 'external_id')),
  conflict_strategy text not null default 'flag_for_review' check (conflict_strategy in ('flag_for_review', 'skip_existing', 'update_existing')),
  created_by_account_id uuid not null references public.developer_accounts(id) on delete restrict,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists developer_import_schedules_name_idx
  on public.developer_import_schedules (developer_id, lower(name));
create index if not exists developer_import_schedules_due_idx
  on public.developer_import_schedules (developer_id, enabled, next_run_at);

create table if not exists public.developer_integration_field_mappings (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  schedule_id uuid not null references public.developer_import_schedules(id) on delete cascade,
  source_field text not null check (char_length(btrim(source_field)) between 1 and 120),
  target_field text not null check (char_length(btrim(target_field)) between 1 and 120),
  transform text,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, source_field, target_field)
);

create index if not exists developer_integration_field_mappings_tenant_idx
  on public.developer_integration_field_mappings (developer_id, schedule_id);

create table if not exists public.developer_sync_runs (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  schedule_id uuid not null references public.developer_import_schedules(id) on delete cascade,
  requested_by_account_id uuid references public.developer_accounts(id) on delete set null,
  mode text not null check (mode in ('dry_run', 'queued')),
  status text not null check (status in ('dry_run', 'queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  idempotency_key text not null,
  source_checksum text,
  rows_seen integer not null default 0 check (rows_seen >= 0),
  rows_created integer not null default 0 check (rows_created >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (schedule_id, idempotency_key)
);

create index if not exists developer_sync_runs_tenant_idx
  on public.developer_sync_runs (developer_id, created_at desc);

create table if not exists public.developer_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  sync_run_id uuid not null references public.developer_sync_runs(id) on delete cascade,
  entity_type text not null,
  source_key text not null,
  target_id uuid,
  conflict_type text not null check (conflict_type in ('duplicate', 'stale_update', 'missing_required', 'invalid_value', 'mapping')),
  source_payload jsonb not null default '{}'::jsonb,
  current_payload jsonb,
  resolution text not null default 'open' check (resolution in ('open', 'ignored', 'accepted', 'merged')),
  resolved_by_account_id uuid references public.developer_accounts(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists developer_sync_conflicts_run_idx
  on public.developer_sync_conflicts (developer_id, sync_run_id, resolution, created_at desc);

-- Every new table is service-role mediated.  The application passes the
-- active membership id to each RPC; RLS remains a second line of defense.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'developer_contact_request_notes',
    'developer_contact_request_status_history',
    'developer_activity_events',
    'developer_support_tickets',
    'developer_support_messages',
    'developer_api_credentials',
    'developer_webhook_endpoints',
    'developer_webhook_deliveries',
    'developer_import_schedules',
    'developer_integration_field_mappings',
    'developer_sync_runs',
    'developer_sync_conflicts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_service_role', table_name);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', table_name || '_service_role', table_name);
  end loop;
end;
$$;

alter table public.developer_contact_requests enable row level security;
alter table public.developer_contact_requests force row level security;
revoke all on public.developer_contact_requests from public, anon, authenticated;
grant all on public.developer_contact_requests to service_role;
alter table public.developer_notifications enable row level security;
alter table public.developer_notifications force row level security;
revoke all on public.developer_notifications from public, anon, authenticated;
grant all on public.developer_notifications to service_role;

-- Capability mapping is intentionally local to these RPCs.  It does not make
-- an assumption about client claims and remains valid for service-role calls.
create or replace function public.developer_sales_capability_allowed(
  p_developer_id uuid,
  p_account_id uuid,
  p_capability text,
  p_project_id uuid default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  actor_role text;
begin
  select account.role::text
    into actor_role
  from public.developer_accounts account
  where account.id = p_account_id
    and account.developer_id = p_developer_id
    and account.status = 'active';

  if actor_role is null then return false; end if;
  actor_role := lower(actor_role);

  if actor_role in ('developer_super_admin', 'super_admin') then return true; end if;
  if actor_role = 'sales_manager' then
    return p_capability in ('view_contacts', 'manage_contacts');
  end if;
  if actor_role = 'project_manager' then
    return p_project_id is not null
      and p_capability in ('view_analytics')
      and exists (
        select 1 from public.developer_projects project
        where project.id = p_project_id and project.developer_id = p_developer_id
      );
  end if;
  return false;
end;
$$;

create or replace function public.developer_sales_assert_access(
  p_developer_id uuid,
  p_account_id uuid,
  p_capability text,
  p_project_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if not public.developer_sales_capability_allowed(p_developer_id, p_account_id, p_capability, p_project_id) then
    raise exception 'Active developer membership with the required capability is required';
  end if;
end;
$$;

revoke all on function public.developer_sales_capability_allowed(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.developer_sales_assert_access(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.developer_sales_capability_allowed(uuid, uuid, text, uuid) to service_role;
grant execute on function public.developer_sales_assert_access(uuid, uuid, text, uuid) to service_role;

create or replace function public.developer_sales_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'developer_contact_request_notes',
    'developer_support_tickets',
    'developer_api_credentials',
    'developer_webhook_endpoints',
    'developer_webhook_deliveries',
    'developer_import_schedules',
    'developer_integration_field_mappings'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.developer_sales_touch_updated_at()', table_name || '_touch_updated_at', table_name);
  end loop;
end;
$$;

-- Mark repeated mobile requests without deleting or merging a user's data.
create or replace function public.mark_developer_contact_request_duplicate()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  existing_id uuid;
begin
  if new.duplicate_of_request_id is not null then return new; end if;
  select request.id
    into existing_id
  from public.developer_contact_requests request
  where request.id <> new.id
    and request.developer_id = new.developer_id
    and request.project_id = new.project_id
    and request.requester_user_id = new.requester_user_id
    and request.property_id is not distinct from new.property_id
    and request.created_at >= coalesce(new.created_at, now()) - interval '30 days'
  order by request.created_at desc
  limit 1;
  if existing_id is not null then
    new.duplicate_of_request_id := existing_id;
    new.duplicate_reason := 'Same requester and project within 30 days';
  end if;
  return new;
end;
$$;

drop trigger if exists developer_contact_requests_mark_duplicate on public.developer_contact_requests;
create trigger developer_contact_requests_mark_duplicate
before insert on public.developer_contact_requests
for each row execute function public.mark_developer_contact_request_duplicate();

-- Durable webhook outbox.  Nothing in this migration attempts network
-- delivery; a future worker can claim pending rows and record the outcome.
create or replace function public.enqueue_developer_webhook_event(
  p_developer_id uuid,
  p_event_type text,
  p_event_key text,
  p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  endpoint_row record;
  inserted_count integer := 0;
begin
  for endpoint_row in
    select id
    from public.developer_webhook_endpoints
    where developer_id = p_developer_id
      and status = 'active'
      and (cardinality(events) = 0 or p_event_type = any(events))
  loop
    insert into public.developer_webhook_deliveries(
      developer_id, endpoint_id, event_type, event_key, payload
    ) values (
      p_developer_id, endpoint_row.id, p_event_type, p_event_key, coalesce(p_payload, '{}'::jsonb)
    ) on conflict (endpoint_id, event_key) do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function public.enqueue_developer_webhook_event(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_developer_webhook_event(uuid, text, text, jsonb) to service_role;

-- Mobile creation keeps its existing function signature.  The new columns,
-- duplicate trigger, activity event, and richer notification are all added in
-- the same transaction as the lead insert.
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
  due_at timestamptz := now() + interval '1 day';
begin
  if p_request_type not in ('call', 'meeting') then
    raise exception 'Invalid request type';
  end if;
  insert into public.developer_contact_requests(
    developer_id, project_id, property_id, requester_user_id, request_type,
    status, request_body, requester_display_name, requester_email, requester_phone,
    requester_total_deals, developer_name_snapshot, project_name_snapshot,
    property_name_snapshot, source, sla_due_at
  ) values (
    p_developer_id, p_project_id, p_property_id, p_requester_user_id, p_request_type,
    'new', p_request_body, p_requester_display_name, p_requester_email, p_requester_phone,
    coalesce(p_requester_total_deals, 0), p_developer_name_snapshot, p_project_name_snapshot,
    p_property_name_snapshot, 'mobile', due_at
  ) returning id into request_id;

  insert into public.developer_notifications(
    developer_id, contact_request_id, title, message, notification_type, action_url, dedupe_key
  ) values (
    p_developer_id, request_id,
    format('%s request from %s', case when p_request_type = 'meeting' then 'Meeting' else 'Call' end, p_requester_display_name),
    left(format('%s: %s', p_project_name_snapshot, p_request_body), 2000),
    'lead.created', '/developer/contacts/' || request_id::text, 'lead.created:' || request_id::text
  );

  insert into public.developer_activity_events(
    developer_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    p_developer_id, 'lead.created', 'contact_request', request_id,
    format('New %s request from %s', p_request_type, p_requester_display_name),
    jsonb_build_object('source', 'mobile', 'request_type', p_request_type)
  );
  perform public.enqueue_developer_webhook_event(
    p_developer_id,
    'lead.created',
    'lead.created:' || request_id::text,
    jsonb_build_object('id', request_id, 'status', 'new', 'project_id', p_project_id, 'property_id', p_property_id)
  );
  return request_id;
end;
$$;

revoke all on function public.create_developer_contact_request_with_notification(uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.create_developer_contact_request_with_notification(uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text, text) to service_role;

create or replace function public.update_developer_contact_request_sales(
  p_developer_id uuid,
  p_request_id uuid,
  p_actor_account_id uuid,
  p_status text,
  p_assigned_to_account_id uuid default null,
  p_next_follow_up_at timestamptz default null,
  p_lost_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_row public.developer_contact_requests%rowtype;
  previous_status text;
  assignment_name text;
begin
  perform public.developer_sales_assert_access(p_developer_id, p_actor_account_id, 'manage_contacts');
  if p_status not in ('new', 'contacted', 'qualified', 'viewing', 'reservation', 'won', 'lost') then
    raise exception 'Invalid lead status';
  end if;

  select * into request_row
  from public.developer_contact_requests
  where id = p_request_id and developer_id = p_developer_id
  for update;
  if not found then raise exception 'Contact request not found'; end if;
  previous_status := request_row.status;

  if p_assigned_to_account_id is not null and not exists (
    select 1 from public.developer_accounts account
    where account.id = p_assigned_to_account_id
      and account.developer_id = p_developer_id
      and account.status = 'active'
  ) then
    raise exception 'Assignee must be an active member of this company';
  end if;

  update public.developer_contact_requests
  set status = p_status,
      assigned_to_account_id = p_assigned_to_account_id,
      next_follow_up_at = p_next_follow_up_at,
      first_response_at = case when p_status <> 'new' then coalesce(first_response_at, now()) else first_response_at end,
      last_contacted_at = case when p_status in ('contacted', 'qualified', 'viewing', 'reservation', 'won') then now() else last_contacted_at end,
      lost_reason = case when p_status = 'lost' then nullif(btrim(p_lost_reason), '') else null end,
      updated_at = now()
  where id = p_request_id and developer_id = p_developer_id
  returning * into request_row;

  if p_assigned_to_account_id is not null then
    select coalesce(full_name, email, 'a teammate') into assignment_name
    from public.developer_accounts where id = p_assigned_to_account_id;
  end if;

  if previous_status is distinct from p_status then
    insert into public.developer_contact_request_status_history(
      developer_id, contact_request_id, from_status, to_status, changed_by_account_id
    ) values (p_developer_id, p_request_id, previous_status, p_status, p_actor_account_id);
  end if;

  -- Preserve the existing mobile contract: the requesting agent receives an
  -- in-app update when the developer advances the request. This is separate
  -- from the tenant-scoped developer notification inbox above.
  if previous_status is distinct from p_status then
    insert into public.notifications(
      agent_id, type, title, message, related_entity_type, related_entity_id, action_url
    ) values (
      request_row.requester_user_id,
      'admin_message',
      'Developer request updated',
      format('Your %s request is now %s.', request_row.project_name_snapshot, p_status),
      'developer_contact_request', request_row.id, '/properties'
    );
  end if;

  insert into public.developer_activity_events(
    developer_id, actor_account_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    p_developer_id, p_actor_account_id, 'lead.updated', 'contact_request', p_request_id,
    format('Lead moved to %s%s', p_status, case when assignment_name is not null then ' · assigned to ' || assignment_name else '' end),
    jsonb_build_object('from_status', previous_status, 'to_status', p_status, 'assigned_to_account_id', p_assigned_to_account_id, 'next_follow_up_at', p_next_follow_up_at)
  );

  if previous_status is distinct from p_status or p_assigned_to_account_id is not null then
    insert into public.developer_notifications(
      developer_id, contact_request_id, recipient_account_id, title, message, notification_type, action_url, dedupe_key
    ) values (
      p_developer_id, p_request_id, case when p_assigned_to_account_id <> p_actor_account_id then p_assigned_to_account_id else null end,
      'Lead updated', format('%s is now %s.', request_row.requester_display_name, p_status),
      'lead.updated', '/developer/contacts/' || p_request_id::text,
      format('lead.updated:%s:%s:%s', p_request_id, p_status, gen_random_uuid())
    );
  end if;

  perform public.enqueue_developer_webhook_event(
    p_developer_id,
    'lead.updated',
    'lead.updated:' || p_request_id::text || ':' || gen_random_uuid()::text,
    jsonb_build_object('id', p_request_id, 'status', p_status, 'assigned_to_account_id', p_assigned_to_account_id, 'next_follow_up_at', p_next_follow_up_at)
  );
  return jsonb_build_object('id', request_row.id, 'status', request_row.status, 'assigned_to_account_id', request_row.assigned_to_account_id, 'next_follow_up_at', request_row.next_follow_up_at);
end;
$$;

revoke all on function public.update_developer_contact_request_sales(uuid, uuid, uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.update_developer_contact_request_sales(uuid, uuid, uuid, text, uuid, timestamptz, text) to service_role;

create or replace function public.add_developer_contact_request_note(
  p_developer_id uuid,
  p_request_id uuid,
  p_actor_account_id uuid,
  p_body text,
  p_mentioned_account_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  note_id uuid;
  mention_id uuid;
  requester_name text;
begin
  perform public.developer_sales_assert_access(p_developer_id, p_actor_account_id, 'manage_contacts');
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 10000 then
    raise exception 'Note must contain between 1 and 10000 characters';
  end if;
  if not exists (select 1 from public.developer_contact_requests where id = p_request_id and developer_id = p_developer_id) then
    raise exception 'Contact request not found';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_mentioned_account_ids, '{}'::uuid[])) mention
    where not exists (
      select 1 from public.developer_accounts account
      where account.id = mention and account.developer_id = p_developer_id and account.status = 'active'
    )
  ) then
    raise exception 'Mentions must reference active members of this company';
  end if;

  insert into public.developer_contact_request_notes(
    developer_id, contact_request_id, author_account_id, body, mentioned_account_ids
  ) values (
    p_developer_id, p_request_id, p_actor_account_id, btrim(p_body), coalesce(p_mentioned_account_ids, '{}'::uuid[])
  ) returning id into note_id;

  select requester_display_name into requester_name
  from public.developer_contact_requests where id = p_request_id;
  insert into public.developer_activity_events(
    developer_id, actor_account_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    p_developer_id, p_actor_account_id, 'lead.note_added', 'contact_request', p_request_id,
    'Added an internal note to ' || coalesce(requester_name, 'the lead'),
    jsonb_build_object('note_id', note_id, 'mention_count', cardinality(coalesce(p_mentioned_account_ids, '{}'::uuid[])))
  );
  foreach mention_id in array coalesce(p_mentioned_account_ids, '{}'::uuid[]) loop
    insert into public.developer_notifications(
      developer_id, contact_request_id, recipient_account_id, title, message, notification_type, action_url, dedupe_key
    ) values (
      p_developer_id, p_request_id, mention_id, 'You were mentioned in a lead note',
      'A teammate mentioned you on ' || coalesce(requester_name, 'a lead') || '.',
      'lead.note_mention', '/developer/contacts/' || p_request_id::text, 'lead.note_mention:' || note_id::text || ':' || mention_id::text
    ) on conflict do nothing;
  end loop;
  perform public.enqueue_developer_webhook_event(
    p_developer_id, 'lead.note_added', 'lead.note_added:' || note_id::text,
    jsonb_build_object('id', p_request_id, 'note_id', note_id)
  );
  return note_id;
end;
$$;

revoke all on function public.add_developer_contact_request_note(uuid, uuid, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.add_developer_contact_request_note(uuid, uuid, uuid, text, uuid[]) to service_role;

-- Funnel metrics use only counters and rows that already exist in the shared
-- schema.  Reservations cannot be attributed to a project because the legacy
-- stage table has no project_id; project-scoped callers receive NULL there.
create or replace function public.developer_dashboard_funnel(
  p_developer_id uuid,
  p_account_id uuid,
  p_project_id uuid default null
)
returns table (
  views bigint,
  saves bigint,
  enquiries bigint,
  reservations bigint,
  reservations_available boolean,
  source_notes text[]
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  developer_name_value text;
  actor_role text;
  views_value bigint;
  saves_value bigint;
  property_enquiries bigint;
  mobile_enquiries bigint;
  reservations_value bigint;
begin
  perform public.developer_sales_assert_access(p_developer_id, p_account_id, 'view_analytics', p_project_id);
  select developer.name into developer_name_value from public.developers developer where developer.id = p_developer_id;
  select lower(role::text) into actor_role
  from public.developer_accounts
  where id = p_account_id and developer_id = p_developer_id and status = 'active';

  with owned as (
    select property.id
    from public.properties property
    where property.archived_at is null
      and (property.developer_id = p_developer_id or exists (
        select 1 from public.developer_projects project
        where project.id = property.project_id and project.developer_id = p_developer_id
      ))
      and (p_project_id is null or property.project_id = p_project_id)
  )
  select coalesce(sum(coalesce(property.views_count, 0)), 0)::bigint
    into views_value
  from public.properties property
  where property.id in (select id from owned);

  select count(*)::bigint into saves_value
  from public.saved_properties saved
  where saved.property_id in (
    select property.id
    from public.properties property
    where property.archived_at is null
      and (property.developer_id = p_developer_id or exists (
        select 1 from public.developer_projects project
        where project.id = property.project_id and project.developer_id = p_developer_id
      ))
      and (p_project_id is null or property.project_id = p_project_id)
  );

  select count(*)::bigint into property_enquiries
  from public.property_inquiries inquiry
  where inquiry.property_id in (
    select property.id
    from public.properties property
    where property.archived_at is null
      and (property.developer_id = p_developer_id or exists (
        select 1 from public.developer_projects project
        where project.id = property.project_id and project.developer_id = p_developer_id
      ))
      and (p_project_id is null or property.project_id = p_project_id)
  );

  if actor_role in ('developer_super_admin', 'super_admin') then
    select count(*)::bigint into mobile_enquiries
    from public.developer_contact_requests request
    where request.developer_id = p_developer_id
      and (p_project_id is null or request.project_id = p_project_id);
  else
    -- Project managers can see project analytics, but the lead/contact inbox
    -- is intentionally outside their capability boundary.
    mobile_enquiries := 0;
  end if;

  select count(*)::bigint into reservations_value
  from public.deal_stage_entries entry
  where p_project_id is null
    and lower(coalesce(entry.developer_name, '')) = lower(coalesce(developer_name_value, ''))
    and entry.stage::text = 'Reservation';

  return query select
    coalesce(views_value, 0),
    coalesce(saves_value, 0),
    coalesce(property_enquiries, 0) + coalesce(mobile_enquiries, 0),
    case when p_project_id is null then reservations_value else null end,
    p_project_id is null,
    array[
      'views: properties.views_count',
      'saves: saved_properties',
      case when actor_role in ('developer_super_admin', 'super_admin')
        then 'enquiries: property_inquiries + developer_contact_requests'
        else 'enquiries: property_inquiries'
      end,
      'reservations: deal_stage_entries stage Reservation'
    ]::text[];
end;
$$;

revoke all on function public.developer_dashboard_funnel(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.developer_dashboard_funnel(uuid, uuid, uuid) to service_role;

create or replace function public.create_developer_support_ticket(
  p_developer_id uuid,
  p_actor_account_id uuid,
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
  ticket_id uuid;
begin
  if not exists (
    select 1 from public.developer_accounts account
    where account.id = p_actor_account_id and account.developer_id = p_developer_id and account.status = 'active'
  ) then raise exception 'Active developer membership required'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 300 then raise exception 'Subject is required'; end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 1 and 20000 then raise exception 'Description is required'; end if;
  if p_category not in ('account', 'inventory', 'sales', 'integrations', 'billing', 'technical', 'other') then raise exception 'Invalid support category'; end if;
  if p_priority not in ('normal', 'high', 'urgent') then raise exception 'Invalid support priority'; end if;
  insert into public.developer_support_tickets(
    developer_id, created_by_account_id, subject, category, priority, description, last_message_preview, last_message_at
  ) values (
    p_developer_id, p_actor_account_id, btrim(p_subject), p_category, p_priority, btrim(p_description), left(btrim(p_description), 240), now()
  ) returning id into ticket_id;
  insert into public.developer_support_messages(developer_id, ticket_id, author_account_id, author_type, body)
  values (p_developer_id, ticket_id, p_actor_account_id, 'developer', btrim(p_description));
  insert into public.developer_activity_events(developer_id, actor_account_id, event_type, entity_type, entity_id, summary, metadata)
  values (p_developer_id, p_actor_account_id, 'support.created', 'support_ticket', ticket_id, 'Opened a support request: ' || btrim(p_subject), jsonb_build_object('category', p_category, 'priority', p_priority));
  return ticket_id;
end;
$$;

revoke all on function public.create_developer_support_ticket(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_developer_support_ticket(uuid, uuid, text, text, text, text) to service_role;

-- Integration creation functions accept only hashes from the application.
create or replace function public.create_developer_api_credential(
  p_developer_id uuid,
  p_actor_account_id uuid,
  p_name text,
  p_key_prefix text,
  p_secret_hash text,
  p_scopes text[],
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  credential_row public.developer_api_credentials%rowtype;
begin
  perform public.developer_sales_assert_access(p_developer_id, p_actor_account_id, 'manage_integrations');
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Credential name is required'; end if;
  if p_secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Credential secret must be hashed'; end if;
  if not (coalesce(p_scopes, '{}'::text[]) <@ array['contacts:read', 'contacts:write', 'inventory:read', 'inventory:write', 'analytics:read', 'webhooks:write', 'imports:write']::text[]) then
    raise exception 'Invalid credential scope';
  end if;
  insert into public.developer_api_credentials(developer_id, name, key_prefix, secret_hash, scopes, created_by_account_id, expires_at)
  values (p_developer_id, btrim(p_name), btrim(p_key_prefix), lower(p_secret_hash), coalesce(p_scopes, '{}'::text[]), p_actor_account_id, p_expires_at)
  returning * into credential_row;
  insert into public.developer_activity_events(developer_id, actor_account_id, event_type, entity_type, entity_id, summary, metadata)
  values (p_developer_id, p_actor_account_id, 'integration.credential_created', 'api_credential', credential_row.id, 'Created an API credential', jsonb_build_object('name', credential_row.name, 'scopes', credential_row.scopes));
  return jsonb_build_object('id', credential_row.id, 'name', credential_row.name, 'key_prefix', credential_row.key_prefix, 'scopes', credential_row.scopes, 'expires_at', credential_row.expires_at, 'created_at', credential_row.created_at);
end;
$$;

revoke all on function public.create_developer_api_credential(uuid, uuid, text, text, text, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.create_developer_api_credential(uuid, uuid, text, text, text, text[], timestamptz) to service_role;

create or replace function public.revoke_developer_api_credential(
  p_developer_id uuid,
  p_actor_account_id uuid,
  p_credential_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed boolean;
  affected_rows integer;
begin
  perform public.developer_sales_assert_access(p_developer_id, p_actor_account_id, 'manage_integrations');
  update public.developer_api_credentials
  set revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where id = p_credential_id and developer_id = p_developer_id and revoked_at is null;
  get diagnostics affected_rows = row_count;
  changed := affected_rows > 0;
  if changed then
    insert into public.developer_activity_events(developer_id, actor_account_id, event_type, entity_type, entity_id, summary)
    values (p_developer_id, p_actor_account_id, 'integration.credential_revoked', 'api_credential', p_credential_id, 'Revoked an API credential');
  end if;
  return changed;
end;
$$;

revoke all on function public.revoke_developer_api_credential(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_developer_api_credential(uuid, uuid, uuid) to service_role;

create or replace function public.create_developer_webhook_endpoint(
  p_developer_id uuid,
  p_actor_account_id uuid,
  p_name text,
  p_endpoint_url text,
  p_secret_hash text,
  p_events text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  endpoint_row public.developer_webhook_endpoints%rowtype;
begin
  perform public.developer_sales_assert_access(p_developer_id, p_actor_account_id, 'manage_integrations');
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Webhook name is required'; end if;
  if not public.developer_webhook_url_is_safe(p_endpoint_url) then raise exception 'Webhook URL must be a public HTTPS endpoint'; end if;
  if p_secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Webhook secret must be hashed'; end if;
  insert into public.developer_webhook_endpoints(developer_id, name, endpoint_url, secret_hash, events, created_by_account_id)
  values (p_developer_id, btrim(p_name), btrim(p_endpoint_url), lower(p_secret_hash), case when p_events is null or cardinality(p_events) = 0 then array['lead.created', 'lead.updated', 'lead.note_added', 'integration.sync']::text[] else p_events end, p_actor_account_id)
  returning * into endpoint_row;
  insert into public.developer_activity_events(developer_id, actor_account_id, event_type, entity_type, entity_id, summary, metadata)
  values (p_developer_id, p_actor_account_id, 'integration.webhook_created', 'webhook_endpoint', endpoint_row.id, 'Created a webhook endpoint', jsonb_build_object('name', endpoint_row.name, 'events', endpoint_row.events));
  return jsonb_build_object('id', endpoint_row.id, 'name', endpoint_row.name, 'endpoint_url', endpoint_row.endpoint_url, 'events', endpoint_row.events, 'status', endpoint_row.status, 'created_at', endpoint_row.created_at);
end;
$$;

revoke all on function public.create_developer_webhook_endpoint(uuid, uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.create_developer_webhook_endpoint(uuid, uuid, text, text, text, text[]) to service_role;

create or replace function public.create_developer_import_schedule(
  p_developer_id uuid,
  p_actor_account_id uuid,
  p_name text,
  p_source_kind text,
  p_source_label text,
  p_cadence text,
  p_timezone text,
  p_dry_run_default boolean,
  p_idempotency_strategy text,
  p_conflict_strategy text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  schedule_id uuid;
begin
  perform public.developer_sales_assert_access(p_developer_id, p_actor_account_id, 'manage_integrations');
  insert into public.developer_import_schedules(
    developer_id, name, source_kind, source_label, cadence, timezone, dry_run_default, idempotency_strategy, conflict_strategy, created_by_account_id
  ) values (
    p_developer_id, btrim(p_name), p_source_kind, btrim(p_source_label), p_cadence, coalesce(nullif(btrim(p_timezone), ''), 'UTC'), coalesce(p_dry_run_default, true), p_idempotency_strategy, p_conflict_strategy, p_actor_account_id
  ) returning id into schedule_id;
  insert into public.developer_activity_events(developer_id, actor_account_id, event_type, entity_type, entity_id, summary, metadata)
  values (p_developer_id, p_actor_account_id, 'integration.schedule_created', 'import_schedule', schedule_id, 'Created an import schedule', jsonb_build_object('cadence', p_cadence, 'dry_run_default', coalesce(p_dry_run_default, true)));
  return schedule_id;
end;
$$;

revoke all on function public.create_developer_import_schedule(uuid, uuid, text, text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.create_developer_import_schedule(uuid, uuid, text, text, text, text, text, boolean, text, text) to service_role;

create or replace function public.create_developer_sync_run(
  p_developer_id uuid,
  p_actor_account_id uuid,
  p_schedule_id uuid,
  p_mode text,
  p_idempotency_key text,
  p_source_checksum text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  run_row public.developer_sync_runs%rowtype;
begin
  perform public.developer_sales_assert_access(p_developer_id, p_actor_account_id, 'manage_integrations');
  if p_mode <> 'dry_run' then
    raise exception 'Only dry-run imports are configured; no external provider is connected';
  end if;
  if char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'Idempotency key is required'; end if;
  if not exists (select 1 from public.developer_import_schedules where id = p_schedule_id and developer_id = p_developer_id) then raise exception 'Import schedule not found'; end if;
  insert into public.developer_sync_runs(
    developer_id, schedule_id, requested_by_account_id, mode, status, idempotency_key, source_checksum, metadata
  ) values (
    p_developer_id, p_schedule_id, p_actor_account_id, 'dry_run', 'dry_run', btrim(p_idempotency_key), p_source_checksum,
    jsonb_build_object('provider_connected', false, 'network_called', false, 'message', 'Configuration-only dry run; no external provider was called')
  ) on conflict (schedule_id, idempotency_key) do update
    set metadata = public.developer_sync_runs.metadata || jsonb_build_object('idempotent_replay', true)
  returning * into run_row;
  insert into public.developer_activity_events(developer_id, actor_account_id, event_type, entity_type, entity_id, summary, metadata)
  values (p_developer_id, p_actor_account_id, 'integration.sync_requested', 'sync_run', run_row.id, 'Queued a configuration-only dry run', jsonb_build_object('mode', 'dry_run', 'idempotency_key', run_row.idempotency_key));
  return jsonb_build_object('id', run_row.id, 'mode', run_row.mode, 'status', run_row.status, 'idempotency_key', run_row.idempotency_key, 'metadata', run_row.metadata, 'created_at', run_row.created_at);
end;
$$;

revoke all on function public.create_developer_sync_run(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_developer_sync_run(uuid, uuid, uuid, text, text, text) to service_role;

commit;
