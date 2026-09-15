-- Executable invitation -> company -> profile -> project -> phase -> inventory
-- journey.  Every write is wrapped in one transaction and rolled back so the
-- suite is safe to run against a disposable migration-built database.
begin;

insert into auth.users(id, email)
values
  ('91000000-0000-4000-8000-000000000001', 'journey-new-member@example.invalid'),
  ('91000000-0000-4000-8000-000000000002', 'journey-existing-owner@example.invalid'),
  ('91000000-0000-4000-8000-000000000003', 'journey-existing-member@example.invalid'),
  ('91000000-0000-4000-8000-000000000004', 'journey-sales-member@example.invalid'),
  ('91000000-0000-4000-8000-000000000005', 'journey-cross-tenant@example.invalid'),
  ('91000000-0000-4000-8000-000000000006', 'journey-unauthorized-member@example.invalid'),
  ('91000000-0000-4000-8000-000000000099', 'journey-admin@example.invalid');

insert into public.admins(id, role, roles, is_active)
values (
  '91000000-0000-4000-8000-000000000099',
  'super_admin',
  array['super_admin'::public.admin_role],
  true
);

insert into public.developers(
  id, name, contact_email, contact_phone, description, logo_url,
  lifecycle_state, published_at, is_active, is_demo
)
values (
  '92000000-0000-4000-8000-000000000001',
  'Existing Journey Company',
  'original-contact@example.invalid',
  '+201000000001',
  'A complete existing company profile.',
  'https://example.invalid/existing-logo.png',
  'published', now(), true, false
);

