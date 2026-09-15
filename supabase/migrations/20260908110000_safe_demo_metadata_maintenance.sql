-- Demo classification is metadata maintenance, never a business reward event.
-- No rows are classified by this migration. Apply reviewed exact-ID updates
-- under SET LOCAL ROLE service_role, with hashes/locks in the maintenance plan.
begin;

create or replace function public.guard_demo_metadata_maintenance()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.is_demo is not distinct from old.is_demo
     and new.demo_batch is not distinct from old.demo_batch then
    return new;
  end if;
  -- Read the actual SET ROLE value, not caller-controlled JWT claims.
  if current_setting('role', true) is distinct from 'service_role'
     or not (to_jsonb(new) - array['is_demo', 'demo_batch', 'updated_at']
       = to_jsonb(old) - array['is_demo', 'demo_batch', 'updated_at']) then
    raise exception 'Demo metadata requires service-role flag-only maintenance';
  end if;
  if (new.is_demo and (new.demo_batch is null or not exists (
      select 1 from public.demo_data_batches
      where batch_key = new.demo_batch and status = 'active'
    ))) or (not new.is_demo and new.demo_batch is not null) then
    raise exception 'Demo metadata requires an active batch or cleared flags';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_demo_metadata_maintenance() from public, anon, authenticated;

create trigger properties_demo_metadata_guard
before update of is_demo, demo_batch on public.properties
for each row execute function public.guard_demo_metadata_maintenance();

create trigger deals_demo_metadata_guard
before update of is_demo, demo_batch on public.deals
for each row execute function public.guard_demo_metadata_maintenance();

create trigger deal_stage_entries_demo_metadata_guard
before update of is_demo, demo_batch on public.deal_stage_entries
for each row execute function public.guard_demo_metadata_maintenance();

create trigger developer_accounts_demo_metadata_guard
before update of is_demo, demo_batch on public.developer_accounts
for each row execute function public.guard_demo_metadata_maintenance();

CREATE OR REPLACE FUNCTION public.trigger_eval_gift_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  new_agent_id uuid;
  old_agent_id uuid;
