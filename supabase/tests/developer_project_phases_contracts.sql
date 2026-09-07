begin;

insert into auth.users(id, email)
values ('77777777-7777-4777-8777-777777777777', 'developer-phases-contract@example.invalid');

insert into public.developers(
  id, name, lifecycle_state, published_at, is_active, is_demo
)
values (
  '88888888-8888-4888-8888-888888888888',
  'Phase Contract Developer', 'published', now(), true, false
);

insert into public.developer_accounts(
  id, developer_id, auth_user_id, role, status, email, activated_at, is_demo
)
values (
  '99999999-9999-4999-8999-999999999999',
  '88888888-8888-4888-8888-888888888888',
  '77777777-7777-4777-8777-777777777777',
  'project_manager', 'active', 'developer-phases-contract@example.invalid', now(), false
);

insert into public.developer_projects(
  id, developer_id, name, description, location, project_types,
  launch_status, approval_status, lifecycle_state, published_at, is_demo
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '88888888-8888-4888-8888-888888888888',
  'Phase Contract Project', 'A project used by the phase contract.',
  'Contract City', array['Apartment'], 'upcoming', 'pending', 'draft', null, false
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  phase_count integer;
  default_phase_id uuid;
begin
  select count(*)
  into phase_count
  from public.developer_project_phases
  where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  select id
  into default_phase_id
  from public.developer_project_phases
  where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and is_default = true
  limit 1;
  if phase_count <> 1 or default_phase_id is null then
    raise exception 'New projects must receive one default compatibility phase';
  end if;
  if not has_table_privilege('anon', 'public.developer_project_phases', 'select') then
    raise exception 'Mobile readers must be able to evaluate the phase read policy';
  end if;
  if has_function_privilege('authenticated', 'public.create_developer_project_phase(uuid,uuid,uuid,text,text,integer,text,date,jsonb,text[],text[],date,text,text)', 'execute') then
    raise exception 'Authenticated clients must not call the phase mutation RPC';
  end if;
end;
$$;

select (public.create_developer_project_phase(
  '88888888-8888-4888-8888-888888888888',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '99999999-9999-4999-8999-999999999999',
  'Garden release',
  'A later release with its own inventory.',
  2,
  'new_launch',
  current_date + 30,
  '{"heroImageUrl":"https://example.invalid/garden.jpg"}'::jsonb
)).id as created_phase_id;

do $$
declare
  phase_uuid uuid;
  phase_project_id uuid;
  archived_at_value timestamptz;
  archived_phase public.developer_project_phases%rowtype;
begin
  select id
  into phase_uuid
  from public.developer_project_phases
  where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and name = 'Garden release';
  if phase_uuid is null then
    raise exception 'Created phase could not be found for the contract';
  end if;
  select project_id into phase_project_id
  from public.developer_project_phases
  where id = phase_uuid;
  if phase_project_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'Created phase was not scoped to the requested project';
  end if;

  insert into public.project_unit_types(
    id, project_id, phase_id, category, label, min_price, description
  ) values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', phase_uuid,
    'Residential', 'Apartment', 1000000, 'Phase-scoped unit type'
  );

  if not exists (
    select 1 from public.project_unit_types
    where project_unit_types.id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and project_unit_types.phase_id = phase_uuid
  ) then
    raise exception 'Unit inventory did not retain its explicit phase scope';
  end if;

  perform public.import_developer_project_inventory(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    phase_uuid,
    '99999999-9999-4999-8999-999999999999',
    '{"baseType":"Villa","category":"Residential","finishingStatus":"finished","description":"Imported phase inventory","variants":[{"price":1500000,"bedrooms":2,"bathrooms":2,"areaMin":120,"areaMax":140,"downPayment":10,"installmentYears":5,"stockCount":4,"hasGarden":true,"amenities":["garden"]}]}'::jsonb
  );
  if not exists (
    select 1
    from public.project_unit_types unit_type
    join public.project_unit_variants variant on variant.project_unit_type_id = unit_type.id
    where unit_type.phase_id = phase_uuid and unit_type.label = 'Villa'
  ) then
    raise exception 'Atomic inventory import did not create its type and variant';
  end if;

  begin
    perform public.import_developer_project_inventory(
      '88888888-8888-4888-8888-888888888888',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      phase_uuid,
      '99999999-9999-4999-8999-999999999999',
      '{"baseType":"Broken","variants":[{"price":1700000},{"price":"not-a-price"}]}'::jsonb
    );
    raise exception 'Invalid import rows must abort the entire batch';
  exception
    when others then
      if sqlerrm = 'Invalid import rows must abort the entire batch' then raise; end if;
  end;
  if exists (
    select 1 from public.project_unit_types
    where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and label = 'Broken'
  ) then
    raise exception 'Invalid import left a partial unit type behind';
  end if;

  archived_phase := public.archive_developer_project_phase(
    '88888888-8888-4888-8888-888888888888', phase_uuid, '99999999-9999-4999-8999-999999999999'
  );
  archived_at_value := archived_phase.archived_at;
  if archived_at_value is null then
    raise exception 'Phase archive did not set archived_at';
  end if;

  if exists (
    select 1 from public.project_unit_types
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and archived_at is not null
  ) then
    raise exception 'Archiving a phase must retain its inventory';
  end if;

  perform public.restore_developer_project_phase(
    '88888888-8888-4888-8888-888888888888', phase_uuid, '99999999-9999-4999-8999-999999999999'
  );
  if exists (
    select 1 from public.developer_project_phases
    where id = phase_uuid and archived_at is not null
  ) then
    raise exception 'Phase restore did not clear archived_at';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.create_developer_project_phase(
      '88888888-8888-4888-8888-888888888888',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '99999999-9999-4999-8999-999999999999',
      'Garden release', null, null, 'upcoming', null, '{}'::jsonb
    );
    raise exception 'Duplicate active phase names must be rejected';
  exception
    when others then
      if sqlerrm = 'Duplicate active phase names must be rejected' then raise; end if;
  end;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  saved public.developer_project_phases%rowtype;
  signature text;
  saved_version_id uuid;
  template_id uuid;
  cloned_project_id uuid;
