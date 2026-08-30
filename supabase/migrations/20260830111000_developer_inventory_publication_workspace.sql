begin;

-- The existing approval_status/lifecycle_state columns remain the mobile
-- compatibility boundary. These explicit workflow columns let the developer
-- workspace distinguish a local draft, a ready record, a submitted review,
-- an admin request for changes, an approval, and a published release.
alter table public.developer_projects
  add column if not exists publication_status text not null default 'draft',
  add column if not exists publication_feedback jsonb not null default '{}'::jsonb,
  add column if not exists ready_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by_account_id uuid references public.developer_accounts(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_admin_id uuid references public.admins(id) on delete set null,
  add column if not exists changes_requested_at timestamptz;

alter table public.developer_project_phases
  add column if not exists publication_status text not null default 'draft',
  add column if not exists publication_feedback jsonb not null default '{}'::jsonb,
  add column if not exists ready_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by_account_id uuid references public.developer_accounts(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_admin_id uuid references public.admins(id) on delete set null,
  add column if not exists changes_requested_at timestamptz;

alter table public.properties
  add column if not exists publication_status text not null default 'draft',
  add column if not exists publication_feedback jsonb not null default '{}'::jsonb,
  add column if not exists ready_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by_account_id uuid references public.developer_accounts(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_admin_id uuid references public.admins(id) on delete set null,
  add column if not exists changes_requested_at timestamptz,
  add column if not exists inventory_code text,
  add column if not exists building text,
  add column if not exists floor_number integer,
  add column if not exists unit_number text,
  add column if not exists inventory_notes text,
  add column if not exists availability_state text not null default 'available',
  add column if not exists availability_updated_at timestamptz,
  add column if not exists available_from timestamptz,
  add column if not exists available_until timestamptz,
  add column if not exists price_effective_from timestamptz;

do $$
begin
  alter table public.developer_projects drop constraint if exists developer_projects_publication_status_check;
  alter table public.developer_projects add constraint developer_projects_publication_status_check
    check (publication_status in ('draft', 'ready', 'submitted', 'changes_requested', 'approved', 'published'));
  alter table public.developer_project_phases drop constraint if exists developer_project_phases_publication_status_check;
  alter table public.developer_project_phases add constraint developer_project_phases_publication_status_check
    check (publication_status in ('draft', 'ready', 'submitted', 'changes_requested', 'approved', 'published'));
  alter table public.properties drop constraint if exists properties_publication_status_check;
  alter table public.properties add constraint properties_publication_status_check
    check (publication_status in ('draft', 'ready', 'submitted', 'changes_requested', 'approved', 'published'));
  alter table public.properties drop constraint if exists properties_availability_state_check;
  alter table public.properties add constraint properties_availability_state_check
    check (availability_state in ('available', 'held', 'reserved', 'contracted', 'sold', 'released'));
end;
$$;

update public.developer_projects
set publication_status = case
  when lifecycle_state = 'published' and approval_status = 'approved' then 'published'
  when approval_status = 'rejected' then 'changes_requested'
  when approval_status = 'approved' then 'approved'
  else 'draft'
end
where publication_status = 'draft';

update public.developer_project_phases
set publication_status = case
  when lifecycle_state = 'published' and approval_status = 'approved' then 'published'
  when approval_status = 'rejected' then 'changes_requested'
  when approval_status = 'approved' then 'approved'
  else 'draft'
end
where publication_status = 'draft';

update public.properties
set publication_status = case
  when approval_status = 'approved' and is_active and published_at is not null then 'published'
  when approval_status = 'rejected' then 'changes_requested'
  when approval_status = 'approved' and is_active then 'approved'
  else 'draft'
end,
    availability_updated_at = coalesce(availability_updated_at, updated_at, created_at, now()),
    price_effective_from = coalesce(price_effective_from, updated_at, created_at, now())
where publication_status = 'draft';

create index if not exists developer_projects_publication_status_idx
  on public.developer_projects(developer_id, publication_status, updated_at desc);
create index if not exists developer_project_phases_publication_status_idx
  on public.developer_project_phases(project_id, publication_status, phase_order);
create index if not exists properties_developer_inventory_grid_idx
  on public.properties(developer_id, project_id, phase_id, availability_state, updated_at desc)
  where listed_by_agent_id is null and archived_at is null;
create unique index if not exists properties_developer_inventory_code_idx
  on public.properties(developer_id, lower(btrim(inventory_code)))
  where listed_by_agent_id is null and archived_at is null and inventory_code is not null;

-- Immutable price history makes an effective-date change auditable without
-- overwriting the prior commercial truth.
create table if not exists public.developer_property_price_history (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  developer_id uuid not null references public.developers(id) on delete restrict,
  previous_price numeric(18,2),
  price numeric(18,2) not null check (price >= 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  change_reason text,
  changed_by_account_id uuid references public.developer_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index if not exists developer_property_price_history_property_idx
  on public.developer_property_price_history(property_id, effective_from desc, created_at desc);
create index if not exists developer_property_price_history_developer_idx
  on public.developer_property_price_history(developer_id, created_at desc);

-- A hold is deliberately separate from the property row. The partial unique
-- index and the row lock in the RPC below prevent two callers from claiming
-- the same unit even when requests arrive concurrently.
create table if not exists public.developer_inventory_holds (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'expired', 'released', 'converted')),
  holder_type text not null default 'internal'
    check (holder_type in ('internal', 'agent', 'customer', 'contract')),
  holder_reference text,
  expires_at timestamptz not null,
  created_by_account_id uuid not null references public.developer_accounts(id) on delete restrict,
  released_by_account_id uuid references public.developer_accounts(id) on delete set null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at or status <> 'active')
);
create unique index if not exists developer_inventory_holds_one_active_idx
  on public.developer_inventory_holds(property_id)
  where status = 'active';
create index if not exists developer_inventory_holds_expiry_idx
  on public.developer_inventory_holds(status, expires_at)
  where status = 'active';
create index if not exists developer_inventory_holds_developer_idx
  on public.developer_inventory_holds(developer_id, created_at desc);

-- Feedback is field-addressable, while rejection_reason remains populated for
-- older moderation screens and notification contracts.
create table if not exists public.developer_publication_feedback (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete restrict,
  entity_type text not null check (entity_type in ('project', 'phase', 'unit_type', 'unit_variant', 'property')),
  entity_id uuid not null,
  field_name text,
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  source text not null default 'admin' check (source in ('admin', 'developer', 'system')),
  author_admin_id uuid references public.admins(id) on delete set null,
  author_account_id uuid references public.developer_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_account_id uuid references public.developer_accounts(id) on delete set null
);
create index if not exists developer_publication_feedback_entity_idx
  on public.developer_publication_feedback(developer_id, entity_type, entity_id, status, created_at desc);

-- One version ledger covers every editable developer inventory surface. A
-- snapshot is immutable; restoring creates a normal new version through the
-- same trigger after applying the snapshot.
create table if not exists public.developer_inventory_versions (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete restrict,
  entity_type text not null check (entity_type in ('project', 'phase', 'unit_type', 'unit_variant', 'property')),
  entity_id uuid not null,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  change_summary text,
  changed_fields text[] not null default '{}'::text[],
  created_by_account_id uuid references public.developer_accounts(id) on delete set null,
  created_by_admin_id uuid references public.admins(id) on delete set null,
  restored_from_version integer,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, version)
);
create index if not exists developer_inventory_versions_entity_idx
  on public.developer_inventory_versions(developer_id, entity_type, entity_id, version desc);

create table if not exists public.developer_inventory_activity (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete restrict,
  project_id uuid references public.developer_projects(id) on delete set null,
  phase_id uuid references public.developer_project_phases(id) on delete set null,
  entity_type text not null check (entity_type in ('project', 'phase', 'unit_type', 'unit_variant', 'property', 'hold', 'template', 'feedback', 'import')),
  entity_id uuid,
  action text not null check (char_length(btrim(action)) between 1 and 120),
  actor_account_id uuid references public.developer_accounts(id) on delete set null,
  actor_admin_id uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists developer_inventory_activity_project_idx
  on public.developer_inventory_activity(developer_id, project_id, created_at desc);
create index if not exists developer_inventory_activity_entity_idx
  on public.developer_inventory_activity(entity_type, entity_id, created_at desc);

-- All template kinds use the same versioned payload contract. The explicit
-- kind values keep project, phase, unit, and payment templates reusable while
-- avoiding four subtly different storage/permission implementations.
create table if not exists public.developer_project_templates (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete restrict,
  template_type text not null check (template_type in ('project', 'phase', 'unit', 'payment')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  source_project_id uuid references public.developer_projects(id) on delete set null,
  source_phase_id uuid references public.developer_project_phases(id) on delete set null,
  source_unit_type_id uuid references public.project_unit_types(id) on delete set null,
  version integer not null default 1 check (version > 0),
  created_by_account_id uuid not null references public.developer_accounts(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists developer_project_templates_active_name_idx
  on public.developer_project_templates(developer_id, template_type, lower(btrim(name)))
  where archived_at is null;
create index if not exists developer_project_templates_developer_idx
  on public.developer_project_templates(developer_id, template_type, updated_at desc);

create table if not exists public.developer_inventory_saved_filters (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete restrict,
  account_id uuid not null references public.developer_accounts(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  filter jsonb not null check (jsonb_typeof(filter) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists developer_inventory_saved_filters_name_idx
  on public.developer_inventory_saved_filters(developer_id, account_id, lower(btrim(name)))
  where archived_at is null;

-- Restrictive service-only tables: the signed dashboard session is the sole
-- caller path, and every RPC below re-checks tenant membership/capability.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'developer_property_price_history',
    'developer_inventory_holds',
    'developer_publication_feedback',
    'developer_inventory_versions',
    'developer_inventory_activity',
    'developer_project_templates',
    'developer_inventory_saved_filters'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

create or replace function public.developer_account_has_inventory_capability(
  p_developer_id uuid,
  p_account_id uuid,
  p_capability text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  capability_result boolean;
begin
  -- The RBAC migration that follows this workspace migration owns the
  -- canonical matrix. Dynamic dispatch keeps this migration replayable on a
  -- database that has not received that migration yet.
  if to_regprocedure('public.developer_account_has_capability(uuid,uuid,text)') is not null then
    execute 'select public.developer_account_has_capability($1, $2, $3)'
      into capability_result
      using p_account_id, p_developer_id, p_capability;
    return coalesce(capability_result, false);
  end if;
  return exists (
    select 1
    from public.developer_accounts account
    where account.id = p_account_id
      and account.developer_id = p_developer_id
      and account.status = 'active'
      and (
        (p_capability = 'manage_projects' and lower(coalesce(account.role, '')) in ('developer_super_admin', 'developer_admin', 'super_admin', 'owner', 'admin', 'project_manager', 'project_admin', 'manager', 'member'))
        or (p_capability = 'manage_inventory' and lower(coalesce(account.role, '')) in ('developer_super_admin', 'developer_admin', 'super_admin', 'owner', 'admin', 'project_manager', 'project_admin', 'manager', 'member', 'sales_manager', 'sales'))
      )
  );
end;
$$;
revoke all on function public.developer_account_has_inventory_capability(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.developer_account_has_inventory_capability(uuid, uuid, text) to service_role;

-- Import and bulk-edit RPCs intentionally parse untrusted spreadsheet values
-- without allowing one malformed cell to abort the entire batch.
create or replace function public.developer_inventory_try_numeric(p_value text)
returns numeric
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if nullif(btrim(p_value), '') is null then return null; end if;
  return btrim(p_value)::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.developer_inventory_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if nullif(btrim(p_value), '') is null then return null; end if;
  return btrim(p_value)::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.developer_inventory_try_date(p_value text)
returns date
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if nullif(btrim(p_value), '') is null then return null; end if;
  return btrim(p_value)::date;
exception when others then
  return null;
end;
$$;

revoke all on function public.developer_inventory_try_numeric(text) from public, anon, authenticated;
revoke all on function public.developer_inventory_try_timestamptz(text) from public, anon, authenticated;
revoke all on function public.developer_inventory_try_date(text) from public, anon, authenticated;
grant execute on function public.developer_inventory_try_numeric(text) to service_role;
grant execute on function public.developer_inventory_try_timestamptz(text) to service_role;
grant execute on function public.developer_inventory_try_date(text) to service_role;

create or replace function public.expire_developer_inventory_holds()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expired_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  with expired as (
    update public.developer_inventory_holds
    set status = 'expired', updated_at = now(), released_at = coalesce(released_at, now())
    where status = 'active' and expires_at <= now()
    returning property_id
  ), restored as (
    update public.properties property
    set availability_state = 'available', availability_updated_at = now(), updated_at = now()
    where property.id in (select property_id from expired)
      and property.availability_state = 'held'
      and not exists (
        select 1 from public.developer_inventory_holds hold
        where hold.property_id = property.id and hold.status = 'active' and hold.expires_at > now()
      )
    returning property.id
  )
  select count(*) into expired_count from expired;
  return expired_count;
end;
$$;
revoke all on function public.expire_developer_inventory_holds() from public, anon, authenticated;
grant execute on function public.expire_developer_inventory_holds() to service_role;

-- The current project publication check is reused, but this RPC gives the
-- developer an explicit local-ready/submitted transition and clears stale
-- review evidence atomically.
create or replace function public.mark_developer_project_ready(
  p_developer_id uuid,
  p_project_id uuid,
  p_account_id uuid
)
returns public.developer_projects
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_row public.developer_projects%rowtype;
  checklist jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_projects') then
    raise exception 'Project management capability required';
  end if;
  select * into project_row
  from public.developer_projects
  where id = p_project_id and developer_id = p_developer_id
  for update;
  if not found then raise exception 'Project not found or access denied'; end if;
  if project_row.lifecycle_state = 'archived' then raise exception 'Archived projects cannot be marked ready'; end if;
  checklist := public.developer_project_publication_check(p_project_id);
  if not coalesce((checklist->>'ready')::boolean, false) then
    update public.developer_projects
    set publication_checklist = checklist,
        quality_issues = coalesce(array(select jsonb_array_elements_text(checklist->'issues')), '{}'::text[]),
        quality_score = greatest(0, 100 - jsonb_array_length(coalesce(checklist->'issues', '[]'::jsonb)) * 15),
        publication_status = 'draft',
        updated_at = now()
    where id = p_project_id
    returning * into project_row;
    raise exception 'Project is not ready: %', checklist->'issues';
  end if;
  update public.developer_projects
  set publication_checklist = checklist,
      quality_issues = '{}',
      quality_score = 100,
      publication_status = 'ready',
      ready_at = now(),
      changes_requested_at = null,
      publication_feedback = '{}'::jsonb,
      updated_at = now()
  where id = p_project_id
  returning * into project_row;
  return project_row;
end;
$$;

create or replace function public.submit_developer_project_for_review(
  p_developer_id uuid,
  p_project_id uuid,
  p_account_id uuid
)
returns public.developer_projects
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_row public.developer_projects%rowtype;
  checklist jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_projects') then
    raise exception 'Project management capability required';
  end if;
  select * into project_row from public.developer_projects
  where id = p_project_id and developer_id = p_developer_id for update;
  if not found then raise exception 'Project not found or access denied'; end if;
  if project_row.lifecycle_state = 'archived' then raise exception 'Archived projects cannot be submitted'; end if;
  checklist := public.developer_project_publication_check(p_project_id);
  if not coalesce((checklist->>'ready')::boolean, false) then
    update public.developer_projects
    set publication_checklist = checklist,
        quality_issues = coalesce(array(select jsonb_array_elements_text(checklist->'issues')), '{}'::text[]),
        quality_score = greatest(0, 100 - jsonb_array_length(coalesce(checklist->'issues', '[]'::jsonb)) * 15),
        publication_status = 'draft', updated_at = now()
    where id = p_project_id;
    raise exception 'Project is not ready for submission: %', checklist->'issues';
  end if;
  update public.developer_projects
  set approval_status = 'pending', rejection_reason = null, reviewed_by = null, reviewed_at = null,
      lifecycle_state = 'draft', published_at = null,
      publication_checklist = checklist, quality_issues = '{}', quality_score = 100,
      publication_status = 'submitted', submitted_at = now(), submitted_by_account_id = p_account_id,
      changes_requested_at = null, publication_feedback = '{}'::jsonb, updated_at = now()
  where id = p_project_id
  returning * into project_row;
  update public.developer_project_phases
  set publication_status = 'submitted', submitted_at = now(), submitted_by_account_id = p_account_id,
      changes_requested_at = null, publication_feedback = '{}'::jsonb, updated_at = now()
  where project_id = p_project_id and archived_at is null;
  insert into public.developer_inventory_activity(
    developer_id, project_id, entity_type, entity_id, action, actor_account_id, metadata
  ) values (
    p_developer_id, p_project_id, 'project', p_project_id, 'submitted_for_review', p_account_id,
    jsonb_build_object('publication_status', 'submitted', 'quality_score', 100)
  );
  return project_row;
end;
$$;

revoke all on function public.mark_developer_project_ready(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_developer_project_for_review(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_developer_project_ready(uuid, uuid, uuid) to service_role;
grant execute on function public.submit_developer_project_for_review(uuid, uuid, uuid) to service_role;

-- Review RPCs from the prior migration update approval_status/lifecycle_state;
-- this after-trigger mirrors their final result into the explicit workflow.
create or replace function public.sync_developer_inventory_publication_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_developer_id uuid;
begin
  if tg_table_name = 'developer_projects' then
    target_developer_id := new.developer_id;
    if new.approval_status = 'rejected' then
      update public.developer_projects set publication_status = 'changes_requested', changes_requested_at = now(), updated_at = now() where id = new.id;
    elsif new.approval_status = 'approved' and new.lifecycle_state = 'published' and new.published_at is not null then
      update public.developer_projects set publication_status = 'published', approved_at = coalesce(approved_at, now()), updated_at = now() where id = new.id;
    elsif new.approval_status = 'approved' then
      update public.developer_projects set publication_status = 'approved', approved_at = coalesce(approved_at, now()), updated_at = now() where id = new.id;
    elsif new.approval_status = 'pending' and old.approval_status is distinct from 'pending'
      and new.publication_status not in ('draft', 'ready') then
      update public.developer_projects set publication_status = 'submitted', submitted_at = coalesce(submitted_at, now()), updated_at = now() where id = new.id;
    end if;
  elsif tg_table_name = 'developer_project_phases' then
    select project.developer_id into target_developer_id
    from public.developer_projects project where project.id = new.project_id;
    if new.approval_status = 'rejected' then
      update public.developer_project_phases set publication_status = 'changes_requested', changes_requested_at = now(), updated_at = now() where id = new.id;
    elsif new.approval_status = 'approved' and new.lifecycle_state = 'published' and new.published_at is not null then
      update public.developer_project_phases set publication_status = 'published', approved_at = coalesce(approved_at, now()), updated_at = now() where id = new.id;
    elsif new.approval_status = 'approved' then
      update public.developer_project_phases set publication_status = 'approved', approved_at = coalesce(approved_at, now()), updated_at = now() where id = new.id;
    elsif new.approval_status = 'pending' and old.approval_status is distinct from 'pending'
      and new.publication_status not in ('draft', 'ready') then
      update public.developer_project_phases set publication_status = 'submitted', submitted_at = coalesce(submitted_at, now()), updated_at = now() where id = new.id;
    end if;
  elsif tg_table_name = 'properties' then
    target_developer_id := new.developer_id;
    if new.approval_status::text = 'rejected' then
      update public.properties set publication_status = 'changes_requested', changes_requested_at = now(), updated_at = now() where id = new.id;
    elsif new.approval_status::text = 'approved' and new.published_at is not null and new.is_active then
      update public.properties set publication_status = 'published', approved_at = coalesce(approved_at, now()), updated_at = now() where id = new.id;
    elsif new.approval_status::text = 'approved' then
      update public.properties set publication_status = 'approved', approved_at = coalesce(approved_at, now()), updated_at = now() where id = new.id;
    elsif new.approval_status::text = 'pending' and old.approval_status::text is distinct from 'pending'
      and new.publication_status not in ('draft', 'ready') then
      update public.properties set publication_status = 'submitted', submitted_at = coalesce(submitted_at, now()), updated_at = now() where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

-- A direct write must not make an unapproved record look published. Existing
-- moderation RPCs still own the legacy approval/lifecycle columns; this guard
-- only protects the new explicit publication contract from accidental bypass.
create or replace function public.guard_developer_inventory_publication_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.publication_status = 'published' then
    if tg_table_name = 'developer_projects'
       and not (new.approval_status = 'approved' and new.lifecycle_state = 'published' and new.published_at is not null) then
      raise exception 'Published projects require approved moderation, published lifecycle, and published_at';
    elsif tg_table_name = 'developer_project_phases'
       and not (new.approval_status = 'approved' and new.lifecycle_state = 'published' and new.published_at is not null) then
      raise exception 'Published phases require approved moderation, published lifecycle, and published_at';
    elsif tg_table_name = 'properties'
       and not (new.approval_status::text = 'approved' and new.is_active and new.published_at is not null) then
      raise exception 'Published inventory requires approved moderation, active state, and published_at';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists developer_projects_publication_status_guard on public.developer_projects;
create trigger developer_projects_publication_status_guard
before insert or update of publication_status on public.developer_projects
for each row execute function public.guard_developer_inventory_publication_status();
drop trigger if exists developer_project_phases_publication_status_guard on public.developer_project_phases;
create trigger developer_project_phases_publication_status_guard
before insert or update of publication_status on public.developer_project_phases
for each row execute function public.guard_developer_inventory_publication_status();
drop trigger if exists properties_publication_status_guard on public.properties;
create trigger properties_publication_status_guard
before insert or update of publication_status on public.properties
for each row execute function public.guard_developer_inventory_publication_status();
revoke all on function public.guard_developer_inventory_publication_status() from public, anon, authenticated;

drop trigger if exists developer_projects_publication_status_sync on public.developer_projects;
create trigger developer_projects_publication_status_sync
after update of approval_status, lifecycle_state, published_at on public.developer_projects
for each row execute function public.sync_developer_inventory_publication_status();
drop trigger if exists developer_project_phases_publication_status_sync on public.developer_project_phases;
create trigger developer_project_phases_publication_status_sync
after update of approval_status, lifecycle_state, published_at on public.developer_project_phases
for each row execute function public.sync_developer_inventory_publication_status();
drop trigger if exists properties_publication_status_sync on public.properties;
create trigger properties_publication_status_sync
after update of approval_status, is_active, published_at on public.properties
for each row execute function public.sync_developer_inventory_publication_status();
revoke all on function public.sync_developer_inventory_publication_status() from public, anon, authenticated;

-- Price history is append-only. The setting is set only by the restore RPC;
-- normal updates always preserve a price audit entry.
create or replace function public.record_developer_property_price_history()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_id uuid;
begin
  account_id := nullif(current_setting('app.developer_account_id', true), '')::uuid;
  if tg_op = 'INSERT' or old.price is distinct from new.price or old.price_effective_from is distinct from new.price_effective_from then
    update public.developer_property_price_history
    set effective_to = greatest(effective_from, coalesce(effective_to, coalesce(new.price_effective_from, now())))
    where property_id = new.id and effective_to is null;
    insert into public.developer_property_price_history(
      property_id, developer_id, previous_price, price, effective_from,
      change_reason, changed_by_account_id
    ) values (
      new.id, new.developer_id, case when tg_op = 'INSERT' then null else old.price end,
      new.price, coalesce(new.price_effective_from, now()),
      case when tg_op = 'INSERT' then 'initial_price' else 'price_update' end,
      account_id
    );
  end if;
  return new;
end;
$$;
drop trigger if exists properties_price_history_record on public.properties;
create trigger properties_price_history_record
after insert or update of price, price_effective_from on public.properties
for each row execute function public.record_developer_property_price_history();
revoke all on function public.record_developer_property_price_history() from public, anon, authenticated;

create or replace function public.record_developer_inventory_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  developer_id_value uuid;
  project_id_value uuid;
  phase_id_value uuid;
  entity_id_value uuid;
  entity_type_value text;
  account_id_value uuid;
  action_value text;
  metadata_value jsonb;
begin
  account_id_value := nullif(current_setting('app.developer_account_id', true), '')::uuid;
  if tg_table_name = 'developer_projects' then
    developer_id_value := coalesce(new.developer_id, old.developer_id);
    project_id_value := coalesce(new.id, old.id);
    entity_id_value := project_id_value;
    entity_type_value := 'project';
  elsif tg_table_name = 'developer_project_phases' then
    developer_id_value := coalesce((select developer_id from public.developer_projects where id = coalesce(new.project_id, old.project_id)), null);
    project_id_value := coalesce(new.project_id, old.project_id);
    phase_id_value := coalesce(new.id, old.id);
    entity_id_value := phase_id_value;
    entity_type_value := 'phase';
  elsif tg_table_name = 'project_unit_types' then
    developer_id_value := (select project.developer_id from public.developer_projects project where project.id = coalesce(new.project_id, old.project_id));
    project_id_value := coalesce(new.project_id, old.project_id);
    phase_id_value := coalesce(new.phase_id, old.phase_id);
    entity_id_value := coalesce(new.id, old.id);
    entity_type_value := 'unit_type';
  elsif tg_table_name = 'project_unit_variants' then
    select project.developer_id, project.id, unit_type.phase_id
    into developer_id_value, project_id_value, phase_id_value
    from public.project_unit_types unit_type
    join public.developer_projects project on project.id = unit_type.project_id
    where unit_type.id = coalesce(new.project_unit_type_id, old.project_unit_type_id);
    entity_id_value := coalesce(new.id, old.id);
    entity_type_value := 'unit_variant';
  elsif tg_table_name = 'properties' then
    developer_id_value := coalesce(new.developer_id, old.developer_id);
    project_id_value := coalesce(new.project_id, old.project_id);
    phase_id_value := coalesce(new.phase_id, old.phase_id);
    entity_id_value := coalesce(new.id, old.id);
    entity_type_value := 'property';
  elsif tg_table_name = 'developer_inventory_holds' then
    developer_id_value := coalesce(new.developer_id, old.developer_id);
    entity_id_value := coalesce(new.id, old.id);
    entity_type_value := 'hold';
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  action_value := case when tg_op = 'INSERT' then 'created' when tg_op = 'DELETE' then 'deleted' else 'updated' end;
  metadata_value := case when tg_op = 'DELETE' then jsonb_build_object('before', to_jsonb(old)) else jsonb_build_object('after', to_jsonb(new)) end;
  if developer_id_value is not null then
    insert into public.developer_inventory_activity(
      developer_id, project_id, phase_id, entity_type, entity_id, action,
      actor_account_id, metadata
    ) values (
      developer_id_value, project_id_value, phase_id_value, entity_type_value,
      entity_id_value, action_value, account_id_value, metadata_value
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.record_developer_inventory_version()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  developer_id_value uuid;
  entity_id_value uuid;
  entity_type_value text;
  project_id_value uuid;
  phase_id_value uuid;
  account_id_value uuid;
  next_version integer;
  restored_from_version_value integer;
  changed_fields_value text[] := '{}';
  before_json jsonb;
  after_json jsonb;
begin
  account_id_value := nullif(current_setting('app.developer_account_id', true), '')::uuid;
  restored_from_version_value := nullif(current_setting('app.developer_inventory_restore_version', true), '')::integer;
  before_json := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  after_json := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  if tg_table_name = 'developer_projects' then
    developer_id_value := coalesce(new.developer_id, old.developer_id); entity_id_value := coalesce(new.id, old.id); entity_type_value := 'project'; project_id_value := entity_id_value;
  elsif tg_table_name = 'developer_project_phases' then
    project_id_value := coalesce(new.project_id, old.project_id); entity_id_value := coalesce(new.id, old.id); entity_type_value := 'phase';
    select developer_id into developer_id_value from public.developer_projects where id = project_id_value;
    phase_id_value := entity_id_value;
  elsif tg_table_name = 'project_unit_types' then
    project_id_value := coalesce(new.project_id, old.project_id); entity_id_value := coalesce(new.id, old.id); entity_type_value := 'unit_type';
    select developer_id into developer_id_value from public.developer_projects where id = project_id_value;
    phase_id_value := coalesce(new.phase_id, old.phase_id);
  elsif tg_table_name = 'project_unit_variants' then
    entity_id_value := coalesce(new.id, old.id); entity_type_value := 'unit_variant';
    select unit_type.project_id, unit_type.phase_id, project.developer_id into project_id_value, phase_id_value, developer_id_value
    from public.project_unit_types unit_type join public.developer_projects project on project.id = unit_type.project_id
    where unit_type.id = coalesce(new.project_unit_type_id, old.project_unit_type_id);
  elsif tg_table_name = 'properties' then
    developer_id_value := coalesce(new.developer_id, old.developer_id); project_id_value := coalesce(new.project_id, old.project_id); phase_id_value := coalesce(new.phase_id, old.phase_id); entity_id_value := coalesce(new.id, old.id); entity_type_value := 'property';
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(entity_type_value || ':' || entity_id_value::text, 0));
  select coalesce(max(version), 0) + 1 into next_version
  from public.developer_inventory_versions
  where entity_type = entity_type_value and entity_id = entity_id_value;
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into changed_fields_value
    from jsonb_each(before_json) before_entry(key, value)
    where after_json->key is distinct from before_entry.value;
  elsif tg_op = 'INSERT' then
    changed_fields_value := array['created'];
  else
    changed_fields_value := array['deleted'];
  end if;
  insert into public.developer_inventory_versions(
    developer_id, entity_type, entity_id, version, snapshot,
    change_summary, changed_fields, created_by_account_id, created_by_admin_id,
    restored_from_version
  ) values (
    developer_id_value, entity_type_value, entity_id_value, next_version,
    case when tg_op = 'DELETE' then before_json else after_json end,
    case when tg_op = 'INSERT' then 'Created' when tg_op = 'DELETE' then 'Deleted' else 'Updated' end,
    coalesce(changed_fields_value, '{}'), account_id_value, null, restored_from_version_value
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists developer_projects_inventory_version_record on public.developer_projects;
create trigger developer_projects_inventory_version_record after insert or update or delete on public.developer_projects for each row execute function public.record_developer_inventory_version();
drop trigger if exists developer_project_phases_inventory_version_record on public.developer_project_phases;
create trigger developer_project_phases_inventory_version_record after insert or update or delete on public.developer_project_phases for each row execute function public.record_developer_inventory_version();
drop trigger if exists project_unit_types_inventory_version_record on public.project_unit_types;
create trigger project_unit_types_inventory_version_record after insert or update or delete on public.project_unit_types for each row execute function public.record_developer_inventory_version();
drop trigger if exists project_unit_variants_inventory_version_record on public.project_unit_variants;
create trigger project_unit_variants_inventory_version_record after insert or update or delete on public.project_unit_variants for each row execute function public.record_developer_inventory_version();
drop trigger if exists properties_inventory_version_record on public.properties;
create trigger properties_inventory_version_record after insert or update or delete on public.properties for each row execute function public.record_developer_inventory_version();
drop trigger if exists developer_projects_inventory_activity_record on public.developer_projects;
create trigger developer_projects_inventory_activity_record after insert or update or delete on public.developer_projects for each row execute function public.record_developer_inventory_activity();
drop trigger if exists developer_project_phases_inventory_activity_record on public.developer_project_phases;
create trigger developer_project_phases_inventory_activity_record after insert or update or delete on public.developer_project_phases for each row execute function public.record_developer_inventory_activity();
drop trigger if exists project_unit_types_inventory_activity_record on public.project_unit_types;
create trigger project_unit_types_inventory_activity_record after insert or update or delete on public.project_unit_types for each row execute function public.record_developer_inventory_activity();
drop trigger if exists project_unit_variants_inventory_activity_record on public.project_unit_variants;
create trigger project_unit_variants_inventory_activity_record after insert or update or delete on public.project_unit_variants for each row execute function public.record_developer_inventory_activity();
drop trigger if exists properties_inventory_activity_record on public.properties;
create trigger properties_inventory_activity_record after insert or update or delete on public.properties for each row execute function public.record_developer_inventory_activity();
drop trigger if exists developer_inventory_holds_activity_record on public.developer_inventory_holds;
create trigger developer_inventory_holds_activity_record after insert or update or delete on public.developer_inventory_holds for each row execute function public.record_developer_inventory_activity();
revoke all on function public.record_developer_inventory_activity() from public, anon, authenticated;
revoke all on function public.record_developer_inventory_version() from public, anon, authenticated;

create or replace function public.developer_project_impact_summary(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  project_developer_id uuid;
  unit_type_count integer;
  variant_count integer;
  property_count integer;
  published_count integer;
  hold_count integer;
  open_feedback_count integer;
  phase_count integer;
begin
  select developer_id into project_developer_id from public.developer_projects where id = p_project_id;
  if project_developer_id is null then return jsonb_build_object('found', false); end if;
  select count(*) into phase_count from public.developer_project_phases where project_id = p_project_id and archived_at is null;
  select count(*) into unit_type_count from public.project_unit_types where project_id = p_project_id and archived_at is null;
  select count(*) into variant_count from public.project_unit_variants variant join public.project_unit_types unit_type on unit_type.id = variant.project_unit_type_id where unit_type.project_id = p_project_id and unit_type.archived_at is null and variant.archived_at is null;
  select count(*) into property_count from public.properties where project_id = p_project_id and developer_id = project_developer_id and listed_by_agent_id is null and archived_at is null;
  select count(*) into published_count from public.properties where project_id = p_project_id and developer_id = project_developer_id and listed_by_agent_id is null and archived_at is null and publication_status = 'published';
  select count(*) into hold_count from public.developer_inventory_holds where developer_id = project_developer_id and status = 'active' and expires_at > now() and property_id in (select id from public.properties where project_id = p_project_id);
  select count(*) into open_feedback_count
  from public.developer_publication_feedback feedback
  where feedback.developer_id = project_developer_id
    and feedback.status = 'open'
    and (
      feedback.entity_id = p_project_id
      or feedback.entity_id in (select id from public.properties where project_id = p_project_id)
      or feedback.entity_id in (select id from public.developer_project_phases where project_id = p_project_id)
      or feedback.entity_id in (select id from public.project_unit_types where project_id = p_project_id)
    );
  return jsonb_build_object(
    'found', true, 'project_id', p_project_id, 'phase_count', phase_count,
    'unit_type_count', unit_type_count, 'variant_count', variant_count,
    'property_count', property_count, 'published_property_count', published_count,
    'active_hold_count', hold_count, 'open_feedback_count', open_feedback_count
  );
end;
$$;
revoke all on function public.developer_project_impact_summary(uuid) from public, anon, authenticated;
grant execute on function public.developer_project_impact_summary(uuid) to service_role;

-- Atomic inventory edits support dry-run and return row-level errors instead
-- of aborting the whole batch. `held` rows require an expiry and create the
-- same unique active hold used by the dedicated hold RPC.
create or replace function public.bulk_update_developer_inventory(
  p_developer_id uuid,
  p_project_id uuid,
  p_phase_id uuid,
  p_account_id uuid,
  p_rows jsonb,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  input_row jsonb;
  row_id uuid;
  property_row public.properties%rowtype;
  price_value numeric;
  area_value numeric;
  state_value text;
  requested_state_value text;
  expiry_value timestamptz;
  expiry_raw text;
  price_raw text;
  area_raw text;
  effective_from_raw text;
  property_name_value text;
  inventory_code_value text;
  building_value text;
  unit_number_value text;
  floor_number_value integer;
  floor_number_numeric numeric;
  floor_number_raw text;
  holder_type_value text;
  errors jsonb := '[]'::jsonb;
  results jsonb := '[]'::jsonb;
  row_errors text[];
  updated_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_inventory') then raise exception 'Inventory management capability required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Inventory batch must be an array of no more than 500 rows'; end if;
  if not exists (select 1 from public.developer_projects where id = p_project_id and developer_id = p_developer_id) then raise exception 'Project not found or access denied'; end if;
  if not exists (select 1 from public.developer_project_phases where id = p_phase_id and project_id = p_project_id and archived_at is null) then raise exception 'Release phase not found or archived'; end if;
  if not p_dry_run then
    perform public.expire_developer_inventory_holds();
  end if;
  perform set_config('app.developer_account_id', p_account_id::text, true);

  for input_row in select value from jsonb_array_elements(p_rows) loop
    row_errors := '{}';
    row_id := null;
    property_row := null;
    price_value := null;
    area_value := null;
    expiry_value := null;
    expiry_raw := nullif(btrim(input_row->>'hold_expires_at'), '');
    effective_from_raw := nullif(btrim(input_row->>'price_effective_from'), '');
    holder_type_value := lower(coalesce(nullif(btrim(input_row->>'holder_type'), ''), 'internal'));
    property_name_value := coalesce(nullif(btrim(input_row->>'property_name'), ''), property_row.property_name);
    inventory_code_value := nullif(btrim(input_row->>'inventory_code'), '');
    building_value := nullif(btrim(input_row->>'building'), '');
    unit_number_value := nullif(btrim(input_row->>'unit_number'), '');
    floor_number_raw := nullif(btrim(input_row->>'floor_number'), '');
    floor_number_value := null;
    floor_number_numeric := public.developer_inventory_try_numeric(floor_number_raw);
    if jsonb_typeof(input_row) <> 'object' or nullif(input_row->>'id', '') is null or input_row->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      row_errors := array_append(row_errors, 'A valid inventory row id is required');
    else
      row_id := (input_row->>'id')::uuid;
      select * into property_row from public.properties
      where id = row_id and developer_id = p_developer_id and project_id = p_project_id and phase_id = p_phase_id and listed_by_agent_id is null and archived_at is null
      for update;
      if not found then row_errors := array_append(row_errors, 'Inventory row was not found in this project phase'); end if;
    end if;
    property_name_value := coalesce(nullif(btrim(input_row->>'property_name'), ''), property_row.property_name);
    if property_name_value is null or char_length(property_name_value) > 200 then row_errors := array_append(row_errors, 'Property name must contain between 1 and 200 characters'); end if;
    if inventory_code_value is not null and char_length(inventory_code_value) > 120 then row_errors := array_append(row_errors, 'Inventory code is too long'); end if;
    if building_value is not null and char_length(building_value) > 120 then row_errors := array_append(row_errors, 'Building is too long'); end if;
    if unit_number_value is not null and char_length(unit_number_value) > 120 then row_errors := array_append(row_errors, 'Unit number is too long'); end if;
    if floor_number_raw is not null and (floor_number_numeric is null or floor_number_numeric <> trunc(floor_number_numeric) or floor_number_numeric < -10 or floor_number_numeric > 1000) then
      row_errors := array_append(row_errors, 'Floor number must be a whole number');
    elsif floor_number_raw is not null then
      floor_number_value := floor_number_numeric::integer;
    else
      floor_number_value := property_row.floor_number;
    end if;
    price_raw := nullif(btrim(input_row->>'price'), '');
    if price_raw is not null then
      price_value := public.developer_inventory_try_numeric(price_raw);
      if price_value is null then row_errors := array_append(row_errors, 'Price must be numeric'); elsif price_value < 100000 then row_errors := array_append(row_errors, 'Price must be at least EGP 100,000'); end if;
    else price_value := property_row.price;
    end if;
    area_raw := nullif(btrim(input_row->>'unit_area'), '');
    if area_raw is not null then
      area_value := public.developer_inventory_try_numeric(area_raw);
      if area_value is null then row_errors := array_append(row_errors, 'Unit area must be numeric'); elsif area_value < 10 then row_errors := array_append(row_errors, 'Unit area must be at least 10 m²'); end if;
    else area_value := property_row.unit_area;
    end if;
    requested_state_value := lower(nullif(btrim(input_row->>'availability_state'), ''));
    state_value := coalesce(requested_state_value, property_row.availability_state, 'available');
    if state_value not in ('available', 'held', 'reserved', 'contracted', 'sold', 'released') then row_errors := array_append(row_errors, 'Availability must be available, held, reserved, contracted, sold, or released'); end if;
    if requested_state_value is not null and state_value in ('reserved', 'contracted', 'sold') then row_errors := array_append(row_errors, 'Reserved, contracted, and sold states require a controlled sales workflow'); end if;
    if state_value = 'held' and holder_type_value not in ('internal', 'agent', 'customer', 'contract') then row_errors := array_append(row_errors, 'Hold holder type must be internal, agent, customer, or contract'); end if;
    expiry_value := public.developer_inventory_try_timestamptz(expiry_raw);
    if expiry_raw is not null and expiry_value is null then row_errors := array_append(row_errors, 'Hold expiry must be a valid timestamp'); end if;
    if state_value = 'held' and (expiry_value is null or expiry_value <= now()) then row_errors := array_append(row_errors, 'Held inventory requires a future hold expiry'); end if;
    if effective_from_raw is not null and public.developer_inventory_try_timestamptz(effective_from_raw) is null then row_errors := array_append(row_errors, 'Price effective date must be a valid timestamp'); end if;
    if row_id is not null and state_value in ('held', 'reserved', 'contracted', 'sold') and exists (select 1 from public.developer_inventory_holds where property_id = row_id and status = 'active' and expires_at > now() and state_value <> 'held') then row_errors := array_append(row_errors, 'An active hold prevents this availability transition'); end if;
    if cardinality(row_errors) > 0 then
      errors := errors || jsonb_build_array(jsonb_build_object('id', input_row->>'id', 'errors', row_errors));
      continue;
    end if;
    if p_dry_run then
      results := results || jsonb_build_array(jsonb_build_object('id', row_id, 'property_name', property_name_value, 'inventory_code', inventory_code_value, 'building', building_value, 'floor_number', floor_number_value, 'unit_number', unit_number_value, 'price', price_value, 'unit_area', area_value, 'availability_state', state_value));
      continue;
    end if;
    begin
      if state_value = 'held' then
        insert into public.developer_inventory_holds(developer_id, property_id, holder_type, holder_reference, expires_at, created_by_account_id)
        values (p_developer_id, row_id, holder_type_value, nullif(input_row->>'holder_reference', ''), expiry_value, p_account_id);
      elsif state_value in ('available', 'released') then
        update public.developer_inventory_holds set status = 'released', released_by_account_id = p_account_id, released_at = now(), updated_at = now() where property_id = row_id and status = 'active';
      end if;
      update public.properties
      set property_name = property_name_value, inventory_code = inventory_code_value,
          building = building_value, floor_number = floor_number_value,
          unit_number = unit_number_value, price = price_value, unit_area = area_value,
          availability_state = state_value, availability_updated_at = now(),
          price_effective_from = coalesce(public.developer_inventory_try_timestamptz(effective_from_raw), price_effective_from, now()),
          updated_at = now(), approval_status = 'pending', is_active = false, published_at = null,
          publication_status = 'draft', rejection_reason = null, reviewed_by = null, reviewed_at = null
      where id = row_id;
    exception when unique_violation then
      errors := errors || jsonb_build_array(jsonb_build_object(
        'id', row_id,
        'errors', array[case when state_value = 'held' then 'Inventory row is already actively held' else 'Inventory code is already used by another active row' end]
      ));
      continue;
    end;
    results := results || jsonb_build_array(jsonb_build_object('id', row_id, 'property_name', property_name_value, 'inventory_code', inventory_code_value, 'building', building_value, 'floor_number', floor_number_value, 'unit_number', unit_number_value, 'price', price_value, 'unit_area', area_value, 'availability_state', state_value));
    updated_count := updated_count + 1;
  end loop;
  return jsonb_build_object('dry_run', p_dry_run, 'updated_count', updated_count, 'rows', results, 'errors', errors);
end;
$$;
revoke all on function public.bulk_update_developer_inventory(uuid, uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.bulk_update_developer_inventory(uuid, uuid, uuid, uuid, jsonb, boolean) to service_role;

create or replace function public.create_developer_inventory_hold(
  p_developer_id uuid,
  p_property_id uuid,
  p_account_id uuid,
  p_expires_at timestamptz,
  p_holder_type text default 'internal',
  p_holder_reference text default null
)
returns public.developer_inventory_holds
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  property_row public.properties%rowtype;
  hold_row public.developer_inventory_holds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_inventory') then raise exception 'Inventory management capability required'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'Hold expiry must be in the future'; end if;
  if p_holder_type not in ('internal', 'agent', 'customer', 'contract') then raise exception 'Invalid hold holder type'; end if;
  perform public.expire_developer_inventory_holds();
  select * into property_row from public.properties
  where id = p_property_id and developer_id = p_developer_id and listed_by_agent_id is null and archived_at is null
  for update;
  if not found then raise exception 'Inventory row not found or access denied'; end if;
  if property_row.availability_state not in ('available', 'released') then raise exception 'Inventory row is not available for a new hold'; end if;
  if exists (select 1 from public.developer_inventory_holds where property_id = p_property_id and status = 'active') then raise exception 'Inventory row is already held'; end if;
  perform set_config('app.developer_account_id', p_account_id::text, true);
  insert into public.developer_inventory_holds(developer_id, property_id, holder_type, holder_reference, expires_at, created_by_account_id)
  values (p_developer_id, p_property_id, p_holder_type, nullif(btrim(p_holder_reference), ''), p_expires_at, p_account_id)
  returning * into hold_row;
  update public.properties set availability_state = 'held', availability_updated_at = now(), updated_at = now() where id = p_property_id;
  return hold_row;
exception when unique_violation then
  raise exception 'Inventory row is already held';
end;
$$;

create or replace function public.release_developer_inventory_hold(
  p_developer_id uuid,
  p_hold_id uuid,
  p_account_id uuid,
  p_next_state text default 'released'
)
returns public.developer_inventory_holds
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  hold_row public.developer_inventory_holds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_inventory') then raise exception 'Inventory management capability required'; end if;
  if p_next_state not in ('released', 'converted') then raise exception 'Invalid hold release state'; end if;
  perform public.expire_developer_inventory_holds();
  select * into hold_row from public.developer_inventory_holds where id = p_hold_id and developer_id = p_developer_id for update;
  if not found then raise exception 'Hold not found or access denied'; end if;
  if hold_row.status <> 'active' then raise exception 'Hold is no longer active'; end if;
  if hold_row.expires_at <= clock_timestamp() then raise exception 'Hold has expired'; end if;
  perform set_config('app.developer_account_id', p_account_id::text, true);
  update public.developer_inventory_holds set status = p_next_state, released_by_account_id = p_account_id, released_at = now(), updated_at = now() where id = p_hold_id returning * into hold_row;
  update public.properties set availability_state = case when p_next_state = 'converted' then 'contracted' else 'released' end, availability_updated_at = now(), updated_at = now() where id = hold_row.property_id and availability_state = 'held';
  return hold_row;
end;
$$;
revoke all on function public.create_developer_inventory_hold(uuid, uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.release_developer_inventory_hold(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_developer_inventory_hold(uuid, uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.release_developer_inventory_hold(uuid, uuid, uuid, text) to service_role;

-- The import RPC validates each row before its insert. It keeps imported rows
-- pending/inactive so import can never bypass moderation.
create or replace function public.import_developer_inventory_rows(
  p_developer_id uuid,
  p_project_id uuid,
  p_phase_id uuid,
  p_account_id uuid,
  p_rows jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  input_row jsonb;
  property_name_value text;
  property_type_value text;
  price_value numeric;
  area_value numeric;
  photos_value text[];
  bedrooms_value integer;
  bathrooms_value integer;
  floor_number_value integer;
  installment_years_value integer;
  bedrooms_numeric numeric;
  bathrooms_numeric numeric;
  floor_number_numeric numeric;
  installment_years_numeric numeric;
  down_payment_value numeric;
  monthly_installment_value numeric;
  sale_type_value text;
  price_effective_from_value timestamptz;
  delivery_date_value date;
  finishing_status_value public.finishing_status;
  raw_value text;
  row_errors text[];
  errors jsonb := '[]'::jsonb;
  rows_saved integer := 0;
  duplicate_exists boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_inventory') then raise exception 'Inventory management capability required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Import must contain no more than 500 rows'; end if;
  if not exists (select 1 from public.developer_projects where id = p_project_id and developer_id = p_developer_id) then raise exception 'Project not found or access denied'; end if;
  if not exists (select 1 from public.developer_project_phases where id = p_phase_id and project_id = p_project_id and archived_at is null) then raise exception 'Release phase not found or archived'; end if;
  perform set_config('app.developer_account_id', p_account_id::text, true);
  for input_row in select value from jsonb_array_elements(p_rows) loop
    row_errors := '{}';
    price_value := null;
    area_value := null;
    photos_value := '{}';
    bedrooms_value := null;
    bathrooms_value := null;
    floor_number_value := null;
    installment_years_value := null;
    down_payment_value := null;
    monthly_installment_value := null;
    price_effective_from_value := null;
    delivery_date_value := null;
    finishing_status_value := null;
    property_name_value := nullif(btrim(input_row->>'property_name'), '');
    property_type_value := lower(nullif(btrim(input_row->>'property_type'), ''));
    sale_type_value := lower(coalesce(nullif(btrim(input_row->>'sale_type'), ''), 'developer_sale'));
    if property_name_value is null then row_errors := array_append(row_errors, 'Property name is required'); end if;
    if sale_type_value not in ('developer_sale', 'resale') then row_errors := array_append(row_errors, 'Sale type must be developer_sale or resale'); end if;
    raw_value := nullif(btrim(input_row->>'price'), '');
    price_value := public.developer_inventory_try_numeric(raw_value);
    if raw_value is null or price_value is null then row_errors := array_append(row_errors, 'Price must be numeric'); elsif price_value < 100000 then row_errors := array_append(row_errors, 'Price must be at least EGP 100,000'); end if;
    raw_value := nullif(btrim(input_row->>'unit_area'), '');
    area_value := public.developer_inventory_try_numeric(raw_value);
    if raw_value is null or area_value is null then row_errors := array_append(row_errors, 'Unit area must be numeric'); elsif area_value < 10 then row_errors := array_append(row_errors, 'Unit area must be at least 10 m²'); end if;
    if not exists (select 1 from pg_enum enum join pg_type typ on typ.oid = enum.enumtypid where typ.typnamespace = 'public'::regnamespace and typ.typname = 'property_type' and enum.enumlabel = property_type_value) then row_errors := array_append(row_errors, 'Property type is not supported'); end if;
    if nullif(btrim(input_row->>'description'), '') is null then row_errors := array_append(row_errors, 'Description is required'); end if;
    photos_value := case when jsonb_typeof(input_row->'photos') = 'array' then array(select jsonb_array_elements_text(input_row->'photos')) else string_to_array(coalesce(input_row->>'photos', ''), '|') end;
    photos_value := array(select btrim(photo) from unnest(coalesce(photos_value, '{}'::text[])) as photo where btrim(photo) <> '');
    if coalesce(array_length(photos_value, 1), 0) < 3 then row_errors := array_append(row_errors, 'At least three photos are required'); end if;
    if exists (select 1 from unnest(coalesce(photos_value, '{}'::text[])) photo where photo !~* '^https?://') then row_errors := array_append(row_errors, 'Every photo must use an http(s) URL'); end if;
    if coalesce(array_length(photos_value, 1), 0) <> (select count(distinct lower(photo)) from unnest(coalesce(photos_value, '{}'::text[])) photo) then row_errors := array_append(row_errors, 'Photo URLs must be unique'); end if;
    raw_value := nullif(btrim(input_row->>'bedrooms'), '');
    bedrooms_numeric := public.developer_inventory_try_numeric(raw_value);
    if raw_value is not null and (bedrooms_numeric is null or bedrooms_numeric <> trunc(bedrooms_numeric) or bedrooms_numeric < 0 or bedrooms_numeric > 20) then row_errors := array_append(row_errors, 'Bedrooms must be a whole number from 0 to 20'); else bedrooms_value := bedrooms_numeric::integer; end if;
    raw_value := nullif(btrim(input_row->>'bathrooms'), '');
    bathrooms_numeric := public.developer_inventory_try_numeric(raw_value);
    if raw_value is not null and (bathrooms_numeric is null or bathrooms_numeric <> trunc(bathrooms_numeric) or bathrooms_numeric < 0 or bathrooms_numeric > 20) then row_errors := array_append(row_errors, 'Bathrooms must be a whole number from 0 to 20'); else bathrooms_value := bathrooms_numeric::integer; end if;
    raw_value := nullif(btrim(input_row->>'floor_number'), '');
    floor_number_numeric := public.developer_inventory_try_numeric(raw_value);
    if raw_value is not null and (floor_number_numeric is null or floor_number_numeric <> trunc(floor_number_numeric) or floor_number_numeric < -10 or floor_number_numeric > 1000) then row_errors := array_append(row_errors, 'Floor number must be a whole number'); else floor_number_value := floor_number_numeric::integer; end if;
    raw_value := nullif(btrim(input_row->>'installment_years'), '');
    installment_years_numeric := public.developer_inventory_try_numeric(raw_value);
    if raw_value is not null and (installment_years_numeric is null or installment_years_numeric <> trunc(installment_years_numeric) or installment_years_numeric < 0 or installment_years_numeric > 100) then row_errors := array_append(row_errors, 'Installment years must be a whole number from 0 to 100'); else installment_years_value := installment_years_numeric::integer; end if;
    raw_value := nullif(btrim(input_row->>'down_payment_percentage'), '');
    down_payment_value := public.developer_inventory_try_numeric(raw_value);
    if raw_value is not null and (down_payment_value is null or down_payment_value < 0 or down_payment_value > 100) then row_errors := array_append(row_errors, 'Down payment must be between 0 and 100'); end if;
    raw_value := nullif(btrim(input_row->>'monthly_installment'), '');
    monthly_installment_value := public.developer_inventory_try_numeric(raw_value);
    if raw_value is not null and (monthly_installment_value is null or monthly_installment_value < 0) then row_errors := array_append(row_errors, 'Monthly installment must be zero or more'); end if;
    raw_value := nullif(btrim(input_row->>'delivery_date'), '');
    delivery_date_value := public.developer_inventory_try_date(raw_value);
    if raw_value is not null and delivery_date_value is null then row_errors := array_append(row_errors, 'Delivery date must be a valid date'); end if;
    raw_value := nullif(btrim(input_row->>'price_effective_from'), '');
    price_effective_from_value := public.developer_inventory_try_timestamptz(raw_value);
    if raw_value is not null and price_effective_from_value is null then row_errors := array_append(row_errors, 'Price effective date must be a valid timestamp'); end if;
    raw_value := lower(nullif(btrim(input_row->>'finishing_status'), ''));
    if raw_value is not null and not exists (
      select 1 from pg_enum enum
      join pg_type typ on typ.oid = enum.enumtypid
      where typ.typnamespace = 'public'::regnamespace
        and typ.typname = 'finishing_status'
        and enum.enumlabel = raw_value
    ) then
      row_errors := array_append(row_errors, 'Finishing status is not supported');
    elsif raw_value is not null then
      finishing_status_value := raw_value::public.finishing_status;
    end if;
    select exists (select 1 from public.properties property where property.developer_id = p_developer_id and property.project_id = p_project_id and property.phase_id = p_phase_id and property.listed_by_agent_id is null and property.archived_at is null and lower(property.property_name) = lower(property_name_value) and property.price = price_value and property.unit_area = area_value and property.approval_status <> 'rejected') into duplicate_exists;
    if duplicate_exists then row_errors := array_append(row_errors, 'A matching active, pending, or approved listing already exists'); end if;
    if cardinality(row_errors) > 0 then
      errors := errors || jsonb_build_array(jsonb_build_object('row', input_row->>'row', 'errors', row_errors));
      continue;
    end if;
    if not p_dry_run then
      begin
        insert into public.properties(
        developer_id, project_id, phase_id, property_name, property_type, price, unit_area,
        description, photos, cover_photo_url, amenities, bedrooms, bathrooms,
        sale_type, down_payment_percentage, monthly_installment, installment_years,
        finishing_status, delivery_date, floor_plan_url, video_tour_url,
        inventory_code, building, floor_number, unit_number, inventory_notes,
        approval_status, is_active, publication_status, availability_state,
        price_effective_from, availability_updated_at, is_demo
      ) values (
        p_developer_id, p_project_id, p_phase_id, property_name_value, property_type_value::public.property_type,
        price_value, area_value, btrim(input_row->>'description'), photos_value, photos_value[1],
        case when jsonb_typeof(input_row->'amenities') = 'array' then array(select jsonb_array_elements_text(input_row->'amenities')) else '{}'::text[] end,
        bedrooms_value, bathrooms_value,
        sale_type_value::public.sale_type,
        down_payment_value, monthly_installment_value, installment_years_value,
        finishing_status_value, delivery_date_value, nullif(input_row->>'floor_plan_url', ''), nullif(input_row->>'video_tour_url', ''),
        nullif(input_row->>'inventory_code', ''), nullif(input_row->>'building', ''), floor_number_value, nullif(input_row->>'unit_number', ''), nullif(input_row->>'inventory_notes', ''),
        'pending', false, 'draft', 'available', coalesce(price_effective_from_value, now()), now(), false
        );
        rows_saved := rows_saved + 1;
      exception when unique_violation then
        errors := errors || jsonb_build_array(jsonb_build_object('row', input_row->>'row', 'errors', array['Inventory code is already used by another active row']));
        continue;
      end;
    end if;
  end loop;
  insert into public.developer_inventory_activity(
    developer_id, project_id, phase_id, entity_type, action, actor_account_id, metadata
  ) values (
    p_developer_id, p_project_id, p_phase_id, 'import',
    case when p_dry_run then 'import_dry_run' else 'import_completed' end,
    p_account_id,
    jsonb_build_object('rows_received', jsonb_array_length(p_rows), 'rows_saved', rows_saved, 'error_count', jsonb_array_length(errors))
  );
  return jsonb_build_object('dry_run', p_dry_run, 'rows_saved', rows_saved, 'total_rows', jsonb_array_length(p_rows), 'errors', errors);
end;
$$;
revoke all on function public.import_developer_inventory_rows(uuid, uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_developer_inventory_rows(uuid, uuid, uuid, uuid, jsonb, boolean) to service_role;

-- Save and clone flows are tenant scoped. Clones are always draft and never
-- inherit publication/availability state from the source snapshot.
create or replace function public.save_developer_project_template(
  p_developer_id uuid,
  p_account_id uuid,
  p_template_type text,
  p_name text,
  p_payload jsonb,
  p_source_project_id uuid default null,
  p_source_phase_id uuid default null,
  p_source_unit_type_id uuid default null
)
returns public.developer_project_templates
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  template_row public.developer_project_templates%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_template_type not in ('project', 'phase', 'unit', 'payment') then raise exception 'Invalid template type'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, case when p_template_type = 'payment' then 'manage_projects' else 'manage_projects' end) then raise exception 'Project management capability required'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 160 then raise exception 'Template name must contain between 1 and 160 characters'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'Template payload must be an object'; end if;
  if p_source_project_id is not null and not exists (
    select 1 from public.developer_projects project
    where project.id = p_source_project_id and project.developer_id = p_developer_id
  ) then raise exception 'Source project not found or access denied'; end if;
  if p_source_phase_id is not null and not exists (
    select 1
    from public.developer_project_phases phase
    join public.developer_projects project on project.id = phase.project_id
    where phase.id = p_source_phase_id and project.developer_id = p_developer_id
  ) then raise exception 'Source phase not found or access denied'; end if;
  if p_source_unit_type_id is not null and not exists (
    select 1
    from public.project_unit_types unit_type
    join public.developer_projects project on project.id = unit_type.project_id
    where unit_type.id = p_source_unit_type_id and project.developer_id = p_developer_id
  ) then raise exception 'Source unit type not found or access denied'; end if;
  insert into public.developer_project_templates(
    developer_id, template_type, name, payload, source_project_id, source_phase_id,
    source_unit_type_id, created_by_account_id
  ) values (
    p_developer_id, p_template_type, btrim(p_name), p_payload, p_source_project_id,
    p_source_phase_id, p_source_unit_type_id, p_account_id
  ) returning * into template_row;
  perform set_config('app.developer_account_id', p_account_id::text, true);
  insert into public.developer_inventory_activity(developer_id, project_id, entity_type, entity_id, action, actor_account_id, metadata)
  values (p_developer_id, p_source_project_id, 'template', template_row.id, 'template_saved', p_account_id, jsonb_build_object('template_type', p_template_type, 'name', template_row.name));
  return template_row;
end;
$$;

create or replace function public.clone_developer_project_from_template(
  p_developer_id uuid,
  p_account_id uuid,
  p_template_id uuid,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  template_row public.developer_project_templates%rowtype;
  source jsonb;
  new_project_id uuid;
  new_phase_id uuid;
  new_unit_type_id uuid;
  phase_payload jsonb;
  unit_payload jsonb;
  variant_payload jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_projects') then raise exception 'Project management capability required'; end if;
  select * into template_row from public.developer_project_templates where id = p_template_id and developer_id = p_developer_id and template_type = 'project' and archived_at is null for update;
  if not found then raise exception 'Project template not found or access denied'; end if;
  source := template_row.payload;
  insert into public.developer_projects(
    developer_id, name, description, hero_media, voice_notes, video_links, amenities, location,
    acres, footprint, maintenance, payment_plans, payment_plan_templates, limited_time_offers,
    launch_status, launch_date, eoi_value_apt, eoi_value_villa, ch_fees, project_types,
    inventory_url, project_logo_url, approval_status, lifecycle_state, publication_status,
    is_demo
  ) values (
    p_developer_id, coalesce(nullif(btrim(p_name), ''), btrim(coalesce(source->>'name', template_row.name || ' Copy'))),
    nullif(source->>'description', ''), case when jsonb_typeof(source->'hero_media') = 'object' then source->'hero_media' else '{}'::jsonb end,
    case when jsonb_typeof(source->'voice_notes') = 'array' then array(select jsonb_array_elements_text(source->'voice_notes')) else '{}'::text[] end,
    case when jsonb_typeof(source->'video_links') = 'array' then array(select jsonb_array_elements_text(source->'video_links')) else '{}'::text[] end,
    case when jsonb_typeof(source->'amenities') = 'array' then array(select jsonb_array_elements_text(source->'amenities')) else '{}'::text[] end,
    nullif(source->>'location', ''), nullif(source->>'acres', '')::numeric, nullif(source->>'footprint', '')::numeric,
    nullif(source->>'maintenance', '')::numeric, nullif(source->>'payment_plans', ''),
    case when jsonb_typeof(source->'payment_plan_templates') = 'array' then source->'payment_plan_templates' else '[]'::jsonb end,
    case when jsonb_typeof(source->'limited_time_offers') = 'array' then source->'limited_time_offers' else '[]'::jsonb end,
    coalesce(nullif(source->>'launch_status', ''), 'upcoming'), nullif(source->>'launch_date', '')::date,
    nullif(source->>'eoi_value_apt', '')::numeric, nullif(source->>'eoi_value_villa', '')::numeric, nullif(source->>'ch_fees', '')::numeric,
    case when jsonb_typeof(source->'project_types') = 'array' then array(select jsonb_array_elements_text(source->'project_types')) else '{}'::text[] end,
    nullif(source->>'inventory_url', ''), nullif(source->>'project_logo_url', ''), 'pending', 'draft', 'draft', false
  ) returning id into new_project_id;
  for phase_payload in select value from jsonb_array_elements(coalesce(source->'phases', '[]'::jsonb)) loop
    -- Project creation creates one default phase through the existing trigger.
    -- Reuse it when a project template includes that phase so cloning remains
    -- idempotent with the phase hierarchy contract.
    if coalesce((phase_payload->>'is_default')::boolean, false) then
      select id into new_phase_id
      from public.developer_project_phases
      where project_id = new_project_id and is_default = true and archived_at is null
      order by phase_order, created_at
      limit 1;
      if new_phase_id is null then
        insert into public.developer_project_phases(project_id, name, phase_order, description, hero_media, launch_status, launch_date, is_default, lifecycle_state, approval_status, publication_status)
        values (new_project_id, coalesce(nullif(phase_payload->>'name', ''), 'Phase'), greatest(1, coalesce(nullif(phase_payload->>'phase_order', '')::integer, 1)), nullif(phase_payload->>'description', ''), case when jsonb_typeof(phase_payload->'hero_media') = 'object' then phase_payload->'hero_media' else '{}'::jsonb end, coalesce(nullif(phase_payload->>'launch_status', ''), 'upcoming'), nullif(phase_payload->>'launch_date', '')::date, true, 'draft', 'pending', 'draft') returning id into new_phase_id;
      else
        update public.developer_project_phases
        set name = coalesce(nullif(phase_payload->>'name', ''), name),
            phase_order = greatest(1, coalesce(nullif(phase_payload->>'phase_order', '')::integer, phase_order)),
            description = nullif(phase_payload->>'description', ''),
            hero_media = case when jsonb_typeof(phase_payload->'hero_media') = 'object' then phase_payload->'hero_media' else hero_media end,
            launch_status = coalesce(nullif(phase_payload->>'launch_status', ''), launch_status),
            launch_date = coalesce(nullif(phase_payload->>'launch_date', '')::date, launch_date),
            updated_at = now()
        where id = new_phase_id;
      end if;
    else
      insert into public.developer_project_phases(project_id, name, phase_order, description, hero_media, launch_status, launch_date, is_default, lifecycle_state, approval_status, publication_status)
      values (new_project_id, coalesce(nullif(phase_payload->>'name', ''), 'Phase'), greatest(1, coalesce(nullif(phase_payload->>'phase_order', '')::integer, 1)), nullif(phase_payload->>'description', ''), case when jsonb_typeof(phase_payload->'hero_media') = 'object' then phase_payload->'hero_media' else '{}'::jsonb end, coalesce(nullif(phase_payload->>'launch_status', ''), 'upcoming'), nullif(phase_payload->>'launch_date', '')::date, false, 'draft', 'pending', 'draft') returning id into new_phase_id;
    end if;
    for unit_payload in select value from jsonb_array_elements(coalesce(phase_payload->'unit_types', '[]'::jsonb)) loop
      insert into public.project_unit_types(project_id, phase_id, category, label, min_price, max_price, unit_area_min, unit_area_max, land_area_min, land_area_max, finishing_status, description, archived_at)
      values (new_project_id, new_phase_id, nullif(unit_payload->>'category', ''), coalesce(nullif(unit_payload->>'label', ''), 'Unit type'), greatest(100000, coalesce(nullif(unit_payload->>'min_price', '')::numeric, 100000)), nullif(unit_payload->>'max_price', '')::numeric, nullif(unit_payload->>'unit_area_min', '')::numeric, nullif(unit_payload->>'unit_area_max', '')::numeric, nullif(unit_payload->>'land_area_min', '')::numeric, nullif(unit_payload->>'land_area_max', '')::numeric, nullif(unit_payload->>'finishing_status', ''), nullif(unit_payload->>'description', ''), null) returning id into new_unit_type_id;
      for variant_payload in select value from jsonb_array_elements(coalesce(unit_payload->'variants', '[]'::jsonb)) loop
        insert into public.project_unit_variants(project_unit_type_id, category, label, bedrooms, bathrooms, has_garden, has_roof, finishing_status, delivery_date, min_price, max_price, unit_area_min, unit_area_max, land_area_min, land_area_max, down_payment_percent, installment_years, stock_count, description, amenities)
        values (new_unit_type_id, nullif(variant_payload->>'category', ''), nullif(variant_payload->>'label', ''), nullif(variant_payload->>'bedrooms', '')::integer, nullif(variant_payload->>'bathrooms', '')::integer, (variant_payload->>'has_garden')::boolean, (variant_payload->>'has_roof')::boolean, nullif(variant_payload->>'finishing_status', ''), nullif(variant_payload->>'delivery_date', '')::date, greatest(100000, coalesce(nullif(variant_payload->>'min_price', '')::numeric, 100000)), nullif(variant_payload->>'max_price', '')::numeric, nullif(variant_payload->>'unit_area_min', '')::numeric, nullif(variant_payload->>'unit_area_max', '')::numeric, nullif(variant_payload->>'land_area_min', '')::numeric, nullif(variant_payload->>'land_area_max', '')::numeric, nullif(variant_payload->>'down_payment_percent', '')::numeric, nullif(variant_payload->>'installment_years', '')::numeric, nullif(variant_payload->>'stock_count', '')::integer, nullif(variant_payload->>'description', ''), case when jsonb_typeof(variant_payload->'amenities') = 'array' then array(select jsonb_array_elements_text(variant_payload->'amenities')) else null end);
      end loop;
    end loop;
  end loop;
  perform set_config('app.developer_account_id', p_account_id::text, true);
  insert into public.developer_inventory_activity(developer_id, project_id, entity_type, entity_id, action, actor_account_id, metadata)
  values (p_developer_id, new_project_id, 'project', new_project_id, 'cloned_from_template', p_account_id, jsonb_build_object('template_id', p_template_id));
  return new_project_id;
end;
$$;
revoke all on function public.save_developer_project_template(uuid, uuid, text, text, jsonb, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.clone_developer_project_from_template(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.save_developer_project_template(uuid, uuid, text, text, jsonb, uuid, uuid, uuid) to service_role;
grant execute on function public.clone_developer_project_from_template(uuid, uuid, uuid, text) to service_role;

create or replace function public.restore_developer_inventory_version(
  p_developer_id uuid,
  p_version_id uuid,
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  version_row public.developer_inventory_versions%rowtype;
  project_row public.developer_projects%rowtype;
  phase_row public.developer_project_phases%rowtype;
  unit_type_row public.project_unit_types%rowtype;
  variant_row public.project_unit_variants%rowtype;
  property_row public.properties%rowtype;
  restored boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into version_row from public.developer_inventory_versions where id = p_version_id and developer_id = p_developer_id for update;
  if not found then raise exception 'Inventory version not found or access denied'; end if;
  if version_row.entity_type in ('project', 'phase', 'unit_type', 'unit_variant') and not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_projects') then raise exception 'Project management capability required'; end if;
  if version_row.entity_type = 'property' and not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_inventory') then raise exception 'Inventory management capability required'; end if;
  perform set_config('app.developer_account_id', p_account_id::text, true);
  perform set_config('app.developer_inventory_restore_version', version_row.version::text, true);
  if version_row.entity_type = 'project' then
    select * into project_row from jsonb_populate_record(null::public.developer_projects, version_row.snapshot);
    update public.developer_projects set name = project_row.name, description = project_row.description, hero_media = project_row.hero_media, voice_notes = project_row.voice_notes, video_links = project_row.video_links, amenities = project_row.amenities, location = project_row.location, acres = project_row.acres, footprint = project_row.footprint, maintenance = project_row.maintenance, payment_plans = project_row.payment_plans, payment_plan_templates = project_row.payment_plan_templates, limited_time_offers = project_row.limited_time_offers, launch_status = project_row.launch_status, launch_date = project_row.launch_date, eoi_value_apt = project_row.eoi_value_apt, eoi_value_villa = project_row.eoi_value_villa, ch_fees = project_row.ch_fees, project_types = project_row.project_types, inventory_url = project_row.inventory_url, project_logo_url = project_row.project_logo_url, approval_status = 'pending', lifecycle_state = 'draft', published_at = null, publication_status = 'draft', rejection_reason = null, reviewed_by = null, reviewed_at = null, updated_at = now() where id = version_row.entity_id and developer_id = p_developer_id;
    restored := found;
  elsif version_row.entity_type = 'phase' then
    select * into phase_row from jsonb_populate_record(null::public.developer_project_phases, version_row.snapshot);
    update public.developer_project_phases set name = phase_row.name, phase_order = phase_row.phase_order, description = phase_row.description, hero_media = phase_row.hero_media, launch_status = phase_row.launch_status, launch_date = phase_row.launch_date, approval_status = 'pending', lifecycle_state = 'draft', published_at = null, publication_status = 'draft', updated_at = now() where id = version_row.entity_id and project_id in (select id from public.developer_projects where developer_id = p_developer_id);
    restored := found;
  elsif version_row.entity_type = 'unit_type' then
    select * into unit_type_row from jsonb_populate_record(null::public.project_unit_types, version_row.snapshot);
    update public.project_unit_types set category = unit_type_row.category, label = unit_type_row.label, min_price = unit_type_row.min_price, max_price = unit_type_row.max_price, unit_area_min = unit_type_row.unit_area_min, unit_area_max = unit_type_row.unit_area_max, land_area_min = unit_type_row.land_area_min, land_area_max = unit_type_row.land_area_max, finishing_status = unit_type_row.finishing_status, description = unit_type_row.description, hero_image_url = unit_type_row.hero_image_url, updated_at = now() where id = version_row.entity_id and project_id in (select id from public.developer_projects where developer_id = p_developer_id);
    restored := found;
  elsif version_row.entity_type = 'unit_variant' then
    select * into variant_row from jsonb_populate_record(null::public.project_unit_variants, version_row.snapshot);
    update public.project_unit_variants set category = variant_row.category, label = variant_row.label, bedrooms = variant_row.bedrooms, bathrooms = variant_row.bathrooms, has_garden = variant_row.has_garden, has_roof = variant_row.has_roof, garden_area_sqm = variant_row.garden_area_sqm, roof_area_sqm = variant_row.roof_area_sqm, finishing_status = variant_row.finishing_status, delivery_date = variant_row.delivery_date, min_price = variant_row.min_price, max_price = variant_row.max_price, unit_area_min = variant_row.unit_area_min, unit_area_max = variant_row.unit_area_max, land_area_min = variant_row.land_area_min, land_area_max = variant_row.land_area_max, layout_options = variant_row.layout_options, down_payment_percent = variant_row.down_payment_percent, installment_years = variant_row.installment_years, stock_count = variant_row.stock_count, description = variant_row.description, amenities = variant_row.amenities, updated_at = now() where id = version_row.entity_id and project_unit_type_id in (select unit_type.id from public.project_unit_types unit_type join public.developer_projects project on project.id = unit_type.project_id where project.developer_id = p_developer_id);
    restored := found;
  elsif version_row.entity_type = 'property' then
    select * into property_row from jsonb_populate_record(null::public.properties, version_row.snapshot);
    update public.properties set property_name = property_row.property_name, specific_location = property_row.specific_location, property_type = property_row.property_type, bedrooms = property_row.bedrooms, bathrooms = property_row.bathrooms, unit_area = property_row.unit_area, price = property_row.price, down_payment_percentage = property_row.down_payment_percentage, monthly_installment = property_row.monthly_installment, installment_years = property_row.installment_years, finishing_status = property_row.finishing_status, delivery_date = property_row.delivery_date, amenities = property_row.amenities, description = property_row.description, photos = property_row.photos, cover_photo_url = property_row.cover_photo_url, floor_plan_url = property_row.floor_plan_url, video_tour_url = property_row.video_tour_url, inventory_code = property_row.inventory_code, building = property_row.building, floor_number = property_row.floor_number, unit_number = property_row.unit_number, inventory_notes = property_row.inventory_notes, price_effective_from = now(), approval_status = 'pending', is_active = false, published_at = null, publication_status = 'draft', rejection_reason = null, reviewed_by = null, reviewed_at = null, updated_at = now() where id = version_row.entity_id and developer_id = p_developer_id and listed_by_agent_id is null;
    restored := found;
  end if;
  if not restored then raise exception 'Inventory entity not found or access denied'; end if;
  insert into public.developer_inventory_activity(developer_id, project_id, phase_id, entity_type, entity_id, action, actor_account_id, metadata)
  values (p_developer_id, case when version_row.entity_type = 'project' then version_row.entity_id else null end, case when version_row.entity_type = 'phase' then version_row.entity_id else null end, version_row.entity_type, version_row.entity_id, 'restored_version', p_account_id, jsonb_build_object('version_id', p_version_id, 'version', version_row.version));
  return jsonb_build_object('restored', true, 'version_id', p_version_id, 'entity_type', version_row.entity_type, 'entity_id', version_row.entity_id, 'version', version_row.version);
end;
$$;
revoke all on function public.restore_developer_inventory_version(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_developer_inventory_version(uuid, uuid, uuid) to service_role;

create or replace function public.record_developer_publication_feedback(
  p_developer_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_admin_id uuid,
  p_field_name text,
  p_message text
)
returns public.developer_publication_feedback
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  feedback_row public.developer_publication_feedback%rowtype;
  entity_developer_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (select 1 from public.admins admin where admin.id = p_admin_id and admin.is_active = true) then raise exception 'Active admin required'; end if;
  if p_entity_type not in ('project', 'phase', 'unit_type', 'unit_variant', 'property') then raise exception 'Invalid feedback entity'; end if;
  if char_length(btrim(coalesce(p_message, ''))) < 1 then raise exception 'Feedback message is required'; end if;
  if p_entity_type = 'project' then select developer_id into entity_developer_id from public.developer_projects where id = p_entity_id;
  elsif p_entity_type = 'phase' then select project.developer_id into entity_developer_id from public.developer_project_phases phase join public.developer_projects project on project.id = phase.project_id where phase.id = p_entity_id;
  elsif p_entity_type = 'unit_type' then select project.developer_id into entity_developer_id from public.project_unit_types unit_type join public.developer_projects project on project.id = unit_type.project_id where unit_type.id = p_entity_id;
  elsif p_entity_type = 'unit_variant' then select project.developer_id into entity_developer_id from public.project_unit_variants variant join public.project_unit_types unit_type on unit_type.id = variant.project_unit_type_id join public.developer_projects project on project.id = unit_type.project_id where variant.id = p_entity_id;
  else select developer_id into entity_developer_id from public.properties where id = p_entity_id;
  end if;
  if entity_developer_id is null or entity_developer_id <> p_developer_id then raise exception 'Feedback entity not found or access denied'; end if;
  insert into public.developer_publication_feedback(developer_id, entity_type, entity_id, field_name, message, source, author_admin_id)
  values (p_developer_id, p_entity_type, p_entity_id, nullif(btrim(p_field_name), ''), btrim(p_message), 'admin', p_admin_id)
  returning * into feedback_row;
  if p_entity_type = 'project' then
    update public.developer_projects set approval_status = 'rejected', lifecycle_state = 'draft', published_at = null, rejection_reason = btrim(p_message), publication_status = 'changes_requested', changes_requested_at = now(), publication_feedback = jsonb_build_object('latest_feedback_id', feedback_row.id), updated_at = now() where id = p_entity_id;
  elsif p_entity_type = 'property' then
    update public.properties set approval_status = 'rejected', is_active = false, published_at = null, rejection_reason = btrim(p_message), publication_status = 'changes_requested', changes_requested_at = now(), publication_feedback = jsonb_build_object('latest_feedback_id', feedback_row.id), updated_at = now() where id = p_entity_id;
  elsif p_entity_type = 'phase' then
    update public.developer_project_phases set approval_status = 'rejected', lifecycle_state = 'draft', published_at = null, publication_status = 'changes_requested', changes_requested_at = now(), publication_feedback = jsonb_build_object('latest_feedback_id', feedback_row.id), updated_at = now() where id = p_entity_id;
  end if;
  insert into public.developer_inventory_activity(developer_id, entity_type, entity_id, action, actor_admin_id, metadata)
  values (p_developer_id, p_entity_type, p_entity_id, 'changes_requested', p_admin_id, jsonb_build_object('feedback_id', feedback_row.id, 'field_name', p_field_name));
  return feedback_row;
end;
$$;
revoke all on function public.record_developer_publication_feedback(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_developer_publication_feedback(uuid, text, uuid, uuid, text, text) to service_role;

create or replace function public.resolve_developer_publication_feedback(
  p_developer_id uuid,
  p_feedback_id uuid,
  p_account_id uuid
)
returns public.developer_publication_feedback
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  feedback_row public.developer_publication_feedback%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_projects') then raise exception 'Project management capability required'; end if;
  update public.developer_publication_feedback
  set status = 'resolved', resolved_at = now(), resolved_by_account_id = p_account_id
  where id = p_feedback_id and developer_id = p_developer_id and status = 'open'
  returning * into feedback_row;
  if not found then raise exception 'Feedback not found or already resolved'; end if;
  insert into public.developer_inventory_activity(developer_id, entity_type, entity_id, action, actor_account_id, metadata)
  values (p_developer_id, feedback_row.entity_type, feedback_row.entity_id, 'feedback_resolved', p_account_id, jsonb_build_object('feedback_id', p_feedback_id));
  return feedback_row;
end;
$$;
revoke all on function public.resolve_developer_publication_feedback(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_developer_publication_feedback(uuid, uuid, uuid) to service_role;

-- A saved filter is data, not executable SQL. Upsert is scoped to the active
-- developer account and returns the saved record for immediate UI feedback.
create or replace function public.save_developer_inventory_filter(
  p_developer_id uuid,
  p_account_id uuid,
  p_name text,
  p_filter jsonb
)
returns public.developer_inventory_saved_filters
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  filter_row public.developer_inventory_saved_filters%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_inventory') then raise exception 'Inventory management capability required'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 or jsonb_typeof(p_filter) <> 'object' then raise exception 'A filter name and object are required'; end if;
  insert into public.developer_inventory_saved_filters(developer_id, account_id, name, filter)
  values (p_developer_id, p_account_id, btrim(p_name), p_filter)
  on conflict (developer_id, account_id, (lower(btrim(name)))) where archived_at is null
  do update set filter = excluded.filter, updated_at = now(), archived_at = null
  returning * into filter_row;
  return filter_row;
end;
$$;
revoke all on function public.save_developer_inventory_filter(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_developer_inventory_filter(uuid, uuid, text, jsonb) to service_role;

-- Existing developer-created inventory is already represented in properties;
-- expose its availability in the mobile-safe row predicate only when the row
-- remains approved/active. No hold or feedback table is publicly readable.
drop policy if exists properties_developer_inventory_public_visibility on public.properties;
create policy properties_developer_inventory_public_visibility
on public.properties
as restrictive
for select
to public
using (
  listed_by_agent_id is not null
  or availability_state in ('available', 'released')
  or exists (select 1 from public.admins admin where admin.id = (select auth.uid()) and admin.is_active = true)
  or exists (select 1 from public.developer_accounts account where account.auth_user_id = (select auth.uid()) and account.developer_id = properties.developer_id and account.status = 'active')
);

commit;
