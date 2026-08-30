begin;

-- Inventory review is intentionally additive. The existing approval/renewal
-- enums and mobile-facing columns remain the compatibility boundary; these
-- fields retain the evidence an operator saw when making a decision.
alter table public.properties
  add column if not exists publication_checklist jsonb not null default '{}'::jsonb,
  add column if not exists quality_issues text[] not null default '{}'::text[],
  add column if not exists quality_score smallint;

alter table public.developer_projects
  add column if not exists publication_checklist jsonb not null default '{}'::jsonb,
  add column if not exists quality_issues text[] not null default '{}'::text[],
  add column if not exists quality_score smallint;

alter table public.property_renewal_requests
  add column if not exists source text,
  add column if not exists current_expires_at timestamptz,
  add column if not exists proposed_expires_at timestamptz,
  add column if not exists rejection_reason text;

update public.property_renewal_requests
set source = requested_by_role::text
where source is null;

update public.property_renewal_requests request_row
set current_expires_at = property.expires_at,
    proposed_expires_at = greatest(coalesce(property.expires_at, now()), now()) + interval '3 months'
from public.properties property
where property.id = request_row.property_id
  and (request_row.current_expires_at is null or request_row.proposed_expires_at is null);

alter table public.property_renewal_requests
  alter column source set default 'unknown',
  alter column source set not null;

alter table public.property_renewal_requests
  drop constraint if exists property_renewal_requests_source_check;
alter table public.property_renewal_requests
  add constraint property_renewal_requests_source_check
  check (source in ('agent', 'developer', 'admin', 'unknown'));

-- A pending or rejected listing must not be active. This is enforced in both a
-- trigger (for a useful default on imports) and a check constraint (for direct
-- SQL/service-role writes that try to bypass the trigger).
update public.properties
set is_active = false,
    published_at = null
where coalesce(approval_status::text, 'pending') <> 'approved';

alter table public.properties
  drop constraint if exists properties_non_approved_inactive;
alter table public.properties
  add constraint properties_non_approved_inactive
  check (coalesce(approval_status::text, 'pending') = 'approved' or is_active = false);

create or replace function public.normalize_pending_property_visibility()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if coalesce(new.approval_status::text, 'pending') <> 'approved' then
    new.is_active := false;
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_pending_visibility_guard on public.properties;
create trigger properties_pending_visibility_guard
before insert or update of approval_status, is_active, published_at on public.properties
for each row execute function public.normalize_pending_property_visibility();

revoke all on function public.normalize_pending_property_visibility() from public, anon, authenticated;

