begin;

-- Developer membership is an authorization boundary, not a user-editable
-- profile. All lifecycle and tenant changes are mediated by audited server RPCs.
revoke insert, update, delete, truncate on public.developer_accounts from anon, authenticated;

drop policy if exists developer_accounts_update_own on public.developer_accounts;
drop policy if exists developer_accounts_admin_insert on public.developer_accounts;
drop policy if exists developer_accounts_admin_delete on public.developer_accounts;
drop policy if exists developer_accounts_admin_manage on public.developer_accounts;

-- Remove stale mutation policies as well as grants. Portal writes are routed
-- through server-side tenant checks, so a revoked JWT has no alternate path.
drop policy if exists developer_projects_update on public.developer_projects;
drop policy if exists project_unit_variants_insert on public.project_unit_variants;
drop policy if exists project_unit_variants_update on public.project_unit_variants;
drop policy if exists project_unit_variants_delete on public.project_unit_variants;

drop policy if exists developer_accounts_read_own on public.developer_accounts;
create policy developer_accounts_read_own
on public.developer_accounts
for select
to authenticated
using (
  (
    auth_user_id = (select auth.uid())
    and status in ('pending', 'active')
  )
  or exists (
    select 1
    from public.admins admin
    where admin.id = (select auth.uid())
      and admin.is_active = true
  )
);

-- Public developer identity changes are reviewed separately from the live row.
-- This prevents a compromised portal account from immediately changing mobile
-- branding, while retaining immutable before/after history.
create table if not exists public.developer_profile_revisions (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text check (description is null or char_length(description) <= 500),
  logo_url text check (
    logo_url is null
    or (
      char_length(logo_url) <= 2048
      and logo_url ~* '^https://'
    )
  ),
  status text not null default 'pending'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'superseded')),
  submitted_by_account_id uuid not null references public.developer_accounts(id) on delete restrict,
  reviewed_by_admin_id uuid references public.admins(id) on delete set null,
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  unique (developer_id, version)
);

create unique index if not exists developer_profile_revisions_one_pending_idx
  on public.developer_profile_revisions(developer_id)
  where status = 'pending';
create index if not exists developer_profile_revisions_review_queue_idx
  on public.developer_profile_revisions(status, submitted_at desc, created_at desc);

alter table public.developer_profile_revisions enable row level security;
alter table public.developer_profile_revisions force row level security;
drop policy if exists developer_profile_revisions_service_role on public.developer_profile_revisions;
create policy developer_profile_revisions_service_role
on public.developer_profile_revisions
for all
to service_role
using (true)
with check (true);

revoke all on public.developer_profile_revisions from public, anon, authenticated;
grant select, insert, update, delete on public.developer_profile_revisions to service_role;

-- Unit and variant removals are recoverable. Public/mobile readers never see
-- archived inventory; the service-mediated developer workspace can offer a
-- restore flow without destroying moderation or project history.
alter table public.project_unit_types
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_account_id uuid references public.developer_accounts(id) on delete set null;

alter table public.project_unit_variants
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_account_id uuid references public.developer_accounts(id) on delete set null;

alter table public.properties
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_developer_account_id uuid references public.developer_accounts(id) on delete set null;

create index if not exists project_unit_types_active_project_idx
  on public.project_unit_types(project_id, updated_at desc)
  where archived_at is null;
create index if not exists project_unit_variants_active_type_idx
  on public.project_unit_variants(project_unit_type_id, updated_at desc)
  where archived_at is null;
create index if not exists properties_developer_archive_idx
  on public.properties(developer_id, archived_at, updated_at desc)
  where listed_by_agent_id is null;

create or replace function public.guard_archived_property_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.archived_at is not null and new.is_active = true then
    raise exception 'Archived listings cannot be active';
  end if;
  return new;
end;
$$;

drop trigger if exists properties_guard_archived_visibility on public.properties;
create trigger properties_guard_archived_visibility
before insert or update of is_active, archived_at on public.properties
for each row execute function public.guard_archived_property_visibility();

revoke all on function public.guard_archived_property_visibility() from public, anon, authenticated;

drop policy if exists properties_archived_visibility_boundary on public.properties;
create policy properties_archived_visibility_boundary
on public.properties
as restrictive
for select
to public
using (archived_at is null);