insert into public.developer_accounts(
  id, developer_id, auth_user_id, role, status, email, full_name,
  activated_at, is_demo
)
values (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
  'developer_super_admin', 'active', 'journey-existing-owner@example.invalid',
  'Existing owner', now(), false
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  invite_result jsonb;
  activation_result jsonb;
  login_result jsonb;
  new_account public.developer_accounts%rowtype;
  new_revision public.developer_profile_revisions%rowtype;
  revision_id uuid;
  event_count integer;
  profile_is_complete boolean;
begin
  -- A new company invite creates exactly one tenant and makes its first
  -- member the company super admin, without requiring an email round trip.
  invite_result := public.create_developer_account_invite(
    '92000000-0000-4000-8000-000000000010',
    'New Journey Company',
    'new-contact@example.invalid',
    '+201000000010',
    true,
    '91000000-0000-4000-8000-000000000001',
    'journey-new-member@example.invalid',
    '91000000-0000-4000-8000-000000000099',
    'journey-new-invite-1',
    false,
    null
  );
  if invite_result->>'action' <> 'developer_account.invite'
     or coalesce((invite_result->>'idempotent')::boolean, true) then
    raise exception 'New-company invitation did not create a fresh invite';
  end if;

  select * into new_account
  from public.developer_accounts
  where auth_user_id = '91000000-0000-4000-8000-000000000001';
  if not found or new_account.developer_id <> '92000000-0000-4000-8000-000000000010'
     or new_account.status <> 'pending'
     or new_account.role <> 'developer_super_admin' then
    raise exception 'New-company invite did not bind the first member to the new tenant as super admin';
  end if;
  if not exists (
    select 1 from public.developers developer
    where developer.id = new_account.developer_id
      and developer.contact_email = 'new-contact@example.invalid'
      and developer.contact_phone = '+201000000010'
  ) then
    raise exception 'New-company invite did not persist the new company contact data';
  end if;
  select count(*) into event_count
  from public.developer_account_events event
  where event.developer_account_id = new_account.id
    and event.event_type = 'developer_account.invite';
  if event_count <> 1 then
    raise exception 'New-company invitation was not audited exactly once';
  end if;

  -- Retrying the same request key is a database idempotency guarantee.
  invite_result := public.create_developer_account_invite(
    '92000000-0000-4000-8000-000000000010',
    'New Journey Company',
    'new-contact@example.invalid',
    '+201000000010',
    true,
    '91000000-0000-4000-8000-000000000001',
    'journey-new-member@example.invalid',
    '91000000-0000-4000-8000-000000000099',
    'journey-new-invite-1',
    false,
    null
  );
  if not coalesce((invite_result->>'idempotent')::boolean, false) then
    raise exception 'Repeated new-company invitation was not idempotent';
  end if;
  select count(*) into event_count
  from public.developer_account_events event
  where event.developer_account_id = new_account.id
    and event.event_type = 'developer_account.invite';
  if event_count <> 1 then
    raise exception 'Idempotent invitation duplicated its audit event';
  end if;

  activation_result := public.activate_developer_account_invite(
    '91000000-0000-4000-8000-000000000001',
    'JOURNEY-NEW-MEMBER@EXAMPLE.INVALID',
    'New member',
    'journey-new-activation-1'
  );
  if activation_result->>'account_id' <> new_account.id::text
     or coalesce((activation_result->>'idempotent')::boolean, true) then
    raise exception 'Pending invite did not activate the new member';
  end if;
  activation_result := public.activate_developer_account_invite(
    '91000000-0000-4000-8000-000000000001',
    'journey-new-member@example.invalid',
    'New member',
    'journey-new-activation-1'
  );
  if not coalesce((activation_result->>'idempotent')::boolean, false) then
    raise exception 'Repeated invite activation was not idempotent';
  end if;
  login_result := public.record_developer_account_login(
    new_account.id,
    '91000000-0000-4000-8000-000000000001',
    'journey-new-login-1',
    '2026-09-08 12:00:00+00'
  );
  if login_result->>'account_id' <> new_account.id::text
     or not exists (
       select 1 from public.developer_accounts account
       where account.id = new_account.id
         and account.status = 'active'
         and account.full_name = 'New member'
         and account.last_login = '2026-09-08 12:00:00+00'
     ) then
    raise exception 'Activated member could not record a valid login';
  end if;

  -- Before profile submission the same predicate used by the web session gate
  -- is false. A complete pending revision is enough to unlock the workspace,
  -- while public branding remains unchanged until review/publication.
  select (
    coalesce((select developer.name from public.developers developer where developer.id = new_account.developer_id), '') <> ''
    and coalesce((select developer.description from public.developers developer where developer.id = new_account.developer_id), '') <> ''
    and coalesce((select developer.logo_url from public.developers developer where developer.id = new_account.developer_id), '') <> ''
    and coalesce((select developer.lifecycle_state from public.developers developer where developer.id = new_account.developer_id), 'draft') <> 'draft'
  ) or exists (
    select 1 from public.developer_profile_revisions revision
    where revision.developer_id = new_account.developer_id
      and revision.status in ('pending', 'approved')
      and revision.submitted_at is not null
      and btrim(coalesce(revision.name, '')) <> ''
      and btrim(coalesce(revision.description, '')) <> ''
      and btrim(coalesce(revision.logo_url, '')) <> ''
  ) into profile_is_complete;
  if profile_is_complete then
    raise exception 'Incomplete first-login company profile unexpectedly passed the session gate';
  end if;

  select (public.submit_developer_profile_revision(
    new_account.developer_id,
    new_account.id,
    'New Journey Company',
    'A complete profile submitted from the first-login gate.',
    'https://example.invalid/new-logo.png',
    'Built for better launches'
  )->>'revision_id')::uuid into revision_id;
  select * into new_revision
  from public.developer_profile_revisions
  where id = revision_id;
  if new_revision.status <> 'pending'
     or new_revision.description is null
     or new_revision.logo_url is null
     or new_revision.slogan <> 'Built for better launches' then
    raise exception 'Complete first-login profile revision was not stored';
  end if;
  if exists (
    select 1 from public.developers developer
    where developer.id = new_account.developer_id
      and developer.logo_url = 'https://example.invalid/new-logo.png'
  ) then
    raise exception 'Pending profile revision changed public branding before review';
  end if;
  select exists (
    select 1 from public.developer_profile_revisions revision
    where revision.id = revision_id
      and revision.status = 'pending'
      and revision.submitted_at is not null
      and btrim(coalesce(revision.name, '')) <> ''
      and btrim(coalesce(revision.description, '')) <> ''
      and btrim(coalesce(revision.logo_url, '')) <> ''
  ) into profile_is_complete;
  if not profile_is_complete then
    raise exception 'Complete submitted profile did not unlock the first-login gate';
  end if;
end;
$$;

do $$
declare
  invite_result jsonb;
  activation_result jsonb;
  existing_account public.developer_accounts%rowtype;
  sales_account public.developer_accounts%rowtype;
  project_manager_account public.developer_accounts%rowtype;
  journey_project_id uuid := '94000000-0000-4000-8000-000000000001';
  journey_phase_id uuid;
  default_phase_id uuid;
  journey_other_project_id uuid := '94000000-0000-4000-8000-000000000002';
  journey_other_phase_id uuid;
  unit_type_id uuid;
  event_count integer;
  expected_failure boolean := false;
begin
  -- An existing-company invitation must not overwrite company contact data;
  -- its first additional member is a project manager by the admin-invite
  -- compatibility contract. The explicit team path below chooses sales.
  invite_result := public.create_developer_account_invite(
    '92000000-0000-4000-8000-000000000001',
    'Existing Journey Company',
    'attempted-overwrite@example.invalid',
    '+201099999999',
    false,
    '91000000-0000-4000-8000-000000000003',
    'journey-existing-member@example.invalid',
    '91000000-0000-4000-8000-000000000099',
    'journey-existing-invite-1',
    false,
    null
  );
  select * into existing_account
  from public.developer_accounts
  where auth_user_id = '91000000-0000-4000-8000-000000000003';
  if invite_result->>'action' <> 'developer_account.invite'
     or existing_account.developer_id <> '92000000-0000-4000-8000-000000000001'
     or existing_account.status <> 'pending'
     or existing_account.role <> 'project_manager' then
    raise exception 'Existing-company invitation did not bind a pending project manager member';
  end if;
  if exists (
    select 1 from public.developers developer
    where developer.id = '92000000-0000-4000-8000-000000000001'
      and (developer.contact_email <> 'original-contact@example.invalid'
        or developer.contact_phone <> '+201000000001')
  ) then
    raise exception 'Existing-company invitation overwrote immutable company contact data';
  end if;

  activation_result := public.activate_developer_account_invite(
    '91000000-0000-4000-8000-000000000003',
    'journey-existing-member@example.invalid',
    'Project manager',
    'journey-existing-activation-1'
  );
  if activation_result->>'account_id' <> existing_account.id::text then
    raise exception 'Existing-company member could not activate';
  end if;
  select * into project_manager_account from public.developer_accounts where id = existing_account.id;

  invite_result := public.invite_developer_team_member(
    '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000004',
    'journey-sales-member@example.invalid',
    'sales_manager',
    'journey-sales-invite-1',
    'Sales manager'
  );
  select * into sales_account
  from public.developer_accounts
  where auth_user_id = '91000000-0000-4000-8000-000000000004';
  if invite_result->>'role' <> 'sales_manager'
     or sales_account.developer_id <> '92000000-0000-4000-8000-000000000001'
     or sales_account.status <> 'pending'
     or sales_account.role <> 'sales_manager' then
    raise exception 'Team invitation did not retain its explicit sales manager role or tenant';
  end if;
  invite_result := public.invite_developer_team_member(
    '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000004',
    'journey-sales-member@example.invalid',
    'sales_manager',
    'journey-sales-invite-1',
    'Sales manager'
  );
  if not coalesce((invite_result->>'idempotent')::boolean, false) then
    raise exception 'Repeated team invitation was not idempotent';
  end if;
  activation_result := public.activate_developer_account_invite(
    '91000000-0000-4000-8000-000000000004',
    'journey-sales-member@example.invalid',
    'Sales manager',
    'journey-sales-activation-1'
  );
  if activation_result->>'account_id' <> sales_account.id::text then
    raise exception 'Sales manager team member could not activate';
  end if;
  select * into sales_account from public.developer_accounts where id = sales_account.id;

  if not public.developer_account_has_capability('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'manage_team')
     or not public.developer_account_has_capability(project_manager_account.id, '92000000-0000-4000-8000-000000000001', 'manage_projects')
     or not public.developer_account_has_capability(project_manager_account.id, '92000000-0000-4000-8000-000000000001', 'manage_inventory')
     or not public.developer_account_has_capability(sales_account.id, '92000000-0000-4000-8000-000000000001', 'manage_inventory')
     or not public.developer_account_has_capability(sales_account.id, '92000000-0000-4000-8000-000000000001', 'manage_contacts')
     or public.developer_account_has_capability(sales_account.id, '92000000-0000-4000-8000-000000000001', 'manage_projects')
     or public.developer_account_has_capability(project_manager_account.id, '92000000-0000-4000-8000-000000000001', 'manage_team') then
    raise exception 'Developer role capability matrix is not enforced for the three closed roles';
  end if;

  insert into public.developer_projects(
    id, developer_id, name, description, hero_media, location, project_types,
    approval_status, lifecycle_state, is_demo
  ) values (
    journey_project_id,
    '92000000-0000-4000-8000-000000000001',
    'Journey Project',
    'A complete project used by the journey contract.',
    '{"heroImageUrl":"https://example.invalid/journey-hero.png"}'::jsonb,
    'Journey City',
    array['Apartment'],
    'pending', 'draft', false
  );
  select phase.id into default_phase_id
  from public.developer_project_phases phase
  where phase.project_id = journey_project_id and phase.is_default = true;
  if default_phase_id is null then
    raise exception 'Project creation did not create a default phase';
  end if;

  -- Project managers can create release phases; sales managers cannot.
  journey_phase_id := (public.create_developer_project_phase(
    '92000000-0000-4000-8000-000000000001',
    journey_project_id,
    project_manager_account.id,
    'First public release',
    'The first release phase.',
    2,
    'new_launch',
    current_date + 30,
    '{"heroImageUrl":"https://example.invalid/phase-hero.png"}'::jsonb,
    array['Pool'],
    array['Park views'],
    current_date + 365,
    'selling',
    'https://example.invalid/masterplan.pdf'
  )).id;
  if journey_phase_id is null then
    raise exception 'Project manager could not create a release phase';
  end if;
  begin
    perform public.create_developer_project_phase(
      '92000000-0000-4000-8000-000000000001',
      journey_project_id,
      sales_account.id,
      'Sales cannot create phases', null, null, 'upcoming', null, '{}'::jsonb
    );
    raise exception 'Sales manager unexpectedly created a project phase';
  exception
    when others then
      if sqlerrm = 'Sales manager unexpectedly created a project phase' then raise; end if;
  end;

  -- Team administration and company profile remain super-admin-only.
  begin
    perform public.invite_developer_team_member(
      project_manager_account.id,
      '91000000-0000-4000-8000-000000000006',
      'journey-unauthorized-member@example.invalid',
      'sales_manager',
      'journey-unauthorized-team-invite',
      'Unauthorized'
    );
    raise exception 'Project manager unexpectedly invited a team member';
  exception
    when others then
      if sqlerrm = 'Project manager unexpectedly invited a team member' then raise; end if;
  end;
  begin
    perform public.submit_developer_profile_revision(
      '92000000-0000-4000-8000-000000000001',
      project_manager_account.id,
      'Unauthorized profile',
      'Should fail',
      'https://example.invalid/nope.png'
    );
    raise exception 'Project manager unexpectedly changed the company profile';
  exception
    when others then
      if sqlerrm = 'Project manager unexpectedly changed the company profile' then raise; end if;
  end;

  -- Sales managers own inventory, but every import still has to stay inside
  -- the caller's project and phase tenant boundary.
  perform public.import_developer_project_inventory(
    '92000000-0000-4000-8000-000000000001',
      journey_project_id,
      journey_phase_id,
    sales_account.id,
    '{"baseType":"Sales Villa","category":"Residential","description":"Sales-managed inventory","variants":[{"price":1500000,"areaMin":120,"areaMax":140,"stockCount":3}]}'::jsonb
  );
  if not exists (
    select 1 from public.project_unit_types unit_type
    where unit_type.project_id = journey_project_id
      and unit_type.phase_id = journey_phase_id
      and unit_type.label = 'Sales Villa'
  ) then
    raise exception 'Sales manager inventory import did not retain project and phase scope';
  end if;

  insert into public.developer_projects(
    id, developer_id, name, description, hero_media, location, project_types,
    approval_status, lifecycle_state, is_demo
  ) values (
    journey_other_project_id,
    '92000000-0000-4000-8000-000000000010',
    'Other Tenant Project',
    'A project in another tenant.',
    '{"heroImageUrl":"https://example.invalid/other-hero.png"}'::jsonb,
    'Other City',
    array['Apartment'],
    'pending', 'draft', false
  );
  select id into journey_other_phase_id
  from public.developer_project_phases
  where public.developer_project_phases.project_id = journey_other_project_id and is_default = true;
  begin
    perform public.import_developer_project_inventory(
      '92000000-0000-4000-8000-000000000001',
      journey_project_id,
      journey_other_phase_id,
      project_manager_account.id,
      '{"baseType":"Cross Tenant","variants":[{"price":1700000}]}'::jsonb
    );
    raise exception 'Cross-tenant phase import unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Cross-tenant phase import unexpectedly succeeded' then raise; end if;
  end;
  begin
    insert into public.project_unit_types(
      id, project_id, phase_id, category, label, min_price, description
    ) values (
      '95000000-0000-4000-8000-000000000001',
      journey_project_id,
      journey_other_phase_id,
      'Residential',
      'Cross Tenant Direct Insert',
      1700000,
      'Must fail phase scope'
    );
    raise exception 'Cross-tenant direct unit insert unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Cross-tenant direct unit insert unexpectedly succeeded' then raise; end if;
  end;

  -- The profile gate is shared at company level: an already-complete company
  -- lets its additional active members enter without a duplicate profile.
  if not exists (
    select 1 from public.developers developer
    where developer.id = '92000000-0000-4000-8000-000000000001'
      and btrim(coalesce(developer.name, '')) <> ''
      and btrim(coalesce(developer.description, '')) <> ''
      and btrim(coalesce(developer.logo_url, '')) <> ''
      and developer.lifecycle_state <> 'draft'
  ) then
    raise exception 'Existing complete company did not satisfy the shared profile gate';
  end if;
end;
$$;

-- Approval visibility is tested as an anonymous/mobile reader.  A phase and
-- its unit type remain hidden until the parent project is approved/published;
-- a listing additionally needs the independent listing review decision.
do $$
declare
  journey_visibility_phase_id uuid;
  listing_id uuid := '96000000-0000-4000-8000-000000000001';
  visible_count integer;
begin
  select phase.id into journey_visibility_phase_id
  from public.developer_project_phases phase
  where phase.project_id = '94000000-0000-4000-8000-000000000001'
    and phase.name = 'First public release';
  if journey_visibility_phase_id is null then
    raise exception 'Published journey phase fixture was not found';
  end if;

  insert into public.properties(
    id, developer_id, project_id, phase_id, property_name, property_type,
    unit_area, price, description, photos, is_active, approval_status,
    availability_state, is_demo
  ) values (
    listing_id,
    '92000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    journey_visibility_phase_id,
    'Journey Unit 101',
    'apartment',
    120,
    1500000,
    'A complete listing for mobile review.',
    array[
      'https://example.invalid/journey-1.jpg',
      'https://example.invalid/journey-2.jpg',
      'https://example.invalid/journey-3.jpg'
    ],
    false,
    'pending',
    'available',
    false
  );

  set local role anon;
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into visible_count
  from public.developer_projects
  where id = '94000000-0000-4000-8000-000000000001';
  if visible_count <> 0 then raise exception 'Pending project leaked to anonymous mobile readers'; end if;
  select count(*) into visible_count
  from public.developer_project_phases
  where id = journey_visibility_phase_id;
  if visible_count <> 0 then raise exception 'Pending phase leaked to anonymous mobile readers'; end if;
  select count(*) into visible_count
  from public.project_unit_types
  where public.project_unit_types.phase_id = journey_visibility_phase_id;
  if visible_count <> 0 then raise exception 'Pending phase inventory leaked to anonymous mobile readers'; end if;
  select count(*) into visible_count
  from public.properties
  where id = listing_id;
  if visible_count <> 0 then raise exception 'Pending listing leaked to anonymous mobile readers'; end if;

  set local role service_role;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update public.developer_projects
  set approval_status = 'approved', lifecycle_state = 'published', published_at = now()
  where id = '94000000-0000-4000-8000-000000000001';

  set local role anon;
  perform set_config('request.jwt.claim.role', 'anon', true);
  select count(*) into visible_count
  from public.developer_project_phases
  where id = journey_visibility_phase_id;
  if visible_count <> 1 then raise exception 'Approved project phase did not become visible to mobile readers'; end if;
  select count(*) into visible_count
  from public.project_unit_types
  where project_unit_types.phase_id = journey_visibility_phase_id;
  if visible_count <> 1 then raise exception 'Approved phase inventory did not become visible to mobile readers'; end if;
  select count(*) into visible_count
  from public.properties
  where id = listing_id;
  if visible_count <> 0 then raise exception 'Pending listing became visible before independent listing review'; end if;

  set local role service_role;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.review_property_listing(
    listing_id,
    '91000000-0000-4000-8000-000000000099',
    'approved',
    null
  );
  set local role anon;
  perform set_config('request.jwt.claim.role', 'anon', true);
  select count(*) into visible_count
  from public.properties
  where id = listing_id;
  if visible_count <> 1 then raise exception 'Reviewed listing did not become visible to mobile readers'; end if;
end;
$$;

-- Mobile inquiry -> tenant inbox -> sales response. Publication validation is
-- performed by the mobile API before this service-only RPC; this SQL section
-- verifies its persistence/notification and sales authorization contracts.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.users_profile(
  id, first_name_en, last_name_en, first_name_ar, last_name_ar,
  phone, referral_code, account_status
) values (
  '91000000-0000-4000-8000-000000000005',
  'Journey', 'Requester', 'Journey', 'Requester',
  '+201091000005', 'JOURNEY005', 'active'
);

do $$
declare
  inquiry_id uuid;
  sales_id uuid;
  manager_id uuid;
  other_owner_id uuid;
  response jsonb;
begin
  select id into strict sales_id from public.developer_accounts
  where auth_user_id = '91000000-0000-4000-8000-000000000004';
  select id into strict manager_id from public.developer_accounts
  where auth_user_id = '91000000-0000-4000-8000-000000000003';
  select id into strict other_owner_id from public.developer_accounts
  where auth_user_id = '91000000-0000-4000-8000-000000000001';

  inquiry_id := public.create_developer_contact_request_with_notification(
    '92000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000005',
    'call', 'Please discuss Journey Unit 101.', 'Journey Requester',
    'journey-requester@example.invalid', '+201091000005', 0,
    'Existing Journey Company', 'Journey Project', 'Journey Unit 101'
  );
  perform public.developer_sales_assert_access(
    '92000000-0000-4000-8000-000000000001', sales_id, 'view_contacts'
  );
  -- Mirrors the tenant filter used by fetchDeveloperSalesLeads in the server;
  -- service-role reads alone are not an RLS authorization demonstration.
  if not exists (
    select 1 from public.developer_contact_requests
    where id = inquiry_id
      and developer_id = '92000000-0000-4000-8000-000000000001'
      and status = 'new' and source = 'mobile'
      and requester_user_id = '91000000-0000-4000-8000-000000000005'
  ) then raise exception 'Mobile inquiry did not reach the correct tenant inbox'; end if;
  if exists (
    select 1 from public.developer_contact_requests
    where id = inquiry_id
      and developer_id = '92000000-0000-4000-8000-000000000010'
  ) then raise exception 'Inquiry appeared in another tenant inbox'; end if;
  if (select count(*) from public.developer_notifications
      where contact_request_id = inquiry_id
        and developer_id = '92000000-0000-4000-8000-000000000001'
        and notification_type = 'lead.created') <> 1
     or (select count(*) from public.developer_activity_events
      where entity_id = inquiry_id and event_type = 'lead.created'
        and developer_id = '92000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Mobile inquiry did not create exactly one tenant notification/activity';
  end if;

  begin
    perform public.developer_sales_assert_access(
      '92000000-0000-4000-8000-000000000001', other_owner_id, 'view_contacts'
    );
    raise exception 'Other tenant member unexpectedly gained inbox access';
  exception when others then
    if sqlerrm <> 'Active developer membership with the required capability is required' then raise; end if;
  end;
  begin
    perform public.developer_sales_assert_access(
      '92000000-0000-4000-8000-000000000001', manager_id, 'view_contacts'
    );
    raise exception 'Project manager unexpectedly gained lead PII access';
  exception when others then
    if sqlerrm <> 'Active developer membership with the required capability is required' then raise; end if;
  end;
  begin
    perform public.update_developer_contact_request_sales(
      '92000000-0000-4000-8000-000000000010', inquiry_id, other_owner_id, 'contacted'
    );
    raise exception 'Other tenant unexpectedly changed the inquiry';
  exception when others then
    if sqlerrm <> 'Contact request not found' then raise; end if;
  end;
  if not exists (select 1 from public.developer_contact_requests where id = inquiry_id and status = 'new') then
    raise exception 'Denied inquiry action changed persisted status';
  end if;
  response := public.update_developer_contact_request_sales(
    '92000000-0000-4000-8000-000000000001', inquiry_id, sales_id, 'contacted'
  );
  if not exists (
    select 1 from public.developer_contact_requests
    where id = inquiry_id and status = 'contacted' and first_response_at is not null
  ) then raise exception 'Authorized sales response was not persisted'; end if;
  if not exists (
    select 1 from public.notifications
    where agent_id = '91000000-0000-4000-8000-000000000005'
      and related_entity_id = inquiry_id
  ) then raise exception 'Sales response did not notify the requesting mobile agent'; end if;
end;
$$;

rollback;
