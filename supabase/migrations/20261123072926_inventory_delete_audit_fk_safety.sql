-- Preserve DELETE audit snapshots without inserting stale phase/project FKs.
-- This is intentionally narrow: audit rows are still written, while the
-- developer_id owner remains required so RESTRICT can retain a parent whose
-- newly-created history would otherwise become orphaned.
begin;

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
    developer_id_value := case when tg_op = 'DELETE' then old.developer_id else new.developer_id end;
    project_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
    entity_id_value := project_id_value;
    entity_type_value := 'project';
  elsif tg_table_name = 'developer_project_phases' then
    project_id_value := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
    developer_id_value := (select developer_id from public.developer_projects where id = project_id_value);
    phase_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
    entity_id_value := phase_id_value;
    entity_type_value := 'phase';
  elsif tg_table_name = 'project_unit_types' then
    project_id_value := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
    developer_id_value := (select project.developer_id from public.developer_projects project where project.id = project_id_value);
    phase_id_value := case when tg_op = 'DELETE' then old.phase_id else new.phase_id end;
    entity_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
    entity_type_value := 'unit_type';
  elsif tg_table_name = 'project_unit_variants' then
    select project.developer_id, project.id, unit_type.phase_id
    into developer_id_value, project_id_value, phase_id_value
    from public.project_unit_types unit_type
    join public.developer_projects project on project.id = unit_type.project_id
    where unit_type.id = case when tg_op = 'DELETE' then old.project_unit_type_id else new.project_unit_type_id end;
    entity_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
    entity_type_value := 'unit_variant';
  elsif tg_table_name = 'properties' then
    developer_id_value := case when tg_op = 'DELETE' then old.developer_id else new.developer_id end;
    project_id_value := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
    phase_id_value := case when tg_op = 'DELETE' then old.phase_id else new.phase_id end;
    entity_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
    entity_type_value := 'property';
  elsif tg_table_name = 'developer_inventory_holds' then
    developer_id_value := case when tg_op = 'DELETE' then old.developer_id else new.developer_id end;
    entity_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
    entity_type_value := 'hold';
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- A parent DELETE can invoke child UPDATE triggers while ON DELETE SET NULL
  -- is applied.  Use NEW for every non-DELETE operation, then validate the
  -- references for all operations so no stale parent FK enters the audit log.
  -- DELETE keeps the before image and entity ID, nulling only parents already
  -- gone.  Audit rows and developer ownership are never suppressed.
  if project_id_value is not null
     and not exists (select 1 from public.developer_projects where id = project_id_value) then
    project_id_value := null;
  end if;
  if phase_id_value is not null
     and not exists (select 1 from public.developer_project_phases where id = phase_id_value) then
    phase_id_value := null;
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

revoke all on function public.record_developer_inventory_activity() from public, anon, authenticated;

commit;
