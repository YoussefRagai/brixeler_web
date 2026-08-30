begin;

-- A phase is the release-level boundary between a project brief and the
-- inventory an agent can sell.  Existing projects receive a published
-- compatibility phase below; new phases start in review until the project is
-- approved again through the existing moderation contract.
create table if not exists public.developer_project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.developer_projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  phase_order integer not null check (phase_order > 0),
  description text,
  hero_media jsonb not null default '{}'::jsonb check (jsonb_typeof(hero_media) = 'object'),
  launch_status text not null default 'upcoming'
    check (launch_status in ('live', 'new_launch', 'upcoming')),
  launch_date date,
  is_default boolean not null default false,
  lifecycle_state text not null default 'draft'
    check (lifecycle_state in ('draft', 'published', 'archived')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  published_at timestamptz,
  archived_at timestamptz,
  archived_by_account_id uuid references public.developer_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, phase_order)
);

create unique index if not exists developer_project_phases_name_idx
  on public.developer_project_phases(project_id, lower(name))
  where archived_at is null;
create unique index if not exists developer_project_phases_default_idx
  on public.developer_project_phases(project_id)
  where is_default = true;
create index if not exists developer_project_phases_project_order_idx
  on public.developer_project_phases(project_id, phase_order, updated_at desc);
create index if not exists developer_project_phases_publication_idx
  on public.developer_project_phases(project_id, lifecycle_state, approval_status, published_at)
  where archived_at is null;

alter table public.project_unit_types
  add column if not exists phase_id uuid;
alter table public.properties
  add column if not exists phase_id uuid;
alter table public.developer_projects
  add column if not exists project_logo_url text;

alter table public.developer_projects
  drop constraint if exists developer_projects_project_logo_url_check;
alter table public.developer_projects
  add constraint developer_projects_project_logo_url_check
  check (
    project_logo_url is null
    or (char_length(project_logo_url) <= 2048 and project_logo_url ~* '^https?://')
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_unit_types_phase_id_fkey'
      and conrelid = 'public.project_unit_types'::regclass
  ) then
    alter table public.project_unit_types
      add constraint project_unit_types_phase_id_fkey
      foreign key (phase_id) references public.developer_project_phases(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'properties_phase_id_fkey'
      and conrelid = 'public.properties'::regclass
  ) then
    alter table public.properties
      add constraint properties_phase_id_fkey
      foreign key (phase_id) references public.developer_project_phases(id) on delete restrict;
  end if;
end;
$$;

-- Keep all existing project inventory addressable without changing its
-- publication state.  A published project gets a published compatibility
-- phase; drafts remain hidden until the normal review boundary is crossed.
insert into public.developer_project_phases(
  project_id, name, phase_order, description, is_default,
  lifecycle_state, approval_status, published_at
)
select
  project.id,
  'Phase 1',
  1,
  'Compatibility release for existing project inventory.',
  true,
  case
    when project.approval_status = 'approved'
      and project.lifecycle_state = 'published'
      and project.published_at is not null
    then 'published'
    else 'draft'
  end,
  case when project.approval_status = 'approved' then 'approved' else 'pending' end,
  case
    when project.approval_status = 'approved'
      and project.lifecycle_state = 'published'
    then project.published_at
    else null
  end
from public.developer_projects project
where not exists (
  select 1 from public.developer_project_phases phase
  where phase.project_id = project.id
    and phase.is_default = true
);

update public.project_unit_types unit_type
set phase_id = phase.id
from public.developer_project_phases phase
where phase.project_id = unit_type.project_id
  and phase.is_default = true
  and unit_type.phase_id is null;

update public.properties property
set phase_id = phase.id
from public.developer_project_phases phase
where phase.project_id = property.project_id
  and phase.is_default = true
  and property.phase_id is null;

-- The legacy key was project-wide.  Once inventory is phase-scoped, the same
-- commercial type label may be reused in a later release while active labels
-- remain unique within that release.
alter table public.project_unit_types
  drop constraint if exists project_unit_types_project_id_label_key;