begin
  foreach signature in array array[
    'public.create_developer_project_phase(uuid,uuid,uuid,text,text,integer,text,date,jsonb,text[],text[],date,text,text)',
    'public.update_developer_project_phase(uuid,uuid,uuid,text,text,integer,text,date,jsonb,text[],text[],date,text,text)'
  ] loop
    if has_function_privilege('anon', signature, 'execute')
      or has_function_privilege('authenticated', signature, 'execute')
      or not has_function_privilege('service_role', signature, 'execute') then
      raise exception 'Merchandising RPC grants must remain service-only';
    end if;
  end loop;
  saved := public.create_developer_project_phase(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '99999999-9999-4999-8999-999999999999',
    'Merchandising release', p_facilities => array['Pool'],
    p_selling_points => array['Lake views'], p_delivery_date => date '2028-09-01',
    p_sales_status => 'selling', p_masterplan_url => 'https://example.invalid/masterplan.pdf'
  );
  if saved.facilities <> array['Pool'] or saved.selling_points <> array['Lake views']
    or saved.delivery_date <> date '2028-09-01' or saved.sales_status <> 'selling'
    or saved.masterplan_url <> 'https://example.invalid/masterplan.pdf' then
    raise exception 'Phase merchandising must round-trip through creation';
  end if;
  saved := public.update_developer_project_phase(
    '88888888-8888-4888-8888-888888888888', saved.id,
    '99999999-9999-4999-8999-999999999999', 'Merchandising release renamed'
  );
  if saved.facilities <> array['Pool'] or saved.selling_points <> array['Lake views']
    or saved.delivery_date <> date '2028-09-01' or saved.sales_status <> 'selling'
    or saved.masterplan_url <> 'https://example.invalid/masterplan.pdf' then
    raise exception 'Legacy updates must preserve omitted merchandising';
  end if;
  saved := public.update_developer_project_phase(
    '88888888-8888-4888-8888-888888888888', saved.id,
    '99999999-9999-4999-8999-999999999999', saved.name,
    p_facilities => '{}'::text[], p_selling_points => '{}'::text[],
    p_delivery_date => null, p_masterplan_url => null, p_sales_status => 'paused'
  );
  if saved.facilities <> '{}'::text[] or saved.selling_points <> '{}'::text[]
    or saved.delivery_date is not null or saved.masterplan_url is not null
    or saved.sales_status <> 'paused' then
    raise exception 'Explicit clears must remove optional merchandising';
  end if;
  begin
    perform public.update_developer_project_phase(
      '88888888-8888-4888-8888-888888888888', saved.id,
      '99999999-9999-4999-8999-999999999999', 'Invalid status', p_sales_status => 'invalid'
    );
    raise exception 'Invalid sales status was accepted';
  exception when others then
    if sqlerrm <> 'Invalid phase sales status' then raise; end if;
  end;
  if (select name from public.developer_project_phases where id = saved.id) <> saved.name then
    raise exception 'Failed phase writes must be atomic';
  end if;
  select id into saved_version_id from public.developer_inventory_versions
  where entity_id = saved.id and entity_type = 'phase' and snapshot->>'sales_status' = 'selling'
  order by version desc limit 1;
  if saved_version_id is null then raise exception 'Merchandising must be captured in version history'; end if;
  perform public.restore_developer_inventory_version(
    '88888888-8888-4888-8888-888888888888', saved_version_id,
    '99999999-9999-4999-8999-999999999999'
  );
  select * into saved from public.developer_project_phases where id = saved.id;
  if saved.facilities <> array['Pool'] or saved.selling_points <> array['Lake views']
    or saved.delivery_date <> date '2028-09-01' or saved.sales_status <> 'selling'
    or saved.masterplan_url <> 'https://example.invalid/masterplan.pdf' then
    raise exception 'Phase version restoration must restore merchandising';
  end if;
  update public.developer_projects set selling_points = array['Connected community'], delivery_date = date '2029-01-01'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  select id into saved_version_id from public.developer_inventory_versions
  where entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and entity_type = 'project'
    and snapshot->>'delivery_date' = '2029-01-01' order by version desc limit 1;
  if saved_version_id is null then raise exception 'Project merchandising must be versioned'; end if;
  update public.developer_projects set selling_points = '{}'::text[], delivery_date = null
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform public.restore_developer_inventory_version(
    '88888888-8888-4888-8888-888888888888', saved_version_id,
    '99999999-9999-4999-8999-999999999999'
  );
  select (public.save_developer_project_template(
    '88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999',
    'project', 'Merchandising template', to_jsonb(project) || jsonb_build_object('phases', jsonb_build_array(
      to_jsonb(saved) || jsonb_build_object('is_default', true),
      to_jsonb(saved) || jsonb_build_object('name', 'Second merchandising phase', 'phase_order', 20, 'is_default', false)
    )), project.id, null, null
  )).id into template_id from public.developer_projects project
  where project.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  cloned_project_id := public.clone_developer_project_from_template(
    '88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999',
    template_id, 'Cloned merchandising project'
  );
  if not exists (select 1 from public.developer_projects where id = cloned_project_id
    and selling_points = array['Connected community'] and delivery_date = date '2029-01-01') then
    raise exception 'Project template clones must retain merchandising';
  end if;
  if (select count(*) from public.developer_project_phases where project_id = cloned_project_id
    and facilities = array['Pool'] and selling_points = array['Lake views']
    and delivery_date = date '2028-09-01' and sales_status = 'selling'
    and masterplan_url = 'https://example.invalid/masterplan.pdf') <> 2 then
    raise exception 'Default and additional template phases must retain merchandising';
  end if;
end;
$$;

reset role;
rollback;