-- Return one canonical, operator-readable listing checklist. URL syntax is
-- checked here rather than attempting network requests from the database.
create or replace function public.property_listing_publication_check(p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  listing record;
  linked_project record;
  linked_developer record;
  issues text[] := '{}'::text[];
  checks jsonb;
  photo_count integer := 0;
  distinct_photo_count integer := 0;
  has_duplicate boolean := false;
  developer_ready boolean := true;
  project_found boolean := false;
  project_ready boolean := true;
begin
  select * into listing
  from public.properties
  where id = p_property_id;
  if not found then
    return jsonb_build_object(
      'ready', false,
      'issues', jsonb_build_array('Listing not found'),
      'checks', jsonb_build_object('exists', false)
    );
  end if;

  if nullif(btrim(coalesce(listing.property_name, '')), '') is null then
    issues := array_append(issues, 'Property name is required');
  end if;
  if listing.property_type is null then
    issues := array_append(issues, 'Property type is required');
  end if;
  if listing.price is null or listing.price < 100000 then
    issues := array_append(issues, 'Price must be at least EGP 100,000');
  end if;
  if listing.unit_area is null or listing.unit_area < 10 then
    issues := array_append(issues, 'Unit area must be at least 10 m²');
  end if;
  if nullif(btrim(coalesce(listing.description, '')), '') is null then
    issues := array_append(issues, 'Description is required for mobile publication');
  end if;
  if listing.listed_by_agent_id is null and listing.developer_id is null and listing.project_id is null then
    issues := array_append(issues, 'Listing must have an agent, developer, or project association');
  end if;

  if listing.developer_id is not null then
    developer_ready := false;
    select id, is_active
    into linked_developer
    from public.developers
    where id = listing.developer_id;
    if found and linked_developer.is_active is true then
      developer_ready := true;
    else
      issues := array_append(issues, 'Linked developer must be active');
    end if;
  end if;

  photo_count := coalesce(array_length(listing.photos, 1), 0);
  select count(distinct lower(btrim(photo)))
  into distinct_photo_count
  from unnest(coalesce(listing.photos, '{}'::text[])) as photo;
  if photo_count < 3 then
    issues := array_append(issues, 'At least three photos are required');
  elsif distinct_photo_count <> photo_count then
    issues := array_append(issues, 'Photo URLs must be unique');
  end if;
  if exists (
    select 1
    from unnest(coalesce(listing.photos, '{}'::text[])) as photo
    where nullif(btrim(photo), '') is null
       or btrim(photo) !~* '^https?://'
  ) then
    issues := array_append(issues, 'Every photo must use an http(s) URL');
  end if;

  select exists (
    select 1
    from public.properties other
    where other.id <> listing.id
      and lower(btrim(other.property_name)) = lower(btrim(listing.property_name))
      and other.unit_area = listing.unit_area
      and other.price = listing.price
      and other.project_id is not distinct from listing.project_id
      and coalesce(other.approval_status::text, 'pending') <> 'rejected'
  ) into has_duplicate;
  if has_duplicate then
    issues := array_append(issues, 'A matching active, pending, or approved listing already exists');
  end if;

  if listing.project_id is not null then
    project_ready := false;
    select id, name, developer_id, approval_status, lifecycle_state, published_at
    into linked_project
    from public.developer_projects
    where id = listing.project_id;
    project_found := found;
    if not project_found then
      issues := array_append(issues, 'Linked project was not found');
    elsif linked_project.approval_status <> 'approved'
       or linked_project.lifecycle_state <> 'published'
       or linked_project.published_at is null then
      issues := array_append(issues, 'Linked project must be approved and published');
    elsif listing.developer_id is not null
       and linked_project.developer_id is distinct from listing.developer_id then
      issues := array_append(issues, 'Linked project must belong to the listing developer');
    else
      project_ready := true;
    end if;
  end if;

  checks := jsonb_build_object(
    'identity', nullif(btrim(coalesce(listing.property_name, '')), '') is not null
      and listing.property_type is not null
      and (listing.listed_by_agent_id is not null or listing.developer_id is not null or listing.project_id is not null)
      and developer_ready,
    'commercial', listing.price is not null and listing.price >= 100000
      and listing.unit_area is not null and listing.unit_area >= 10,
    'description', nullif(btrim(coalesce(listing.description, '')), '') is not null,
    'media', photo_count >= 3 and distinct_photo_count = photo_count
      and not exists (
        select 1 from unnest(coalesce(listing.photos, '{}'::text[])) as photo
        where nullif(btrim(photo), '') is null or btrim(photo) !~* '^https?://'
      ),
    'duplicate_free', not has_duplicate,
    'project', project_ready
  );

  return jsonb_build_object(
    'ready', cardinality(issues) = 0,
    'issues', to_jsonb(issues),
    'checks', checks,
    'photo_count', photo_count,
    'distinct_photo_count', distinct_photo_count
  );
end;
$$;

-- A project checklist is kept in the same publication vocabulary as listings,
-- so the operations page can show one consistent mobile-readiness contract.
create or replace function public.developer_project_publication_check(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_row record;
  issues text[] := '{}'::text[];
  unit_count integer := 0;
  incomplete_unit_count integer := 0;
  has_hero boolean := false;
  checks jsonb;
begin
  select * into project_row
  from public.developer_projects
  where id = p_project_id;
  if not found then
    return jsonb_build_object('ready', false, 'issues', jsonb_build_array('Project not found'), 'checks', jsonb_build_object('exists', false));
  end if;

  has_hero := coalesce(project_row.hero_media->>'heroImageUrl', '') <> ''
    or coalesce(project_row.hero_media->>'hero_image_url', '') <> ''
    or (jsonb_typeof(project_row.hero_media->'images') = 'array' and jsonb_array_length(project_row.hero_media->'images') > 0);
  select count(*) into unit_count
  from public.project_unit_types
  where project_id = p_project_id;
  select count(*) into incomplete_unit_count
  from public.project_unit_types
  where project_id = p_project_id
    and (
      nullif(btrim(coalesce(label, '')), '') is null
      or min_price is null or min_price < 100000
      or unit_area_min is null or unit_area_min < 10
      or nullif(btrim(coalesce(description, '')), '') is null
    );

  if nullif(btrim(coalesce(project_row.name, '')), '') is null then issues := array_append(issues, 'Project name is required'); end if;
  if nullif(btrim(coalesce(project_row.description, '')), '') is null then issues := array_append(issues, 'Project description is required'); end if;
  if nullif(btrim(coalesce(project_row.location, '')), '') is null then issues := array_append(issues, 'Project location is required'); end if;
  if coalesce(array_length(project_row.project_types, 1), 0) = 0 then issues := array_append(issues, 'At least one project type is required'); end if;
  if not has_hero then issues := array_append(issues, 'Hero media is required for the mobile preview'); end if;
  if project_row.developer_id is null or not exists (select 1 from public.developers where id = project_row.developer_id and is_active = true) then issues := array_append(issues, 'An active developer association is required'); end if;
  if unit_count = 0 then issues := array_append(issues, 'At least one unit type is required'); end if;
  if incomplete_unit_count > 0 then issues := array_append(issues, 'Every unit type needs a label, price, area, and description'); end if;

  checks := jsonb_build_object(
    'identity', nullif(btrim(coalesce(project_row.name, '')), '') is not null
      and project_row.developer_id is not null,
    'description', nullif(btrim(coalesce(project_row.description, '')), '') is not null,
    'location', nullif(btrim(coalesce(project_row.location, '')), '') is not null,
    'project_types', coalesce(array_length(project_row.project_types, 1), 0) > 0,
    'hero_media', has_hero,
    'unit_types', unit_count > 0 and incomplete_unit_count = 0,
    'active_developer', project_row.developer_id is not null and exists (select 1 from public.developers where id = project_row.developer_id and is_active = true)
  );

  return jsonb_build_object('ready', cardinality(issues) = 0, 'issues', to_jsonb(issues), 'checks', checks, 'unit_count', unit_count);
end;
$$;

revoke all on function public.property_listing_publication_check(uuid) from public, anon, authenticated;
revoke all on function public.developer_project_publication_check(uuid) from public, anon, authenticated;
grant execute on function public.property_listing_publication_check(uuid) to service_role;
grant execute on function public.developer_project_publication_check(uuid) to service_role;

-- A service-role caller still cannot bypass the publication contract with a
-- direct table update. The review RPC below passes this same check, while
-- pending/rejected writes continue to be normalized by the visibility guard.
create or replace function public.guard_property_publication_transition()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  checklist jsonb;
begin
  if tg_op = 'INSERT' and new.approval_status::text = 'approved' then
    raise exception 'Listings must enter review before publication';
  end if;
  if tg_op = 'UPDATE'
     and new.approval_status::text = 'approved'
     and old.approval_status::text is distinct from 'approved' then
    checklist := public.property_listing_publication_check(new.id);
    if coalesce((checklist->>'ready')::boolean, false) = false then
      raise exception 'Listing is not ready for publication: %', checklist->'issues';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_publication_transition_guard on public.properties;
create trigger properties_publication_transition_guard
before insert or update of approval_status on public.properties
for each row execute function public.guard_property_publication_transition();
revoke all on function public.guard_property_publication_transition() from public, anon, authenticated;

-- Moderation functions are the only path that can publish inventory. Each
-- function locks the row, validates its current state, persists the checklist,
-- and inserts the corresponding developer/agent notification in the same
-- transaction as the decision.
create or replace function public.review_property_listing(
  p_property_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.properties
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  listing public.properties%rowtype;
  checklist jsonb;
  issues text[] := '{}'::text[];
  caller uuid := auth.uid();
  effective_admin uuid := case when coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then p_admin_id else caller end;
  reason_value text := nullif(btrim(coalesce(p_reason, '')), '');
  notification_type_value public.notification_type;
  notification_title text;
  notification_message text;
begin
  if p_decision not in ('pending', 'approved', 'rejected') then raise exception 'Invalid listing decision'; end if;
  if effective_admin is null or not exists (
    select 1 from public.admins admin
    where admin.id = effective_admin and admin.is_active = true
      and (admin.role::text in ('listing_admin', 'super_admin')
        or 'listing_admin' = any(coalesce(admin.roles::text[], '{}'::text[]))
        or 'super_admin' = any(coalesce(admin.roles::text[], '{}'::text[])))
  ) then raise exception 'Active listing admin required'; end if;
  if p_decision in ('pending', 'rejected') and char_length(coalesce(reason_value, '')) < 5 then
    raise exception 'A review reason of at least 5 characters is required';
  end if;

  select * into listing from public.properties where id = p_property_id for update;
  if not found then raise exception 'Listing % not found', p_property_id; end if;
  if listing.approval_status::text = 'approved' and p_decision = 'rejected' then
    -- A published listing may be taken back to review, but never silently
    -- deleted. The visibility trigger hides it until a later approval.
    null;
  elsif listing.approval_status::text not in ('pending', 'rejected', 'approved') then
    raise exception 'Listing is not in a reviewable state';
  end if;

  checklist := public.property_listing_publication_check(p_property_id);
  select coalesce(array_agg(issue_text), '{}'::text[]) into issues
  from jsonb_array_elements_text(coalesce(checklist->'issues', '[]'::jsonb)) as issue_value(issue_text);
  if p_decision = 'approved' and coalesce((checklist->>'ready')::boolean, false) = false then
    raise exception 'Listing is not ready for publication: %', array_to_string(issues, '; ');
  end if;

  update public.properties
  set approval_status = p_decision::public.property_approval_status,
      is_active = case when p_decision = 'approved' then true else false end,
      published_at = case when p_decision = 'approved' then coalesce(published_at, now()) else null end,
      rejection_reason = case when p_decision in ('pending', 'rejected') then reason_value else null end,
      reviewed_by = effective_admin,
      reviewed_at = now(),
      publication_checklist = checklist,
      quality_issues = issues,
      quality_score = greatest(0, 100 - cardinality(issues) * 15),
      updated_at = now()
  where id = p_property_id
  returning * into listing;

  notification_type_value := case
    when p_decision = 'approved' then 'property_approved'::public.notification_type
    when p_decision = 'rejected' then 'property_rejected'::public.notification_type
    else 'admin_message'::public.notification_type
  end;
  notification_title := case
    when p_decision = 'approved' then 'Listing approved'
    when p_decision = 'rejected' then 'Listing rejected'
    else 'Listing changes requested'
  end;
  notification_message := format('%s: %s', coalesce(listing.property_name, 'Listing'), coalesce(reason_value, 'Your listing is now visible in the mobile catalog.'));
  if listing.listed_by_agent_id is not null then
    insert into public.notifications(agent_id, type, title, message, related_entity_type, related_entity_id, action_url)
    values (listing.listed_by_agent_id, notification_type_value, notification_title, notification_message, 'property', listing.id, '/properties');
  end if;
  if listing.developer_id is not null then
    insert into public.developer_notifications(developer_id, title, message)
    values (listing.developer_id, notification_title, notification_message);
  end if;
  return listing;
end;
$$;

create or replace function public.review_developer_project(
  p_project_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.developer_projects
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_row public.developer_projects%rowtype;
  checklist jsonb;
  issues text[] := '{}'::text[];
  caller uuid := auth.uid();
  effective_admin uuid := case when coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then p_admin_id else caller end;
  reason_value text := nullif(btrim(coalesce(p_reason, '')), '');
  notification_title text;
  notification_message text;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid project decision'; end if;
  if effective_admin is null or not exists (
    select 1 from public.admins admin
    where admin.id = effective_admin and admin.is_active = true
      and (admin.role::text in ('listing_admin', 'super_admin')
        or 'listing_admin' = any(coalesce(admin.roles::text[], '{}'::text[]))
        or 'super_admin' = any(coalesce(admin.roles::text[], '{}'::text[])))
  ) then raise exception 'Active listing admin required'; end if;
  if p_decision = 'rejected' and char_length(coalesce(reason_value, '')) < 5 then
    raise exception 'A review reason of at least 5 characters is required';
  end if;

  select * into project_row from public.developer_projects where id = p_project_id for update;
  if not found then raise exception 'Project % not found', p_project_id; end if;
  if project_row.approval_status not in ('pending', 'rejected', 'approved') then raise exception 'Project is not in a reviewable state'; end if;
  checklist := public.developer_project_publication_check(p_project_id);
  select coalesce(array_agg(issue_text), '{}'::text[]) into issues
  from jsonb_array_elements_text(coalesce(checklist->'issues', '[]'::jsonb)) as issue_value(issue_text);
  if p_decision = 'approved' and coalesce((checklist->>'ready')::boolean, false) = false then
    raise exception 'Project is not ready for publication: %', array_to_string(issues, '; ');
  end if;

  update public.developer_projects
  set approval_status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then reason_value else null end,
      reviewed_by = effective_admin,
      reviewed_at = now(),
      publication_checklist = checklist,
      quality_issues = issues,
      quality_score = greatest(0, 100 - cardinality(issues) * 15),
      updated_at = now()
  where id = p_project_id
  returning * into project_row;

  notification_title := case when p_decision = 'approved' then 'Project approved for mobile' else 'Project changes requested' end;
  notification_message := format('%s: %s', coalesce(project_row.name, 'Project'), coalesce(reason_value, 'Your project is now visible in the mobile catalog.'));
  if project_row.developer_id is not null then
    insert into public.developer_notifications(developer_id, title, message)
    values (project_row.developer_id, notification_title, notification_message);
  end if;
  return project_row;
end;
$$;

revoke all on function public.review_property_listing(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_developer_project(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_property_listing(uuid, uuid, text, text) to service_role;
grant execute on function public.review_developer_project(uuid, uuid, text, text) to service_role;

-- Approved projects also pass through the same guard when a caller attempts a
-- direct update, while ordinary developer edits are returned to review.
create or replace function public.guard_developer_project_publication_transition()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  checklist jsonb;
begin
  if tg_op = 'INSERT' and new.approval_status = 'approved' then
    raise exception 'Projects must enter review before publication';
  end if;
  if tg_op = 'UPDATE' and new.approval_status = 'approved' and old.approval_status is distinct from 'approved' then
    checklist := public.developer_project_publication_check(new.id);
    if coalesce((checklist->>'ready')::boolean, false) = false then
      raise exception 'Project is not ready for publication: %', checklist->'issues';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists developer_projects_publication_transition_guard on public.developer_projects;
create trigger developer_projects_publication_transition_guard
before insert or update of approval_status on public.developer_projects
for each row execute function public.guard_developer_project_publication_transition();
revoke all on function public.guard_developer_project_publication_transition() from public, anon, authenticated;

create or replace function public.mark_developer_project_pending_from_content()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  new.approval_status := 'pending';
  new.rejection_reason := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  return new;
end;
$$;

drop trigger if exists developer_projects_content_require_review on public.developer_projects;
create trigger developer_projects_content_require_review
before update of name, description, hero_media, voice_notes, video_links, location, acres, footprint, maintenance,
  payment_plans, payment_plan_templates, limited_time_offers, launch_status, launch_date, eoi_value_apt,
  eoi_value_villa, ch_fees, project_types, inventory_url on public.developer_projects
for each row
when (old.name is distinct from new.name
  or old.description is distinct from new.description
  or old.hero_media is distinct from new.hero_media
  or old.voice_notes is distinct from new.voice_notes
  or old.video_links is distinct from new.video_links
  or old.location is distinct from new.location
  or old.acres is distinct from new.acres
  or old.footprint is distinct from new.footprint
  or old.maintenance is distinct from new.maintenance
  or old.payment_plans is distinct from new.payment_plans
  or old.payment_plan_templates is distinct from new.payment_plan_templates
  or old.limited_time_offers is distinct from new.limited_time_offers
  or old.launch_status is distinct from new.launch_status
  or old.launch_date is distinct from new.launch_date
  or old.eoi_value_apt is distinct from new.eoi_value_apt
  or old.eoi_value_villa is distinct from new.eoi_value_villa
  or old.ch_fees is distinct from new.ch_fees
  or old.project_types is distinct from new.project_types
  or old.inventory_url is distinct from new.inventory_url)
execute function public.mark_developer_project_pending_from_content();
revoke all on function public.mark_developer_project_pending_from_content() from public, anon, authenticated;

-- Capture renewal context at request time so a reviewer can see what will
-- happen to the listing before approving it. The existing actor enum remains
-- the source-of-truth for authorization and mobile behavior.
create or replace function public.request_property_renewal_active_impl(
  p_property_id uuid,
  p_actor_role public.property_renewal_actor,
  p_actor_id uuid default null,
  p_notes text default null
)
returns public.property_renewal_requests
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  listing record;
  result public.property_renewal_requests;
  message text;
  caller uuid := auth.uid();
  effective_id uuid;
  is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  current_expiry timestamptz;
  proposed_expiry timestamptz;
  notes_value text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  effective_id := case when is_service then p_actor_id else caller end;
  if effective_id is null then raise exception 'Authentication required'; end if;
  if notes_value is not null and char_length(notes_value) > 2000 then raise exception 'Renewal notes are too long'; end if;

  select * into listing from public.properties where id = p_property_id for update;
  if not found then raise exception 'Property % not found', p_property_id; end if;
  if listing.approval_status <> 'approved' then raise exception 'Only approved listings can be renewed (property=%)', p_property_id; end if;
  if p_actor_role = 'developer' and listing.listed_by_agent_id is not null then raise exception 'Agent-submitted resales are read-only for developers'; end if;

  current_expiry := listing.expires_at;
  proposed_expiry := greatest(coalesce(current_expiry, now()), now()) + interval '3 months';

  if p_actor_role = 'admin' then
    if not exists (
      select 1 from public.admins admin
      where admin.id = effective_id and admin.is_active = true
        and (admin.role::text in ('listing_admin', 'super_admin')
          or 'listing_admin' = any(coalesce(admin.roles::text[], '{}'::text[]))
          or 'super_admin' = any(coalesce(admin.roles::text[], '{}'::text[])))
    ) then raise exception 'Active listing admin required'; end if;
    update public.properties
    set expires_at = proposed_expiry, last_renewed_at = now(), renewal_status = 'active', renewal_prompted_at = null,
        approval_status = 'approved', is_active = true, updated_at = now()
    where id = p_property_id returning * into listing;
    insert into public.property_renewal_requests(property_id, requested_by_role, requested_by_id, status, reviewed_by, reviewed_at, notes, source, current_expires_at, proposed_expires_at)
    values (p_property_id, 'admin', effective_id, 'approved', effective_id, now(), coalesce(notes_value, 'Renewed directly by admin'), 'admin', current_expiry, proposed_expiry)
    returning * into result;
    return result;
  elsif p_actor_role = 'agent' then
    if listing.listed_by_agent_id is null or listing.listed_by_agent_id <> effective_id then raise exception 'Only the listing agent can request renewal'; end if;
  elsif p_actor_role = 'developer' then
    if not exists (select 1 from public.developer_accounts where auth_user_id = effective_id and developer_id = listing.developer_id and status = 'active') then raise exception 'Active developer membership required'; end if;
  else
    raise exception 'Invalid renewal actor';
  end if;

  if exists (select 1 from public.property_renewal_requests where property_id = p_property_id and status = 'pending') then
    raise exception 'A renewal request is already pending for this listing';
  end if;

  insert into public.property_renewal_requests(property_id, requested_by_role, requested_by_id, notes, source, current_expires_at, proposed_expires_at)
  values (p_property_id, p_actor_role, effective_id, notes_value, p_actor_role::text, current_expiry, proposed_expiry)
  returning * into result;
  update public.properties set renewal_status = 'awaiting_admin', updated_at = now() where id = p_property_id;
  message := format('Renewal requested by %s for %s. Current expiry: %s. Proposed expiry: %s.', p_actor_role, coalesce(listing.property_name, listing.id::text), coalesce(current_expiry::text, 'not set'), proposed_expiry::text);
  perform public.log_property_expiration_event(p_property_id, 'admin', null, 'renewal_request', message);
  perform public.log_property_expiration_event(p_property_id, 'developer', listing.developer_id, 'renewal_request', message);
  if listing.listed_by_agent_id is not null then perform public.log_property_expiration_event(p_property_id, 'agent', listing.listed_by_agent_id, 'renewal_request', message); end if;
  return result;
end;
$$;

create or replace function public.review_property_renewal_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns public.property_renewal_requests
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_row public.property_renewal_requests%rowtype;
  listing record;
  caller uuid := auth.uid();
  effective_admin uuid := case when coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then p_admin_id else caller end;
  notes_value text := nullif(btrim(coalesce(p_notes, '')), '');
  current_expiry timestamptz;
  proposed_expiry timestamptz;
  message text;
begin
  if effective_admin is null or not exists (
    select 1 from public.admins admin
    where admin.id = effective_admin and admin.is_active = true
      and (admin.role::text in ('listing_admin', 'super_admin')
        or 'listing_admin' = any(coalesce(admin.roles::text[], '{}'::text[]))
        or 'super_admin' = any(coalesce(admin.roles::text[], '{}'::text[])))
  ) then raise exception 'Active listing admin required'; end if;
  if not p_approve and char_length(coalesce(notes_value, '')) < 5 then raise exception 'A rejection reason of at least 5 characters is required'; end if;
  select * into request_row from public.property_renewal_requests where id = p_request_id for update;
  if not found then raise exception 'Renewal request % not found', p_request_id; end if;
  if request_row.status <> 'pending' then raise exception 'Renewal request has already been reviewed'; end if;
  select * into listing from public.properties where id = request_row.property_id for update;
  if not found then raise exception 'Property for renewal request was not found'; end if;

  current_expiry := coalesce(request_row.current_expires_at, listing.expires_at);
  proposed_expiry := coalesce(request_row.proposed_expires_at, greatest(coalesce(current_expiry, now()), now()) + interval '3 months');
  if not p_approve then
    update public.property_renewal_requests
    set status = 'rejected', reviewed_by = effective_admin, reviewed_at = now(), notes = notes_value, rejection_reason = notes_value,
        current_expires_at = current_expiry, proposed_expires_at = proposed_expiry
    where id = p_request_id returning * into request_row;
    update public.properties set renewal_status = 'expired', updated_at = now() where id = request_row.property_id;
    message := format('Renewal rejected for %s. Current expiry: %s. Requested new expiry: %s. Reason: %s', coalesce(listing.property_name, listing.id::text), coalesce(current_expiry::text, 'not set'), proposed_expiry::text, notes_value);
    perform public.log_property_expiration_event(request_row.property_id, 'agent', listing.listed_by_agent_id, 'renewal_rejected', message);
    perform public.log_property_expiration_event(request_row.property_id, 'developer', listing.developer_id, 'renewal_rejected', message);
    if listing.listed_by_agent_id is not null then
      insert into public.notifications(agent_id, type, title, message, related_entity_type, related_entity_id, action_url)
      values (listing.listed_by_agent_id, 'admin_message', 'Renewal rejected', message, 'property', request_row.property_id, '/properties');
    end if;
    if listing.developer_id is not null then
      insert into public.developer_notifications(developer_id, title, message)
      values (listing.developer_id, 'Renewal rejected', message);
    end if;
    return request_row;
  end if;

  update public.properties
  set expires_at = proposed_expiry, last_renewed_at = now(), renewal_status = 'active', renewal_prompted_at = null,
      approval_status = 'approved', is_active = true, updated_at = now()
  where id = request_row.property_id returning * into listing;
  update public.property_renewal_requests
  set status = 'approved', reviewed_by = effective_admin, reviewed_at = now(), notes = notes_value, rejection_reason = null,
      current_expires_at = current_expiry, proposed_expires_at = proposed_expiry
  where id = p_request_id returning * into request_row;
  message := format('Renewal approved for %s. Previous expiry: %s. New expiry: %s', coalesce(listing.property_name, listing.id::text), coalesce(current_expiry::text, 'not set'), proposed_expiry::text);
  perform public.log_property_expiration_event(request_row.property_id, 'agent', listing.listed_by_agent_id, 'renewal_approved', message);
  perform public.log_property_expiration_event(request_row.property_id, 'developer', listing.developer_id, 'renewal_approved', message);
  if listing.listed_by_agent_id is not null then
    insert into public.notifications(agent_id, type, title, message, related_entity_type, related_entity_id, action_url)
    values (listing.listed_by_agent_id, 'admin_message', 'Listing renewed', message, 'property', request_row.property_id, '/properties');
  end if;
  if listing.developer_id is not null then
    insert into public.developer_notifications(developer_id, title, message)
    values (listing.developer_id, 'Listing renewed', message);
  end if;
  return request_row;
end;
$$;

revoke all on function public.request_property_renewal_active_impl(uuid, public.property_renewal_actor, uuid, text) from public, anon, authenticated;
grant execute on function public.request_property_renewal_active_impl(uuid, public.property_renewal_actor, uuid, text) to service_role;
revoke all on function public.review_property_renewal_request(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_property_renewal_request(uuid, uuid, boolean, text) to service_role;

create index if not exists properties_publication_queue_idx
  on public.properties(approval_status, created_at desc, id);
create index if not exists properties_project_publication_idx
  on public.properties(project_id, approval_status, is_active, updated_at desc);
create index if not exists property_renewal_requests_history_idx
  on public.property_renewal_requests(status, requested_at desc, id);

commit;
