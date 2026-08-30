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
  if has_function_privilege('authenticated', 'public.create_developer_project_phase(uuid,uuid,uuid,text,text,integer,text,date,jsonb)', 'execute') then
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
rollback;