create unique index if not exists project_unit_types_active_phase_label_idx
  on public.project_unit_types(project_id, phase_id, lower(btrim(label)))
  where archived_at is null;

alter table public.project_unit_types
  alter column phase_id set not null;

-- New projects should be usable immediately without a separate migration step.
-- The default phase still inherits the project's approval/publication gate.
create or replace function public.create_default_developer_project_phase()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.developer_project_phases(
    project_id, name, phase_order, description, is_default,
    lifecycle_state, approval_status, published_at
  ) values (
    new.id,
    'Phase 1',
    1,
    'Default release phase for this project.',
    true,
    case when new.approval_status = 'approved' and new.lifecycle_state = 'published' then 'published' else 'draft' end,
    case when new.approval_status = 'approved' then 'approved' else 'pending' end,
    case when new.approval_status = 'approved' and new.lifecycle_state = 'published' then new.published_at else null end
  )
  on conflict (project_id, phase_order) do nothing;
  return new;
end;
$$;

drop trigger if exists developer_projects_create_default_phase on public.developer_projects;
create trigger developer_projects_create_default_phase
after insert on public.developer_projects
for each row execute function public.create_default_developer_project_phase();

create or replace function public.developer_project_phase_is_public(p_phase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.developer_project_phases phase
    join public.developer_projects project on project.id = phase.project_id
    join public.developers developer on developer.id = project.developer_id
    where phase.id = p_phase_id
      and phase.archived_at is null
      and phase.approval_status = 'approved'
      and phase.lifecycle_state = 'published'
      and phase.published_at is not null
      and project.approval_status = 'approved'
      and project.lifecycle_state = 'published'
      and project.published_at is not null
      and coalesce(project.is_demo, false) = false
      and developer.is_active = true
      and developer.lifecycle_state = 'published'
      and developer.published_at is not null
      and coalesce(developer.is_demo, false) = false
      and exists (
        select 1
        from public.project_unit_types unit_type
        where unit_type.phase_id = phase.id
          and unit_type.archived_at is null
      )
  );
$$;

-- This function is safe to expose as a boolean predicate and is needed by
-- public RLS policies; it never returns tenant data.
grant execute on function public.developer_project_phase_is_public(uuid) to public, anon, authenticated, service_role;

-- A phase id is never trusted from the browser.  The trigger proves that the
-- phase belongs to the same project and is not archived before any service
-- mediated write reaches inventory or resale rows.
create or replace function public.guard_project_phase_scope()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  phase_project_id uuid;
begin
  if tg_table_name = 'properties' and new.project_id is null then
    new.phase_id := null;
    return new;
  end if;

  if new.phase_id is null then
    if tg_table_name = 'project_unit_types'
       or (tg_table_name = 'properties' and new.developer_id is not null and new.listed_by_agent_id is null) then
      raise exception 'A release phase is required for developer project inventory';
    end if;
    return new;
  end if;

  select project_id into phase_project_id
  from public.developer_project_phases
  where id = new.phase_id;
  if phase_project_id is null then
    raise exception 'Release phase not found';
  end if;
  if phase_project_id <> new.project_id then
    raise exception 'Inventory phase must belong to the selected project';
  end if;
  if exists (
    select 1 from public.developer_project_phases
    where id = new.phase_id and archived_at is not null
  ) then
    raise exception 'Archived release phases cannot receive inventory';
  end if;
  return new;
end;
$$;

drop trigger if exists project_unit_types_phase_scope on public.project_unit_types;
create trigger project_unit_types_phase_scope
before insert or update of project_id, phase_id on public.project_unit_types
for each row execute function public.guard_project_phase_scope();

drop trigger if exists properties_phase_scope on public.properties;
create trigger properties_phase_scope
before insert or update of project_id, developer_id, listed_by_agent_id, phase_id on public.properties
for each row execute function public.guard_project_phase_scope();

create or replace function public.touch_developer_project_phase_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists developer_project_phases_set_updated_at on public.developer_project_phases;
create trigger developer_project_phases_set_updated_at
before update on public.developer_project_phases
for each row execute function public.touch_developer_project_phase_updated_at();

