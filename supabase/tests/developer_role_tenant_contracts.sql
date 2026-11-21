-- Focused production contracts for the closed developer roles, tenant-bound
-- project/inventory writes, atomic workspace batches, and mobile visibility.
begin;

insert into auth.users(id, email)
values
  ('97000000-0000-4000-8000-000000000001', 'role-contract-owner@example.invalid'),
  ('97000000-0000-4000-8000-000000000002', 'role-contract-project@example.invalid'),
  ('97000000-0000-4000-8000-000000000003', 'role-contract-sales@example.invalid'),
  ('97000000-0000-4000-8000-000000000004', 'role-contract-other-owner@example.invalid'),
  ('97000000-0000-4000-8000-000000000005', 'role-contract-agent@example.invalid');

insert into public.users_profile(
  id, first_name_en, last_name_en, first_name_ar, last_name_ar,
  phone, referral_code
)
values (
  '97000000-0000-4000-8000-000000000005', 'Role', 'Agent', 'وكيل', 'اختبار',
  '+201000000005', 'role-agent-5'
);

insert into public.developers(id, name, lifecycle_state, is_active, is_demo, demo_batch)
values
  ('98000000-0000-4000-8000-000000000001', 'Role Contract Developer', 'published', true, false, null),
  ('98000000-0000-4000-8000-000000000002', 'Other Role Contract Developer', 'published', true, false, null),
  ('98000000-0000-4000-8000-000000000003', 'Demo Role Contract Developer', 'draft', true, true, 'dashboard-demo-20260826');

insert into public.developer_accounts(
  id, developer_id, auth_user_id, role, status, email, full_name, activated_at, is_demo
)
values
  ('99000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001', 'developer_super_admin', 'active', 'role-contract-owner@example.invalid', 'Role owner', now(), false),
  ('99000000-0000-4000-8000-000000000002', '98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000002', 'project_manager', 'active', 'role-contract-project@example.invalid', 'Role project manager', now(), false),
  ('99000000-0000-4000-8000-000000000003', '98000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000003', 'sales_manager', 'active', 'role-contract-sales@example.invalid', 'Role sales manager', now(), false),
  ('99000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000004', 'developer_super_admin', 'active', 'role-contract-other-owner@example.invalid', 'Other owner', now(), false);

insert into public.developer_projects(
  id, developer_id, name, description, project_types,
  approval_status, lifecycle_state, is_demo, demo_batch
)
values
  ('9a000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000001', 'Role Contract Project', 'Project-manager scope', array['Apartment'], 'pending', 'draft', false, null),
  ('9a000000-0000-4000-8000-000000000002', '98000000-0000-4000-8000-000000000002', 'Other Tenant Project', 'Cross-tenant scope', array['Apartment'], 'pending', 'draft', false, null),
  ('9a000000-0000-4000-8000-000000000003', '98000000-0000-4000-8000-000000000003', 'Demo Project', 'Demo inheritance scope', array['Apartment'], 'pending', 'draft', true, 'dashboard-demo-20260826');

-- Model a legacy project that was approved before the current publication
-- transition guard; its unpublished lifecycle must still hide child rows.
set local session_replication_role = replica;
update public.developer_projects
set approval_status = 'approved', lifecycle_state = 'draft', published_at = null
where id = '9a000000-0000-4000-8000-000000000002';
insert into public.properties(
  id, project_id, property_name, property_type, unit_area, price,
  description, photos, approval_status, is_active, publication_status,
  availability_state, phase_id
) values (
  '9b000000-0000-4000-8000-000000000002',
  '9a000000-0000-4000-8000-000000000002',
  'Legacy unscoped project row', 'apartment', 100, 1000000,
  'Legacy row used to verify the mobile phase boundary.',
  array['https://example.invalid/legacy-1.jpg', 'https://example.invalid/legacy-2.jpg', 'https://example.invalid/legacy-3.jpg'],
  'approved', true, 'published', 'available', null
);
set local session_replication_role = origin;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  project_phase_id uuid;
  other_phase_id uuid;
  demo_phase_id uuid;
  result jsonb;
  property_name text;
  visible_count integer;