begin
  if tg_op = 'UPDATE' then
    if (new.is_demo is distinct from old.is_demo
        or new.demo_batch is distinct from old.demo_batch)
       and to_jsonb(new) - array['is_demo', 'demo_batch', 'updated_at']
       = to_jsonb(old) - array['is_demo', 'demo_batch', 'updated_at'] then
      return new;
    end if;
  end if;
  if tg_table_name = 'users_profile' then
    new_agent_id := new.id;
    if tg_op = 'UPDATE' then
      old_agent_id := old.id;
    end if;
  else
    new_agent_id := nullif(to_jsonb(new)->>'agent_id', '')::uuid;
    if tg_op = 'UPDATE' then
      old_agent_id := nullif(to_jsonb(old)->>'agent_id', '')::uuid;
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') and new_agent_id is not null then
    perform public.evaluate_gift_rules_for_agent(new_agent_id);
  end if;

  if tg_op = 'UPDATE' and old_agent_id is not null and old_agent_id <> new_agent_id then
    perform public.evaluate_gift_rules_for_agent(old_agent_id);
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_eval_admin_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if tg_op = 'UPDATE' then
    if (new.is_demo is distinct from old.is_demo
        or new.demo_batch is distinct from old.demo_batch)
       and to_jsonb(new) - array['is_demo', 'demo_batch', 'updated_at']
       = to_jsonb(old) - array['is_demo', 'demo_batch', 'updated_at'] then
      return new;
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    if new.agent_id is not null then
      perform public.evaluate_admin_rules_for_agent(new.agent_id);
    end if;
  end if;
  if tg_op = 'UPDATE' and old.agent_id is not null and old.agent_id <> new.agent_id then
    perform public.evaluate_admin_rules_for_agent(old.agent_id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_eval_gift_rules_properties()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if tg_op = 'UPDATE' then
    if (new.is_demo is distinct from old.is_demo
        or new.demo_batch is distinct from old.demo_batch)
       and to_jsonb(new) - array['is_demo', 'demo_batch', 'updated_at']
       = to_jsonb(old) - array['is_demo', 'demo_batch', 'updated_at'] then
      return new;
    end if;
  end if;
  if new.listed_by_agent_id is not null then
    perform public.evaluate_gift_rules_for_agent(new.listed_by_agent_id);
  end if;
  if tg_op = 'UPDATE' and old.listed_by_agent_id is not null and old.listed_by_agent_id <> new.listed_by_agent_id then
    perform public.evaluate_gift_rules_for_agent(old.listed_by_agent_id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_eval_admin_rules_properties()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if tg_op = 'UPDATE' then
    if (new.is_demo is distinct from old.is_demo
        or new.demo_batch is distinct from old.demo_batch)
       and to_jsonb(new) - array['is_demo', 'demo_batch', 'updated_at']
       = to_jsonb(old) - array['is_demo', 'demo_batch', 'updated_at'] then
      return new;
    end if;
  end if;
  if new.listed_by_agent_id is not null then
    perform public.evaluate_admin_rules_for_agent(new.listed_by_agent_id);
  end if;
  if tg_op = 'UPDATE' and old.listed_by_agent_id is not null and old.listed_by_agent_id <> new.listed_by_agent_id then
    perform public.evaluate_admin_rules_for_agent(old.listed_by_agent_id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_developer_account_tenant_and_super_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  -- Serialize every membership mutation for a company on its parent row.
  -- Without this lock, two concurrent final-admin checks can each observe
  -- the other administrator as a replacement and both commit.
  perform 1
  from public.developers developer
  where developer.id = old.developer_id
  for update;

  if tg_op = 'DELETE' then
    if coalesce(old.is_demo, false) then
      return old;
    end if;
    if old.status = 'active'
       and old.role = 'developer_super_admin'
       and not exists (
         select 1
         from public.developer_accounts replacement
         where replacement.developer_id = old.developer_id
           and replacement.id <> old.id
           and replacement.status = 'active'
           and replacement.role = 'developer_super_admin'
       ) then
      raise exception 'Cannot remove the final active developer super admin';
    end if;
    return old;
  end if;

  if new.developer_id is distinct from old.developer_id
     or new.auth_user_id is distinct from old.auth_user_id
     or ((new.is_demo is distinct from old.is_demo
          or new.demo_batch is distinct from old.demo_batch)
         and (current_setting('role', true) is distinct from 'service_role'
              or not (to_jsonb(new) - array['is_demo', 'demo_batch', 'updated_at']
       = to_jsonb(old) - array['is_demo', 'demo_batch', 'updated_at']))) then
    raise exception 'Developer membership tenant, identity, and demo fields are immutable';
  end if;
  if new.role not in ('developer_super_admin', 'project_manager', 'sales_manager') then
    raise exception 'Unsupported developer membership role';
  end if;
  if not coalesce(old.is_demo, false)
     and old.status = 'active'
     and old.role = 'developer_super_admin'
     and (new.status <> 'active' or new.role <> 'developer_super_admin')
     and not exists (
       select 1
       from public.developer_accounts replacement
       where replacement.developer_id = old.developer_id
         and replacement.id <> old.id
         and replacement.status = 'active'
         and replacement.role = 'developer_super_admin'
     ) then
    raise exception 'Cannot remove or demote the final active developer super admin';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_developer_inventory_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  developer_id_value uuid;
  entity_id_value uuid;
  entity_type_value text;
  project_id_value uuid;
  phase_id_value uuid;
  account_id_value uuid;
  next_version integer;
  restored_from_version_value integer;
  changed_fields_value text[] := '{}';
  before_json jsonb;
  after_json jsonb;
begin
  account_id_value := nullif(current_setting('app.developer_account_id', true), '')::uuid;
  restored_from_version_value := nullif(current_setting('app.developer_inventory_restore_version', true), '')::integer;
  before_json := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  after_json := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  if tg_table_name = 'developer_projects' then
    developer_id_value := coalesce(new.developer_id, old.developer_id); entity_id_value := coalesce(new.id, old.id); entity_type_value := 'project'; project_id_value := entity_id_value;
  elsif tg_table_name = 'developer_project_phases' then
    project_id_value := coalesce(new.project_id, old.project_id); entity_id_value := coalesce(new.id, old.id); entity_type_value := 'phase';
    select developer_id into developer_id_value from public.developer_projects where id = project_id_value;
    phase_id_value := entity_id_value;
  elsif tg_table_name = 'project_unit_types' then
    project_id_value := coalesce(new.project_id, old.project_id); entity_id_value := coalesce(new.id, old.id); entity_type_value := 'unit_type';
    select developer_id into developer_id_value from public.developer_projects where id = project_id_value;
    phase_id_value := coalesce(new.phase_id, old.phase_id);
  elsif tg_table_name = 'project_unit_variants' then
    entity_id_value := coalesce(new.id, old.id); entity_type_value := 'unit_variant';
    select unit_type.project_id, unit_type.phase_id, project.developer_id into project_id_value, phase_id_value, developer_id_value
    from public.project_unit_types unit_type join public.developer_projects project on project.id = unit_type.project_id
    where unit_type.id = coalesce(new.project_unit_type_id, old.project_unit_type_id);
  elsif tg_table_name = 'properties' then
    developer_id_value := coalesce(new.developer_id, old.developer_id); project_id_value := coalesce(new.project_id, old.project_id); phase_id_value := coalesce(new.phase_id, old.phase_id); entity_id_value := coalesce(new.id, old.id); entity_type_value := 'property';
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  -- Agent-owned resales with no developer have no company history owner.
  -- Keep their source record intact; never invent a tenant for its snapshot.
  if tg_table_name = 'properties' and developer_id_value is null
     and coalesce(after_json->>'listed_by_agent_id', before_json->>'listed_by_agent_id') is not null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(entity_type_value || ':' || entity_id_value::text, 0));
  select coalesce(max(version), 0) + 1 into next_version
  from public.developer_inventory_versions
  where entity_type = entity_type_value and entity_id = entity_id_value;
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into changed_fields_value
    from jsonb_each(before_json) before_entry(key, value)
    where after_json->key is distinct from before_entry.value;
  elsif tg_op = 'INSERT' then
    changed_fields_value := array['created'];
  else
    changed_fields_value := array['deleted'];
  end if;
  insert into public.developer_inventory_versions(
    developer_id, entity_type, entity_id, version, snapshot,
    change_summary, changed_fields, created_by_account_id, created_by_admin_id,
    restored_from_version
  ) values (
    developer_id_value, entity_type_value, entity_id_value, next_version,
    case when tg_op = 'DELETE' then before_json else after_json end,
    case when tg_op = 'INSERT' then 'Created' when tg_op = 'DELETE' then 'Deleted' else 'Updated' end,
    coalesce(changed_fields_value, '{}'), account_id_value, null, restored_from_version_value
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_developer_property_price_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  account_id uuid;
begin
  -- Agent-only resales have no company to own developer price history.
  if new.developer_id is null and new.listed_by_agent_id is not null then
    return new;
  end if;
  account_id := nullif(current_setting('app.developer_account_id', true), '')::uuid;
  if tg_op = 'INSERT' or old.price is distinct from new.price or old.price_effective_from is distinct from new.price_effective_from then
    update public.developer_property_price_history
    set effective_to = greatest(effective_from, coalesce(effective_to, coalesce(new.price_effective_from, now())))
    where property_id = new.id and effective_to is null;
    insert into public.developer_property_price_history(
      property_id, developer_id, previous_price, price, effective_from,
      change_reason, changed_by_account_id
    ) values (
      new.id, new.developer_id, case when tg_op = 'INSERT' then null else old.price end,
      new.price, coalesce(new.price_effective_from, now()),
      case when tg_op = 'INSERT' then 'initial_price' else 'price_update' end,
      account_id
    );
  end if;
  return new;
end;
$function$;

commit;