-- Project review remains the publication authority.  A project edit or a new
-- phase sends all active phases back to draft; admin approval republishes them
-- together with the project.  This prevents a phase from bypassing the
-- existing project moderation/publication boundary.
create or replace function public.sync_developer_project_phase_publication()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.approval_status = 'approved' and new.lifecycle_state = 'published' and new.published_at is not null then
    update public.developer_project_phases as phase
    set approval_status = 'approved',
        lifecycle_state = 'published',
        published_at = coalesce(published_at, new.published_at, now()),
        updated_at = now()
    where phase.project_id = new.id and phase.archived_at is null
      and exists (
        select 1
        from public.project_unit_types unit_type
        where unit_type.phase_id = phase.id
          and unit_type.archived_at is null
      );
    update public.developer_project_phases as phase
    set approval_status = 'pending',
        lifecycle_state = 'draft',
        published_at = null,
        updated_at = now()
    where phase.project_id = new.id and phase.archived_at is null
      and not exists (
        select 1
        from public.project_unit_types unit_type
        where unit_type.phase_id = phase.id
          and unit_type.archived_at is null
      );
  else
    update public.developer_project_phases
    set approval_status = 'pending',
        lifecycle_state = 'draft',
        published_at = null,
        updated_at = now()
    where project_id = new.id and archived_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists developer_projects_phase_publication_sync on public.developer_projects;
create trigger developer_projects_phase_publication_sync
after update of approval_status, lifecycle_state, published_at on public.developer_projects
for each row execute function public.sync_developer_project_phase_publication();

revoke all on function public.guard_project_phase_scope() from public, anon, authenticated;
revoke all on function public.touch_developer_project_phase_updated_at() from public, anon, authenticated;
revoke all on function public.sync_developer_project_phase_publication() from public, anon, authenticated;

-- Phase reads are public only when both the phase and its parent project have
-- crossed the existing reviewed/published boundary.  Developer workspace
-- reads continue through the service-role data-access layer.
alter table public.developer_project_phases enable row level security;
alter table public.developer_project_phases force row level security;
drop policy if exists developer_project_phases_mobile_read on public.developer_project_phases;
create policy developer_project_phases_mobile_read
on public.developer_project_phases
for select
to public
using (public.developer_project_phase_is_public(id));

revoke all on public.developer_project_phases from public, anon, authenticated;
grant select on public.developer_project_phases to anon, authenticated;
grant select, insert, update, delete on public.developer_project_phases to service_role;

-- Public inventory must carry the same phase gate.  Existing owner/admin
-- exceptions remain available to authenticated operational readers.
drop policy if exists project_unit_types_phase_visibility on public.project_unit_types;
create policy project_unit_types_phase_visibility
on public.project_unit_types
as restrictive
for select
to public
using (
  public.developer_project_phase_is_public(phase_id)
  or exists (
    select 1
    from public.developer_projects project
    join public.developer_accounts account on account.developer_id = project.developer_id
    where project.id = project_unit_types.project_id
      and account.auth_user_id = (select auth.uid())
      and account.status = 'active'
  )
  or exists (
    select 1 from public.admins admin
    where admin.id = (select auth.uid()) and admin.is_active = true
  )
);

drop policy if exists project_unit_variants_phase_visibility on public.project_unit_variants;
create policy project_unit_variants_phase_visibility
on public.project_unit_variants
as restrictive
for select
to public
using (
  exists (
    select 1
    from public.project_unit_types unit_type
    where unit_type.id = project_unit_variants.project_unit_type_id
      and (
        public.developer_project_phase_is_public(unit_type.phase_id)
        or exists (
          select 1
          from public.developer_projects project
          join public.developer_accounts account on account.developer_id = project.developer_id
          where project.id = unit_type.project_id
            and account.auth_user_id = (select auth.uid())
            and account.status = 'active'
        )
        or exists (
          select 1 from public.admins admin
          where admin.id = (select auth.uid()) and admin.is_active = true
        )
      )
  )
);