create or replace function public.developer_dashboard_metrics(dev_id uuid)
returns table (
  listings bigint,
  hidden bigint,
  pending bigint,
  inquiries bigint,
  eois bigint,
  cils bigint,
  reservations bigint,
  sales_claims bigint,
  stage_shifts bigint,
  deals_this_month bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with developer_row as (
    select name from public.developers where id = dev_id
  ),
  owned_properties as (
    select property.*
    from public.properties property
    where property.archived_at is null
      and (
        property.developer_id = dev_id
        or exists (
          select 1 from public.developer_projects project
          where project.id = property.project_id and project.developer_id = dev_id
        )
      )
  ),
  stage_rows as (
    select entry.*
    from public.deal_stage_entries entry
    where lower(coalesce(entry.developer_name, '')) = lower(coalesce((select name from developer_row), ''))
  ),
  deal_rows as (
    select deal.*
    from public.deals deal
    where lower(deal.developer_name) = lower(coalesce((select name from developer_row), ''))
  )
  select
    count(*) filter (where coalesce(is_active, true) and approval_status = 'approved'),
    count(*) filter (where not coalesce(is_active, true)),
    count(*) filter (where approval_status = 'pending'),
    coalesce(sum(inquiries_count), 0)::bigint +
      (select count(*) from public.developer_contact_requests request where request.developer_id = dev_id and request.status = 'open'),
    (select count(*) from stage_rows where stage = 'EOI'),
    (select count(*) from stage_rows where stage = 'CIL'),
    (select count(*) from stage_rows where stage = 'Reservation'),
    (select count(*) from stage_rows where stage = 'SalesClaim'),
    (select count(*) from stage_rows where updated_at >= now() - interval '30 days'),
    (select count(*) from deal_rows where submitted_at >= date_trunc('month', now()))
  from owned_properties;
$$;

revoke all on function public.developer_dashboard_metrics(uuid) from public, anon, authenticated;
grant execute on function public.developer_dashboard_metrics(uuid) to service_role;

drop policy if exists project_unit_types_select on public.project_unit_types;
create policy project_unit_types_select
on public.project_unit_types
for select
to public
using (
  archived_at is null
  and exists (
    select 1
    from public.developer_projects project
    where project.id = project_unit_types.project_id
      and (
        (
          project.approval_status = 'approved'
          and project.lifecycle_state = 'published'
          and project.published_at is not null
          and project.is_demo = false
        )
        or exists (
          select 1 from public.developer_accounts account
          where account.developer_id = project.developer_id
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

drop policy if exists project_unit_variants_read on public.project_unit_variants;
create policy project_unit_variants_read
on public.project_unit_variants
for select
to authenticated
using (
  archived_at is null
  and exists (
    select 1
    from public.project_unit_types unit_type
    join public.developer_projects project on project.id = unit_type.project_id
    where unit_type.id = project_unit_variants.project_unit_type_id
      and unit_type.archived_at is null
      and (
        (
          project.approval_status = 'approved'
          and project.lifecycle_state = 'published'
          and project.published_at is not null
          and project.is_demo = false
        )
        or exists (
          select 1 from public.developer_accounts account
          where account.developer_id = project.developer_id
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

create or replace function public.submit_developer_profile_revision(
  p_developer_id uuid,
  p_account_id uuid,
  p_name text,
  p_description text default null,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_row public.developer_accounts%rowtype;
  existing_row public.developer_profile_revisions%rowtype;
  created_row public.developer_profile_revisions%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  normalized_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
  next_version integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if char_length(normalized_name) not between 1 and 200 then
    raise exception 'Developer name must contain between 1 and 200 characters';
  end if;
  if normalized_description is not null and char_length(normalized_description) > 500 then
    raise exception 'Developer description cannot exceed 500 characters';
  end if;
  if normalized_logo is not null and (
    char_length(normalized_logo) > 2048 or normalized_logo !~* '^https://'
  ) then
    raise exception 'Developer logo must use a valid HTTPS URL';
  end if;

  select * into account_row
  from public.developer_accounts
  where id = p_account_id
    and developer_id = p_developer_id
    and status = 'active'
  for update;
  if not found then
    raise exception 'Active developer membership required';
  end if;

  perform 1 from public.developers where id = p_developer_id for update;
  if not found then
    raise exception 'Developer not found';
  end if;

  select * into existing_row
  from public.developer_profile_revisions
  where developer_id = p_developer_id and status = 'pending'
  for update;

  if found
     and existing_row.name = normalized_name
     and existing_row.description is not distinct from normalized_description
     and existing_row.logo_url is not distinct from normalized_logo then
    return jsonb_build_object(
      'revision_id', existing_row.id,
      'developer_id', existing_row.developer_id,
      'version', existing_row.version,
      'status', existing_row.status,
      'idempotent', true
    );
  end if;

  if found then
    update public.developer_profile_revisions
    set status = 'superseded', updated_at = now()
    where id = existing_row.id;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.developer_profile_revisions
  where developer_id = p_developer_id;

  insert into public.developer_profile_revisions(
    developer_id, version, name, description, logo_url, status,
    submitted_by_account_id, submitted_at
  ) values (
    p_developer_id, next_version, normalized_name, normalized_description,
    normalized_logo, 'pending', account_row.id, now()
  ) returning * into created_row;

  return jsonb_build_object(
    'revision_id', created_row.id,
    'developer_id', created_row.developer_id,
    'version', created_row.version,
    'status', created_row.status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.submit_developer_profile_revision(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_developer_profile_revision(uuid, uuid, text, text, text)
  to service_role;

create or replace function public.review_developer_profile_revision(
  p_revision_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  revision_row public.developer_profile_revisions%rowtype;
  admin_allowed boolean := false;
  normalized_decision text := lower(btrim(coalesce(p_decision, '')));
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select (
    admin.is_active = true
    and (
      admin.role::text in ('super_admin', 'developers_admin')
      or exists (
        select 1
        from unnest(coalesce(admin.roles, '{}'::public.admin_role[])) assigned_role
        where assigned_role::text in ('super_admin', 'developers_admin')
      )
    )
  ) into admin_allowed
  from public.admins admin
  where admin.id = p_admin_id;
  if not coalesce(admin_allowed, false) then
    raise exception 'Developer administration role required';
  end if;
  if normalized_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject';
  end if;
  if normalized_decision = 'reject'
     and (normalized_reason is null or char_length(normalized_reason) not between 3 and 500) then
    raise exception 'A rejection reason between 3 and 500 characters is required';
  end if;
  if normalized_reason is not null and char_length(normalized_reason) > 500 then
    raise exception 'Review reason cannot exceed 500 characters';
  end if;

  select * into revision_row
  from public.developer_profile_revisions
  where id = p_revision_id
  for update;
  if not found then
    raise exception 'Profile revision not found';
  end if;
  if revision_row.status <> 'pending' then
    raise exception 'Profile revision has already been reviewed';
  end if;

  if normalized_decision = 'approve' then
    update public.developers
    set name = revision_row.name,
        description = revision_row.description,
        logo_url = revision_row.logo_url,
        updated_at = now()
    where id = revision_row.developer_id;

    update public.developer_profile_revisions
    set status = 'approved', reviewed_by_admin_id = p_admin_id,
        review_reason = normalized_reason, reviewed_at = now(),
        published_at = now(), updated_at = now()
    where id = revision_row.id;
  else
    update public.developer_profile_revisions
    set status = 'rejected', reviewed_by_admin_id = p_admin_id,
        review_reason = normalized_reason, reviewed_at = now(), updated_at = now()
    where id = revision_row.id;
  end if;

  insert into public.admin_activity_log(
    admin_id, action_type, entity_type, entity_id, details
  ) values (
    p_admin_id,
    'developer.profile_' || case when normalized_decision = 'approve' then 'approved' else 'rejected' end,
    'developer_profile_revision',
    revision_row.id,
    jsonb_build_object(
      'developer_id', revision_row.developer_id,
      'version', revision_row.version,
      'decision', normalized_decision,
      'reason', normalized_reason
    )
  );

  return jsonb_build_object(
    'revision_id', revision_row.id,
    'developer_id', revision_row.developer_id,
    'version', revision_row.version,
    'status', case when normalized_decision = 'approve' then 'approved' else 'rejected' end
  );
end;
$$;

revoke all on function public.review_developer_profile_revision(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_developer_profile_revision(uuid, uuid, text, text)
  to service_role;

commit;