begin
  select id into project_phase_id
  from public.developer_project_phases
  where project_id = '9a000000-0000-4000-8000-000000000001' and is_default = true;
  select id into other_phase_id
  from public.developer_project_phases
  where project_id = '9a000000-0000-4000-8000-000000000002' and is_default = true;
  select id into demo_phase_id
  from public.developer_project_phases
  where project_id = '9a000000-0000-4000-8000-000000000003' and is_default = true;
  if project_phase_id is null or other_phase_id is null or demo_phase_id is null then
    raise exception 'Default phase setup did not preserve project tenant scope';
  end if;

  perform set_config('app.developer_account_id', '', true);
  insert into public.properties(
    id, developer_id, project_id, phase_id, property_name, property_type,
    unit_area, price, description, photos, approval_status, is_active,
    publication_status, availability_state, is_demo, demo_batch
  ) values (
    '9b000000-0000-4000-8000-000000000003',
    '98000000-0000-4000-8000-000000000003',
    '9a000000-0000-4000-8000-000000000003',
    demo_phase_id,
    'Demo inherited unit', 'apartment', 100, 1000000,
    'Demo inventory must inherit its reviewed metadata.',
    array['https://example.invalid/demo-1.jpg', 'https://example.invalid/demo-2.jpg', 'https://example.invalid/demo-3.jpg'],
    'pending', false, 'draft', 'available', false, null
  );
  if not exists (
    select 1 from public.properties property
    where property.id = '9b000000-0000-4000-8000-000000000003'
      and property.is_demo = true
      and property.demo_batch = 'dashboard-demo-20260826'
  ) then
    raise exception 'Project demo metadata was not inherited by imported inventory';
  end if;

  insert into public.properties(
    id, listed_by_agent_id, property_name, property_type, unit_area, price,
    description, photos, approval_status, is_active, publication_status,
    availability_state, published_at, is_demo, demo_batch
  ) values (
    '9b000000-0000-4000-8000-000000000005',
    '97000000-0000-4000-8000-000000000005',
    'Agent demo provenance row', 'apartment', 100, 1000000,
    'Agent resales retain their own demo provenance.',
    array['https://example.invalid/agent-1.jpg', 'https://example.invalid/agent-2.jpg', 'https://example.invalid/agent-3.jpg'],
    'pending', false, 'draft', 'available', null, true, 'dashboard-demo-20260826'
  );
  if not exists (
    select 1 from public.properties property
    where property.id = '9b000000-0000-4000-8000-000000000005'
      and property.is_demo = true
      and property.demo_batch = 'dashboard-demo-20260826'
      and property.listed_by_agent_id = '97000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Agent resale demo metadata was unexpectedly rewritten';
  end if;

  begin
    insert into public.properties(
      id, developer_id, project_id, phase_id, property_name, property_type,
      unit_area, price, description, photos, approval_status, is_active,
      publication_status, availability_state
    ) values (
      '9b000000-0000-4000-8000-000000000004',
      '98000000-0000-4000-8000-000000000002',
      '9a000000-0000-4000-8000-000000000001',
      project_phase_id,
      'Mismatched tenant row', 'apartment', 100, 1000000,
      'This row must be rejected before any insert.',
      array['https://example.invalid/mismatch-1.jpg', 'https://example.invalid/mismatch-2.jpg', 'https://example.invalid/mismatch-3.jpg'],
      'pending', false, 'draft', 'available'
    );
    raise exception 'Mismatched project/developer inventory unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Mismatched project/developer inventory unexpectedly succeeded' then raise; end if;
  end;

  if not public.developer_account_has_capability(
    '99000000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000001',
    'manage_team'
  ) then
    raise exception 'Developer super admin lost manage_team capability';
  end if;
  if not public.developer_account_has_capability(
    '99000000-0000-4000-8000-000000000002',
    '98000000-0000-4000-8000-000000000001',
    'manage_projects'
  ) or public.developer_account_has_capability(
    '99000000-0000-4000-8000-000000000002',
    '98000000-0000-4000-8000-000000000001',
    'manage_contacts'
  ) then
    raise exception 'Project-manager capability boundary is incorrect';
  end if;
  if not public.developer_account_has_capability(
    '99000000-0000-4000-8000-000000000003',
    '98000000-0000-4000-8000-000000000001',
    'manage_contacts'
  ) or public.developer_account_has_capability(
    '99000000-0000-4000-8000-000000000003',
    '98000000-0000-4000-8000-000000000001',
    'manage_projects'
  ) then
    raise exception 'Sales-manager capability boundary is incorrect';
  end if;
  if public.developer_account_has_capability(
    '99000000-0000-4000-8000-000000000002',
    '98000000-0000-4000-8000-000000000002',
    'manage_projects'
  ) then
    raise exception 'Capability check crossed the developer tenant boundary';
  end if;

  if not public.developer_sales_capability_allowed(
    '98000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000003',
    'manage_contacts', null
  ) or public.developer_sales_capability_allowed(
    '98000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000003',
    'view_analytics', '9a000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Sales capability helper granted an excess capability';
  end if;
  if not public.developer_sales_capability_allowed(
    '98000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000002',
    'view_analytics', '9a000000-0000-4000-8000-000000000001'
  ) or public.developer_sales_capability_allowed(
    '98000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000002',
    'view_analytics', '9a000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Project-manager analytics scope crossed its project tenant';
  end if;

  begin
    perform public.create_developer_project_phase(
      '98000000-0000-4000-8000-000000000001',
      '9a000000-0000-4000-8000-000000000001',
      '99000000-0000-4000-8000-000000000003',
      'Sales cannot create phases', null, null, 'upcoming', null, '{}'::jsonb
    );
    raise exception 'Sales manager unexpectedly created a project phase';
  exception when others then
    if sqlerrm = 'Sales manager unexpectedly created a project phase' then raise; end if;
  end;

  perform public.create_developer_project_phase(
    '98000000-0000-4000-8000-000000000001',
    '9a000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000002',
    'Project-manager release', null, null, 'upcoming', null, '{}'::jsonb
  );

  begin
    perform public.create_developer_project_phase(
      '98000000-0000-4000-8000-000000000001',
      '9a000000-0000-4000-8000-000000000002',
      '99000000-0000-4000-8000-000000000002',
      'Cross-tenant release', null, null, 'upcoming', null, '{}'::jsonb
    );
    raise exception 'Project manager unexpectedly created a cross-tenant phase';
  exception when others then
    if sqlerrm = 'Project manager unexpectedly created a cross-tenant phase' then raise; end if;
  end;

  begin
    perform public.import_developer_project_inventory(
      '98000000-0000-4000-8000-000000000001',
      '9a000000-0000-4000-8000-000000000002',
      other_phase_id,
      '99000000-0000-4000-8000-000000000002',
      '{"baseType":"Cross-tenant import","variants":[{"price":1500000}]}'::jsonb
    );
    raise exception 'Cross-tenant inventory import unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Cross-tenant inventory import unexpectedly succeeded' then raise; end if;
  end;

  begin
    perform public.import_developer_project_inventory(
      '98000000-0000-4000-8000-000000000001',
      '9a000000-0000-4000-8000-000000000001',
      project_phase_id,
      '99000000-0000-4000-8000-000000000002',
      '{"baseType":"Atomic broken import","variants":[{"price":1500000},{"price":"not-a-price"}]}'::jsonb
    );
    raise exception 'Malformed project import unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Malformed project import unexpectedly succeeded' then raise; end if;
  end;
  if exists (
    select 1 from public.project_unit_types
    where project_id = '9a000000-0000-4000-8000-000000000001'
      and label = 'Atomic broken import'
  ) then
    raise exception 'Malformed project import left a partial unit type behind';
  end if;

  select public.import_developer_inventory_rows(
    '98000000-0000-4000-8000-000000000001',
    '9a000000-0000-4000-8000-000000000001',
    project_phase_id,
    '99000000-0000-4000-8000-000000000003',
    jsonb_build_array(
      jsonb_build_object(
        'row', 2,
        'property_name', 'Atomic valid row',
        'property_type', 'apartment',
        'price', '1000000',
        'unit_area', '100',
        'description', 'A valid row that must roll back with the batch',
        'photos', jsonb_build_array('https://example.invalid/atomic-1.jpg', 'https://example.invalid/atomic-2.jpg', 'https://example.invalid/atomic-3.jpg')
      ),
      jsonb_build_object(
        'row', 3,
        'property_name', '',
        'property_type', 'apartment',
        'price', '1000000',
        'unit_area', '100',
        'description', 'Invalid row',
        'photos', jsonb_build_array('https://example.invalid/atomic-invalid.jpg')
      )
    ),
    false
  ) into result;
  if coalesce((result->>'rows_saved')::integer, -1) <> 0
     or jsonb_array_length(coalesce(result->'errors', '[]'::jsonb)) = 0 then
    raise exception 'Mixed inventory import did not return an atomic failure result: %', result;
  end if;
  if exists (
    select 1 from public.properties property
    where property.project_id = '9a000000-0000-4000-8000-000000000001'
      and property.phase_id = project_phase_id
      and property.property_name = 'Atomic valid row'
  ) then
    raise exception 'Mixed inventory import committed a valid row beside an invalid row';
  end if;

  perform set_config('app.developer_account_id', '99000000-0000-4000-8000-000000000002', true);
  insert into public.properties(
    id, developer_id, project_id, phase_id, property_name, property_type,
    unit_area, price, description, photos, approval_status, is_active,
    publication_status, availability_state
  ) values (
    '9b000000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000001',
    '9a000000-0000-4000-8000-000000000001',
    project_phase_id,
    'Atomic bulk row', 'apartment', 100, 1000000,
    'A bulk row that must not partially update.',
    array['https://example.invalid/bulk-1.jpg', 'https://example.invalid/bulk-2.jpg', 'https://example.invalid/bulk-3.jpg'],
    'pending', false, 'draft', 'available'
  );

  select public.bulk_update_developer_inventory(
    '98000000-0000-4000-8000-000000000001',
    '9a000000-0000-4000-8000-000000000001',
    project_phase_id,
    '99000000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object('id', '9b000000-0000-4000-8000-000000000001', 'property_name', 'Atomic bulk renamed', 'price', '1100000', 'unit_area', '100', 'availability_state', 'available'),
      jsonb_build_object('id', '9c000000-0000-4000-8000-000000000001', 'property_name', 'Missing row', 'price', '1100000', 'unit_area', '100', 'availability_state', 'available')
    ),
    false
  ) into result;
  if coalesce((result->>'updated_count')::integer, -1) <> 0
     or jsonb_array_length(coalesce(result->'errors', '[]'::jsonb)) = 0 then
    raise exception 'Mixed bulk update did not return an atomic failure result: %', result;
  end if;
  select property.property_name into property_name
  from public.properties property
  where property.id = '9b000000-0000-4000-8000-000000000001';
  if property_name <> 'Atomic bulk row' then
    raise exception 'Mixed bulk update committed a valid row beside an invalid row';
  end if;

end;
$$;


reset role;
do $$
begin
  update public.developer_projects set lifecycle_state='archived', publication_status='draft', published_at=null
  where id='9a000000-0000-4000-8000-000000000001';
  if not exists(select 1 from public.developer_projects where id='9a000000-0000-4000-8000-000000000001' and lifecycle_state='archived' and published_at is null) then
    raise exception 'Archive was silently reverted by publication synchronization';
  end if;
  update public.developer_projects set lifecycle_state='draft', publication_status='draft', approval_status='pending', published_at=null
  where id='9a000000-0000-4000-8000-000000000001' and lifecycle_state='archived';
  if not exists(select 1 from public.developer_projects where id='9a000000-0000-4000-8000-000000000001' and lifecycle_state='draft' and publication_status='draft' and published_at is null) then
    raise exception 'Archived project restore did not remain a draft';
  end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.properties
  where id = '9b000000-0000-4000-8000-000000000002';
  if visible_count <> 0 then
    raise exception 'Unpublished phase-less project inventory leaked through mobile RLS';
  end if;
end;
$$;

rollback;