drop policy if exists properties_phase_visibility on public.properties;
create policy properties_phase_visibility
on public.properties
as restrictive
for select
to public
using (
  phase_id is null
  or public.developer_project_phase_is_public(phase_id)
  or listed_by_agent_id = (select auth.uid())
  or exists (
    select 1 from public.admins admin
    where admin.id = (select auth.uid()) and admin.is_active = true
  )
);

-- Phase publication checks are intentionally small and deterministic.  The
-- existing project publication check remains the project-level authority.
create or replace function public.developer_project_phase_publication_check(p_phase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  phase_row record;
  active_unit_count integer := 0;
  issues text[] := '{}'::text[];
begin
  select phase.*, project.approval_status as project_approval_status,
         project.lifecycle_state as project_lifecycle_state,
         project.published_at as project_published_at
  into phase_row
  from public.developer_project_phases phase
  join public.developer_projects project on project.id = phase.project_id
  where phase.id = p_phase_id;
  if not found then
    return jsonb_build_object('ready', false, 'issues', jsonb_build_array('Release phase not found'));
  end if;
  if nullif(btrim(coalesce(phase_row.name, '')), '') is null then
    issues := array_append(issues, 'Phase name is required');
  end if;
  if phase_row.archived_at is not null then
    issues := array_append(issues, 'Archived phases cannot be published');
  end if;
  if phase_row.project_approval_status <> 'approved'
     or phase_row.project_lifecycle_state <> 'published'
     or phase_row.project_published_at is null then
    issues := array_append(issues, 'Parent project must be approved and published');
  end if;
  select count(*) into active_unit_count
  from public.project_unit_types unit_type
  where unit_type.phase_id = p_phase_id and unit_type.archived_at is null;
  if active_unit_count = 0 then
    issues := array_append(issues, 'Add at least one active unit type to this phase');
  end if;
  return jsonb_build_object(
    'ready', cardinality(issues) = 0,
    'issues', to_jsonb(issues),
    'active_unit_count', active_unit_count
  );
end;
$$;

revoke all on function public.developer_project_phase_publication_check(uuid) from public, anon, authenticated;
grant execute on function public.developer_project_phase_publication_check(uuid) to service_role;

-- Only the trusted server data-access layer can create or change phases. The
-- account id is explicit so a service-role call still proves tenant and
-- membership ownership instead of trusting a browser-supplied developer id.
create or replace function public.create_developer_project_phase(
  p_developer_id uuid,
  p_project_id uuid,
  p_account_id uuid,
  p_name text,
  p_description text default null,
  p_phase_order integer default null,
  p_launch_status text default 'upcoming',
  p_launch_date date default null,
  p_hero_media jsonb default '{}'::jsonb
)
returns public.developer_project_phases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  phase_row public.developer_project_phases%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_status text := case when p_launch_status in ('live', 'new_launch', 'upcoming') then p_launch_status else null end;
  next_order integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if char_length(normalized_name) not between 1 and 160 then raise exception 'Phase name must contain between 1 and 160 characters'; end if;
  if normalized_status is null then raise exception 'Invalid phase launch status'; end if;
  if p_hero_media is null or jsonb_typeof(p_hero_media) <> 'object' then raise exception 'Phase media must be a JSON object'; end if;
  if not exists (
    select 1 from public.developer_accounts account
    where account.id = p_account_id and account.developer_id = p_developer_id and account.status = 'active'
      and lower(coalesce(account.role, '')) in (
        'developer_super_admin', 'developer_admin', 'super_admin', 'owner', 'admin',
        'project_manager', 'project_admin', 'manager', 'member'
      )
  ) then raise exception 'Active developer membership required'; end if;
  perform 1
  from public.developer_projects
  where id = p_project_id and developer_id = p_developer_id
  for update;
  if not found then raise exception 'Project not found or access denied'; end if;
  if p_phase_order is not null and p_phase_order <= 0 then raise exception 'Phase order must be greater than zero'; end if;
  select coalesce(max(phase_order), 0) + 1 into next_order
  from public.developer_project_phases where project_id = p_project_id;
  next_order := coalesce(p_phase_order, next_order);
  if exists (
    select 1 from public.developer_project_phases phase
    where phase.project_id = p_project_id and phase.archived_at is null and lower(phase.name) = lower(normalized_name)
  ) then raise exception 'A phase with this name already exists for the project'; end if;

  insert into public.developer_project_phases(
    project_id, name, phase_order, description, hero_media, launch_status,
    launch_date, is_default, lifecycle_state, approval_status, published_at
  ) values (
    p_project_id, normalized_name, next_order, nullif(btrim(p_description), ''), p_hero_media,
    normalized_status, p_launch_date, false, 'draft', 'pending', null
  ) returning * into phase_row;

  update public.developer_projects
  set approval_status = 'pending', rejection_reason = null, reviewed_by = null,
      reviewed_at = null, lifecycle_state = 'draft', published_at = null, updated_at = now()
  where id = p_project_id;
  return phase_row;
end;
$$;

create or replace function public.update_developer_project_phase(
  p_developer_id uuid,
  p_phase_id uuid,
  p_account_id uuid,
  p_name text,
  p_description text default null,
  p_phase_order integer default null,
  p_launch_status text default 'upcoming',
  p_launch_date date default null,
  p_hero_media jsonb default '{}'::jsonb
)
returns public.developer_project_phases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  phase_row public.developer_project_phases%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_status text := case when p_launch_status in ('live', 'new_launch', 'upcoming') then p_launch_status else null end;
  next_order integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if char_length(normalized_name) not between 1 and 160 then raise exception 'Phase name must contain between 1 and 160 characters'; end if;
  if normalized_status is null then raise exception 'Invalid phase launch status'; end if;
  if p_hero_media is null or jsonb_typeof(p_hero_media) <> 'object' then raise exception 'Phase media must be a JSON object'; end if;
  if not exists (
    select 1 from public.developer_accounts account
    where account.id = p_account_id and account.developer_id = p_developer_id and account.status = 'active'
      and lower(coalesce(account.role, '')) in (
        'developer_super_admin', 'developer_admin', 'super_admin', 'owner', 'admin',
        'project_manager', 'project_admin', 'manager', 'member'
      )
  ) then raise exception 'Active developer membership required'; end if;
  select phase.* into phase_row
  from public.developer_project_phases phase
  join public.developer_projects project on project.id = phase.project_id
  where phase.id = p_phase_id and project.developer_id = p_developer_id
  for update;
  if not found then raise exception 'Phase not found or access denied'; end if;
  if phase_row.archived_at is not null then raise exception 'Restore the phase before editing it'; end if;
  if p_phase_order is not null and p_phase_order <= 0 then raise exception 'Phase order must be greater than zero'; end if;
  next_order := coalesce(p_phase_order, phase_row.phase_order);
  if exists (
    select 1 from public.developer_project_phases phase
    where phase.project_id = phase_row.project_id and phase.id <> p_phase_id
      and phase.archived_at is null and lower(phase.name) = lower(normalized_name)
  ) then raise exception 'A phase with this name already exists for the project'; end if;

  update public.developer_project_phases
  set name = normalized_name,
      description = nullif(btrim(p_description), ''),
      phase_order = next_order,
      hero_media = p_hero_media,
      launch_status = normalized_status,
      launch_date = p_launch_date,
      approval_status = 'pending',
      lifecycle_state = 'draft',
      published_at = null,
      updated_at = now()
  where id = p_phase_id
  returning * into phase_row;

  update public.developer_projects
  set approval_status = 'pending', rejection_reason = null, reviewed_by = null,
      reviewed_at = null, lifecycle_state = 'draft', published_at = null, updated_at = now()
  where id = phase_row.project_id;
  return phase_row;
end;
$$;

create or replace function public.archive_developer_project_phase(
  p_developer_id uuid,
  p_phase_id uuid,
  p_account_id uuid
)
returns public.developer_project_phases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  phase_row public.developer_project_phases%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (
    select 1 from public.developer_accounts account
    where account.id = p_account_id and account.developer_id = p_developer_id and account.status = 'active'
      and lower(coalesce(account.role, '')) in (
        'developer_super_admin', 'developer_admin', 'super_admin', 'owner', 'admin',
        'project_manager', 'project_admin', 'manager', 'member'
      )
  ) then raise exception 'Active developer membership required'; end if;
  select phase.* into phase_row
  from public.developer_project_phases phase
  join public.developer_projects project on project.id = phase.project_id
  where phase.id = p_phase_id and project.developer_id = p_developer_id
  for update;
  if not found then raise exception 'Phase not found or access denied'; end if;
  if phase_row.is_default then raise exception 'The default phase cannot be archived'; end if;
  if phase_row.archived_at is not null then raise exception 'Phase is already archived'; end if;
  update public.developer_project_phases
  set archived_at = now(), archived_by_account_id = p_account_id,
      lifecycle_state = 'archived', published_at = null, updated_at = now()
  where id = p_phase_id
  returning * into phase_row;
  update public.developer_projects
  set approval_status = 'pending', rejection_reason = null, reviewed_by = null,
      reviewed_at = null, lifecycle_state = 'draft', published_at = null, updated_at = now()
  where id = phase_row.project_id;
  return phase_row;
end;
$$;

create or replace function public.restore_developer_project_phase(
  p_developer_id uuid,
  p_phase_id uuid,
  p_account_id uuid
)
returns public.developer_project_phases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  phase_row public.developer_project_phases%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (
    select 1 from public.developer_accounts account
    where account.id = p_account_id and account.developer_id = p_developer_id and account.status = 'active'
      and lower(coalesce(account.role, '')) in (
        'developer_super_admin', 'developer_admin', 'super_admin', 'owner', 'admin',
        'project_manager', 'project_admin', 'manager', 'member'
      )
  ) then raise exception 'Active developer membership required'; end if;
  select phase.* into phase_row
  from public.developer_project_phases phase
  join public.developer_projects project on project.id = phase.project_id
  where phase.id = p_phase_id and project.developer_id = p_developer_id
  for update;
  if not found then raise exception 'Phase not found or access denied'; end if;
  if phase_row.archived_at is null then raise exception 'Phase is already active'; end if;
  update public.developer_project_phases
  set archived_at = null, archived_by_account_id = null,
      approval_status = 'pending', lifecycle_state = 'draft', published_at = null, updated_at = now()
  where id = p_phase_id
  returning * into phase_row;
  update public.developer_projects
  set approval_status = 'pending', rejection_reason = null, reviewed_by = null,
      reviewed_at = null, lifecycle_state = 'draft', published_at = null, updated_at = now()
  where id = phase_row.project_id;
  return phase_row;
end;
$$;

-- Excel imports are a single tenant-checked transaction.  Every variant is
-- validated before the type is inserted, so a malformed row cannot leave a
-- partially imported release in the workspace.
create or replace function public.import_developer_project_inventory(
  p_developer_id uuid,
  p_project_id uuid,
  p_phase_id uuid,
  p_account_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  unit_type_id uuid;
  variant jsonb;
  payload_name text := btrim(coalesce(p_payload->>'baseType', ''));
  payload_category text := nullif(btrim(coalesce(p_payload->>'category', '')), '');
  payload_finishing text := nullif(btrim(coalesce(p_payload->>'finishingStatus', '')), '');
  payload_description text := nullif(btrim(coalesce(p_payload->>'description', '')), '');
  variant_price numeric;
  variant_max_price numeric;
  variant_area_min numeric;
  variant_area_max numeric;
  variant_bedrooms integer;
  variant_bathrooms integer;
  variant_down_payment numeric;
  variant_installment_years numeric;
  variant_stock_count integer;
  type_min_price numeric;
  type_max_price numeric;
  type_area_min numeric;
  type_area_max numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Import payload must be a JSON object'; end if;
  if char_length(payload_name) not between 1 and 160 then raise exception 'Imported type name must contain between 1 and 160 characters'; end if;
  if jsonb_typeof(p_payload->'variants') <> 'array' or jsonb_array_length(p_payload->'variants') = 0 then
    raise exception 'Import must contain at least one variant';
  end if;
  if not exists (
    select 1 from public.developer_accounts account
    where account.id = p_account_id and account.developer_id = p_developer_id and account.status = 'active'
  ) then raise exception 'Active developer membership required'; end if;
  perform 1
  from public.developer_projects
  where id = p_project_id and developer_id = p_developer_id
  for update;
  if not found then raise exception 'Project not found or access denied'; end if;
  perform 1
  from public.developer_project_phases phase
  where phase.id = p_phase_id and phase.project_id = p_project_id
    and phase.archived_at is null
  for update;
  if not found then raise exception 'Release phase not found or archived'; end if;

  for variant in select value from jsonb_array_elements(p_payload->'variants') loop
    if jsonb_typeof(variant) <> 'object' then raise exception 'Every imported variant must be an object'; end if;
    if (variant ? 'hasGarden') and jsonb_typeof(variant->'hasGarden') not in ('boolean', 'null') then raise exception 'Imported garden flags must be boolean'; end if;
    if (variant ? 'hasRoof') and jsonb_typeof(variant->'hasRoof') not in ('boolean', 'null') then raise exception 'Imported roof flags must be boolean'; end if;
    if (variant ? 'amenities') and jsonb_typeof(variant->'amenities') not in ('array', 'null') then raise exception 'Imported amenities must be an array'; end if;
    if nullif(btrim(variant->>'price'), '') is null or variant->>'price' !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Every imported variant needs a positive numeric price';
    end if;
    variant_price := (variant->>'price')::numeric;
    if variant_price <= 0 then raise exception 'Every imported variant needs a positive numeric price'; end if;
    if type_min_price is null or variant_price < type_min_price then type_min_price := variant_price; end if;
    if type_max_price is null or variant_price > type_max_price then type_max_price := variant_price; end if;

    variant_max_price := null;
    if nullif(btrim(variant->>'maxPrice'), '') is not null then
      if variant->>'maxPrice' !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Imported maximum prices must be numeric'; end if;
      variant_max_price := (variant->>'maxPrice')::numeric;
      if variant_max_price < variant_price then raise exception 'Imported maximum price cannot be below minimum price'; end if;
    end if;

    variant_area_min := null;
    if nullif(btrim(variant->>'areaMin'), '') is not null then
      if variant->>'areaMin' !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Imported minimum areas must be numeric'; end if;
      variant_area_min := (variant->>'areaMin')::numeric;
      if variant_area_min < 0 then raise exception 'Imported minimum areas must be zero or more'; end if;
    end if;
    variant_area_max := null;
    if nullif(btrim(variant->>'areaMax'), '') is not null then
      if variant->>'areaMax' !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Imported maximum areas must be numeric'; end if;
      variant_area_max := (variant->>'areaMax')::numeric;
      if variant_area_max < coalesce(variant_area_min, 0) then raise exception 'Imported maximum area cannot be below minimum area'; end if;
    end if;
    if variant_area_min is not null and (type_area_min is null or variant_area_min < type_area_min) then type_area_min := variant_area_min; end if;
    if coalesce(variant_area_max, variant_area_min) is not null and (type_area_max is null or coalesce(variant_area_max, variant_area_min) > type_area_max) then type_area_max := coalesce(variant_area_max, variant_area_min); end if;

    variant_bedrooms := null;
    if nullif(btrim(variant->>'bedrooms'), '') is not null then
      if variant->>'bedrooms' !~ '^[0-9]+$' then raise exception 'Imported bedrooms must be whole numbers'; end if;
      variant_bedrooms := (variant->>'bedrooms')::integer;
    end if;
    variant_bathrooms := null;
    if nullif(btrim(variant->>'bathrooms'), '') is not null then
      if variant->>'bathrooms' !~ '^[0-9]+$' then raise exception 'Imported bathrooms must be whole numbers'; end if;
      variant_bathrooms := (variant->>'bathrooms')::integer;
    end if;
    variant_down_payment := null;
    if nullif(btrim(variant->>'downPayment'), '') is not null then
      if variant->>'downPayment' !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Imported down payments must be numeric'; end if;
      variant_down_payment := (variant->>'downPayment')::numeric;
      if variant_down_payment < 0 or variant_down_payment > 100 then raise exception 'Imported down payments must be between 0 and 100'; end if;
    end if;
    variant_installment_years := null;
    if nullif(btrim(variant->>'installmentYears'), '') is not null then
      if variant->>'installmentYears' !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Imported installment years must be numeric'; end if;
      variant_installment_years := (variant->>'installmentYears')::numeric;
      if variant_installment_years <= 0 then raise exception 'Imported installment years must be greater than zero'; end if;
    end if;
    variant_stock_count := null;
    if nullif(btrim(variant->>'stockCount'), '') is not null then
      if variant->>'stockCount' !~ '^[0-9]+$' then raise exception 'Imported stock counts must be whole numbers'; end if;
      variant_stock_count := (variant->>'stockCount')::integer;
    end if;
  end loop;

  if exists (
    select 1 from public.project_unit_types unit_type
    where unit_type.project_id = p_project_id
      and unit_type.phase_id = p_phase_id
      and unit_type.archived_at is null
      and lower(btrim(unit_type.label)) = lower(payload_name)
  ) then raise exception 'A unit type with this name already exists in the selected phase'; end if;

  insert into public.project_unit_types(
    project_id, phase_id, category, label, min_price, max_price,
    unit_area_min, unit_area_max, finishing_status, description
  ) values (
    p_project_id, p_phase_id, payload_category, payload_name, type_min_price,
    type_max_price, type_area_min, type_area_max, payload_finishing, payload_description
  ) returning id into unit_type_id;

  for variant in select value from jsonb_array_elements(p_payload->'variants') loop
    variant_price := (variant->>'price')::numeric;
    variant_max_price := nullif(variant->>'maxPrice', '')::numeric;
    variant_area_min := nullif(variant->>'areaMin', '')::numeric;
    variant_area_max := nullif(variant->>'areaMax', '')::numeric;
    variant_bedrooms := nullif(variant->>'bedrooms', '')::integer;
    variant_bathrooms := nullif(variant->>'bathrooms', '')::integer;
    variant_down_payment := nullif(variant->>'downPayment', '')::numeric;
    variant_installment_years := nullif(variant->>'installmentYears', '')::numeric;
    variant_stock_count := nullif(variant->>'stockCount', '')::integer;
    insert into public.project_unit_variants(
      project_unit_type_id, category, label, bedrooms, bathrooms,
      has_garden, has_roof, finishing_status, min_price, max_price,
      unit_area_min, unit_area_max, down_payment_percent, installment_years,
      stock_count, description, amenities
    ) values (
      unit_type_id, payload_category, payload_name, variant_bedrooms, variant_bathrooms,
      case when jsonb_typeof(variant->'hasGarden') = 'boolean' then (variant->>'hasGarden')::boolean else null end,
      case when jsonb_typeof(variant->'hasRoof') = 'boolean' then (variant->>'hasRoof')::boolean else null end,
      payload_finishing, variant_price, coalesce(variant_max_price, variant_price),
      variant_area_min, variant_area_max, variant_down_payment, variant_installment_years,
      variant_stock_count, nullif(btrim(coalesce(variant->>'description', '')), ''),
      case when jsonb_typeof(variant->'amenities') = 'array' then array(select jsonb_array_elements_text(variant->'amenities')) else null end
    );
  end loop;
  return unit_type_id;
end;
$$;

revoke all on function public.create_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb) from public, anon, authenticated;
revoke all on function public.update_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb) from public, anon, authenticated;
revoke all on function public.archive_developer_project_phase(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.restore_developer_project_phase(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb) to service_role;
grant execute on function public.update_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb) to service_role;
grant execute on function public.archive_developer_project_phase(uuid, uuid, uuid) to service_role;
grant execute on function public.restore_developer_project_phase(uuid, uuid, uuid) to service_role;
revoke all on function public.import_developer_project_inventory(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_developer_project_inventory(uuid, uuid, uuid, uuid, jsonb) to service_role;

commit;
