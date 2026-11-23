-- Rollback-only renderer guard fixture.  It uses normal triggers and
-- constraints: an old approved child may be deleted, but a retained sibling
-- mutation must abort the same transaction and restore the child.
\set ON_ERROR_STOP on
begin;

do $$
declare
  cutoff timestamptz := clock_timestamp() - interval '7 days';
  dev uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  project uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  phase uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  old_property uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  recent_property uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  recent_fingerprint text;
  expected_error boolean := false;
begin
  insert into public.demo_data_batches(batch_key, label)
  values ('cleanup-blocker-snapshot-batch', 'cleanup blocker snapshot fixture');
  insert into public.developers(id, name, is_demo, demo_batch, created_at, updated_at)
  values (dev, 'cleanup-blocker-snapshot-developer', true, 'cleanup-blocker-snapshot-batch', cutoff - interval '30 days', cutoff - interval '30 days');
  insert into public.developer_projects(id, developer_id, name, is_demo, demo_batch, created_at, updated_at)
  values (project, dev, 'cleanup-blocker-snapshot-project', true, 'cleanup-blocker-snapshot-batch', cutoff - interval '30 days', cutoff - interval '30 days');
  insert into public.developer_project_phases(id, project_id, name, phase_order, created_at, updated_at)
  values (phase, project, 'cleanup-blocker-snapshot-phase', 2, cutoff - interval '30 days', cutoff - interval '30 days');
  insert into public.properties(
    id, developer_id, project_id, phase_id, property_name, property_type,
    unit_area, price, description, photos, is_demo, demo_batch, approval_status,
    is_active, created_at, updated_at
  ) values (
    old_property, dev, project, phase, 'cleanup-old-child', 'apartment', 100, 100000,
    'old child', array['a', 'b', 'c'], true, 'cleanup-blocker-snapshot-batch',
    'pending', false, cutoff - interval '30 days', cutoff - interval '30 days'
  );
  insert into public.properties(
    id, developer_id, project_id, phase_id, property_name, property_type,
    unit_area, price, description, photos, is_demo, demo_batch, approval_status,
    is_active, created_at, updated_at
  ) values (
    recent_property, dev, project, phase, 'cleanup-recent-sibling', 'apartment', 100, 100000,
    'recent sibling', array['a', 'b', 'c'], true, 'cleanup-blocker-snapshot-batch',
    'pending', false, cutoff + interval '1 hour', cutoff + interval '1 hour'
  );

  create temp table demo_cleanup_blocker_fixture_snapshot(
    row_id uuid primary key,
    fingerprint text not null
  ) on commit drop;
  select md5(to_jsonb(property_row)::text)
    into recent_fingerprint
  from public.properties property_row
  where property_row.id = recent_property;
  insert into demo_cleanup_blocker_fixture_snapshot values (recent_property, recent_fingerprint);

  -- The old child is independently deletable after its real RESTRICT history
  -- child is removed in the reviewed child-first order.
  delete from public.developer_property_price_history where property_id = old_property;
  delete from public.properties where id = old_property;
  if exists (select 1 from public.properties where id = old_property) then
    raise exception 'approved old child delete was not allowed';
  end if;

  -- Recreate the candidate for the rollback assertion.  A retained sibling
  -- mutation must trip the snapshot guard and restore both rows.
  insert into public.properties(
    id, developer_id, project_id, phase_id, property_name, property_type,
    unit_area, price, description, photos, is_demo, demo_batch, approval_status,
    is_active, created_at, updated_at
  ) values (
    old_property, dev, project, phase, 'cleanup-old-child', 'apartment', 100, 100000,
    'old child', array['a', 'b', 'c'], true, 'cleanup-blocker-snapshot-batch',
    'pending', false, cutoff - interval '30 days', cutoff - interval '30 days'
  );
  begin
    delete from public.developer_property_price_history where property_id = old_property;
    delete from public.properties where id = old_property;
    update public.properties set description = 'mutated recent sibling' where id = recent_property;
    if exists (
      select 1
      from demo_cleanup_blocker_fixture_snapshot snapshot
      join public.properties property_row on property_row.id = snapshot.row_id
      where md5(to_jsonb(property_row)::text) is distinct from snapshot.fingerprint
    ) then
      raise exception 'recent blocker changed';
    end if;
  exception
    when others then
      if sqlerrm <> 'recent blocker changed' then raise; end if;
      expected_error := true;
  end;
  if not expected_error then raise exception 'recent blocker mutation did not trip rollback guard'; end if;
  if not exists (select 1 from public.properties where id = old_property) then
    raise exception 'child delete was not rolled back';
  end if;
  if (
    select md5(to_jsonb(property_row)::text)
    from public.properties property_row
    where property_row.id = recent_property
  ) is distinct from recent_fingerprint then
    raise exception 'recent sibling mutation was not rolled back';
  end if;
end;
$$;

rollback;
