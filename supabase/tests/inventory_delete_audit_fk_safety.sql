-- Rollback-only regression test for the delete-audit FK migration.
-- Uses normal triggers and constraints; no trigger suppression.
\set ON_ERROR_STOP on
begin;

do $$
declare
  dev uuid := extensions.uuid_generate_v4();
  project uuid := extensions.uuid_generate_v4();
  phase uuid;
  unit_type uuid := extensions.uuid_generate_v4();
  variant uuid := extensions.uuid_generate_v4();
  property uuid := extensions.uuid_generate_v4();
  n integer;
begin
  insert into public.developers(id, name, is_demo, demo_batch)
  values (dev, 'audit-fk-' || replace(dev::text, '-', ''), false, null);
  insert into public.developer_projects(id, developer_id, name, is_demo, demo_batch, created_at, updated_at)
  values (project, dev, 'audit-fk-project', false, null, now() - interval '30 days', now() - interval '30 days');
  select id into strict phase from public.developer_project_phases
  where project_id = project order by is_default desc, created_at limit 1;

  insert into public.project_unit_types(id, project_id, phase_id, label, min_price, created_at, updated_at)
  values (unit_type, project, phase, 'audit-fk-unit-type', 100000, now() - interval '30 days', now() - interval '30 days');
  insert into public.project_unit_variants(id, project_unit_type_id, min_price)
  values (variant, unit_type, 100000);
  insert into public.properties(
    id, developer_id, project_id, phase_id, property_name, property_type,
    unit_area, price, description, photos, is_demo, approval_status, is_active,
    created_at, updated_at
  ) values (
    property, dev, project, phase, 'audit-fk-property', 'apartment', 100, 100000,
    'audit FK fixture', array['audit-a', 'audit-b', 'audit-c'], false, 'pending', false,
    now() - interval '30 days', now() - interval '30 days'
  );

  -- UPDATE must use NEW rather than coalesce(NEW, OLD).  The scope trigger
  -- clears phase_id when project_id is cleared.
  update public.properties set project_id = null where id = property;
  if not exists (
    select 1 from public.developer_inventory_activity
    where entity_type = 'property' and entity_id = property and action = 'updated'
      and project_id is null and phase_id is null
      and metadata->'after'->>'project_id' is null
      and metadata->'after'->>'phase_id' is null
  ) then raise exception 'property UPDATE retained stale nullable parent FK'; end if;
  update public.properties set project_id = project, phase_id = phase where id = property;

  -- Price history is a real RESTRICT child; model the reviewed child-first
  -- cleanup order before deleting the property.
  delete from public.developer_property_price_history where property_id = property;
  delete from public.properties where id = property;
  if not exists (
    select 1 from public.developer_inventory_activity
    where entity_type = 'property' and entity_id = property and action = 'deleted'
      and project_id = project and phase_id = phase
      and metadata->'before'->>'id' = property::text
  ) then raise exception 'property DELETE audit snapshot/FKs incorrect'; end if;
  if not exists (
    select 1 from public.developer_inventory_versions
    where entity_type = 'property' and entity_id = property and change_summary = 'Deleted'
      and developer_id = dev and snapshot->>'id' = property::text
  ) then raise exception 'property DELETE version snapshot/owner missing'; end if;

  delete from public.project_unit_variants where id = variant;
  if not exists (
    select 1 from public.developer_inventory_activity
    where entity_type = 'unit_variant' and entity_id = variant and action = 'deleted'
      and project_id = project and phase_id = phase
      and metadata->'before'->>'id' = variant::text
  ) then raise exception 'unit variant DELETE audit snapshot/FKs incorrect'; end if;

  delete from public.project_unit_types where id = unit_type;
  if not exists (
    select 1 from public.developer_inventory_activity
    where entity_type = 'unit_type' and entity_id = unit_type and action = 'deleted'
      and project_id = project and phase_id = phase
      and metadata->'before'->>'id' = unit_type::text
  ) then raise exception 'unit type DELETE audit snapshot/FKs incorrect'; end if;

  delete from public.developer_project_phases where id = phase;
  if not exists (
    select 1 from public.developer_inventory_activity
    where entity_type = 'phase' and entity_id = phase and action = 'deleted'
      and project_id = project and phase_id is null
      and metadata->'before'->>'id' = phase::text
  ) then raise exception 'phase DELETE did not preserve before snapshot/null deleted FK'; end if;
  select count(*) into n from public.developer_inventory_activity where phase_id = phase;
  if n <> 0 then raise exception 'ON DELETE SET NULL left % phase audit references', n; end if;

  delete from public.developer_projects where id = project;
  if not exists (
    select 1 from public.developer_inventory_activity
    where entity_type = 'project' and entity_id = project and action = 'deleted'
      and project_id is null and metadata->'before'->>'id' = project::text
  ) then raise exception 'project DELETE did not preserve before snapshot/null deleted FK'; end if;
  select count(*) into n from public.developer_inventory_activity where project_id = project;
  if n <> 0 then raise exception 'ON DELETE SET NULL left % project audit references', n; end if;

  -- DELETE audit/version rows retain ownership intentionally.  Never relax
  -- the existing developer RESTRICT FKs to make this parent disappear.
  begin
    delete from public.developers where id = dev;
    raise exception 'developer DELETE unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
  if not exists (select 1 from public.developers where id = dev) then
    raise exception 'developer owner disappeared despite RESTRICT history';
  end if;
end;
$$;

do $$
declare
  dev uuid := extensions.uuid_generate_v4();
  project uuid := extensions.uuid_generate_v4();
  phase uuid;
  unit_type uuid := extensions.uuid_generate_v4();
  failed boolean := false;
begin
  insert into public.developers(id, name, is_demo, demo_batch)
  values (dev, 'audit-fk-cascade-' || replace(dev::text, '-', ''), false, null);
  insert into public.developer_projects(id, developer_id, name, is_demo, demo_batch)
  values (project, dev, 'audit-fk-cascade-project', false, null);
  select id into strict phase from public.developer_project_phases
  where project_id = project limit 1;
  insert into public.project_unit_types(id, project_id, phase_id, label, min_price)
  values (unit_type, project, phase, 'audit-fk-cascade-unit-type', 100000);

  -- The schema has a project->unit_type CASCADE, but the existing version
  -- trigger requires a non-null developer owner after the parent disappears.
  -- Keep this parent delete fail-closed; the cleanup renderer must delete
  -- children first, as the preceding test does.
  begin
    delete from public.developer_projects where id = project;
  exception when not_null_violation or foreign_key_violation then
    failed := true;
  end;
  if not failed then raise exception 'direct project cascade unexpectedly bypassed audit ownership'; end if;
  if not exists (select 1 from public.developer_projects where id = project)
     or not exists (select 1 from public.project_unit_types where id = unit_type) then
    raise exception 'failed direct project cascade was not atomic';
  end if;
end;
$$;

rollback;
