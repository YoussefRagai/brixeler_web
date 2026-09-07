begin;

alter table public.developer_projects
  add column if not exists selling_points text[] not null default '{}'::text[],
  add column if not exists delivery_date date;

alter table public.developer_project_phases
  add column if not exists facilities text[] not null default '{}'::text[],
  add column if not exists selling_points text[] not null default '{}'::text[],
  add column if not exists delivery_date date,
  add column if not exists sales_status text not null default 'upcoming'
    check (sales_status in ('upcoming', 'selling', 'sold_out', 'paused')),
  add column if not exists masterplan_url text;

-- One signature per RPC avoids PostgREST overload ambiguity. Existing positional
-- and named calls retain their defaults. Omitted new update fields preserve data;
-- explicit NULL clears optional dates/URLs, and empty arrays clear list fields.
-- Sentinel defaults distinguish omitted fields from an intentional NULL.
drop function public.create_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb);
drop function public.update_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb);

create or replace function public.create_developer_project_phase(
  p_developer_id uuid,
  p_project_id uuid,
  p_account_id uuid,
  p_name text,
  p_description text default null,
  p_phase_order integer default null,
  p_launch_status text default 'upcoming',
  p_launch_date date default null,
  p_hero_media jsonb default '{}'::jsonb,
  p_facilities text[] default null,
  p_selling_points text[] default null,
  p_delivery_date date default '-infinity'::date,
  p_sales_status text default null,
  p_masterplan_url text default '__unchanged__'
)
returns public.developer_project_phases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  phase_row public.developer_project_phases%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_status text := case when p_launch_status in ('live', 'new_launch', 'upcoming') then p_launch_status else null end;
  next_order integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if char_length(normalized_name) not between 1 and 160 then raise exception 'Phase name must contain between 1 and 160 characters'; end if;
  if normalized_status is null then raise exception 'Invalid phase launch status'; end if;
  if p_sales_status is not null and p_sales_status not in ('upcoming', 'selling', 'sold_out', 'paused') then raise exception 'Invalid phase sales status'; end if;
  if p_hero_media is null or jsonb_typeof(p_hero_media) <> 'object' then raise exception 'Phase media must be a JSON object'; end if;
  if not exists (
    select 1 from public.developer_accounts account
    where account.id = p_account_id and account.developer_id = p_developer_id and account.status = 'active'
      and lower(coalesce(account.role, '')) in (
        'developer_super_admin', 'developer_admin', 'super_admin', 'owner', 'admin',
        'project_manager', 'project_admin', 'manager', 'member'
      )
  ) then raise exception 'Active developer membership required'; end if;
  perform 1
  from public.developer_projects
  where id = p_project_id and developer_id = p_developer_id
  for update;
  if not found then raise exception 'Project not found or access denied'; end if;
  if p_phase_order is not null and p_phase_order <= 0 then raise exception 'Phase order must be greater than zero'; end if;
  select coalesce(max(phase_order), 0) + 1 into next_order
  from public.developer_project_phases where project_id = p_project_id;
  next_order := coalesce(p_phase_order, next_order);
  if exists (
    select 1 from public.developer_project_phases phase
    where phase.project_id = p_project_id and phase.archived_at is null and lower(phase.name) = lower(normalized_name)
  ) then raise exception 'A phase with this name already exists for the project'; end if;

  insert into public.developer_project_phases(
    project_id, name, phase_order, description, hero_media, launch_status,
    launch_date, is_default, lifecycle_state, approval_status, published_at,
    facilities, selling_points, delivery_date, sales_status, masterplan_url
  ) values (
    p_project_id, normalized_name, next_order, nullif(btrim(p_description), ''), p_hero_media,
    normalized_status, p_launch_date, false, 'draft', 'pending', null,
    coalesce(p_facilities, '{}'::text[]), coalesce(p_selling_points, '{}'::text[]),
    nullif(p_delivery_date, '-infinity'::date), coalesce(p_sales_status, 'upcoming'),
    case when p_masterplan_url = '__unchanged__' then null else nullif(btrim(p_masterplan_url), '') end
  ) returning * into phase_row;

  update public.developer_projects
  set approval_status = 'pending', rejection_reason = null, reviewed_by = null,
      reviewed_at = null, lifecycle_state = 'draft', published_at = null, updated_at = now()
  where id = p_project_id;
  return phase_row;
end;
$$;

create or replace function public.update_developer_project_phase(
  p_developer_id uuid,
  p_phase_id uuid,
  p_account_id uuid,
  p_name text,
  p_description text default null,
  p_phase_order integer default null,
  p_launch_status text default 'upcoming',
  p_launch_date date default null,
  p_hero_media jsonb default '{}'::jsonb,
  p_facilities text[] default null,
  p_selling_points text[] default null,
  p_delivery_date date default '-infinity'::date,
  p_sales_status text default null,
  p_masterplan_url text default '__unchanged__'
)
returns public.developer_project_phases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  phase_row public.developer_project_phases%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_status text := case when p_launch_status in ('live', 'new_launch', 'upcoming') then p_launch_status else null end;
  next_order integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if char_length(normalized_name) not between 1 and 160 then raise exception 'Phase name must contain between 1 and 160 characters'; end if;
  if normalized_status is null then raise exception 'Invalid phase launch status'; end if;
  if p_sales_status is not null and p_sales_status not in ('upcoming', 'selling', 'sold_out', 'paused') then raise exception 'Invalid phase sales status'; end if;
  if p_hero_media is null or jsonb_typeof(p_hero_media) <> 'object' then raise exception 'Phase media must be a JSON object'; end if;
  if not exists (
    select 1 from public.developer_accounts account
    where account.id = p_account_id and account.developer_id = p_developer_id and account.status = 'active'
      and lower(coalesce(account.role, '')) in (
        'developer_super_admin', 'developer_admin', 'super_admin', 'owner', 'admin',
        'project_manager', 'project_admin', 'manager', 'member'
      )
  ) then raise exception 'Active developer membership required'; end if;
  select phase.* into phase_row
  from public.developer_project_phases phase
  join public.developer_projects project on project.id = phase.project_id
  where phase.id = p_phase_id and project.developer_id = p_developer_id
  for update;
  if not found then raise exception 'Phase not found or access denied'; end if;
  if phase_row.archived_at is not null then raise exception 'Restore the phase before editing it'; end if;
  if p_phase_order is not null and p_phase_order <= 0 then raise exception 'Phase order must be greater than zero'; end if;
  next_order := coalesce(p_phase_order, phase_row.phase_order);
  if exists (
    select 1 from public.developer_project_phases phase
    where phase.project_id = phase_row.project_id and phase.id <> p_phase_id
      and phase.archived_at is null and lower(phase.name) = lower(normalized_name)
  ) then raise exception 'A phase with this name already exists for the project'; end if;

  update public.developer_project_phases
  set name = normalized_name,
      description = nullif(btrim(p_description), ''),
      phase_order = next_order,
      hero_media = p_hero_media,
      launch_status = normalized_status,
      launch_date = p_launch_date,
      facilities = coalesce(p_facilities, phase_row.facilities),
      selling_points = coalesce(p_selling_points, phase_row.selling_points),
      delivery_date = case when p_delivery_date = '-infinity'::date then phase_row.delivery_date else p_delivery_date end,
      sales_status = coalesce(p_sales_status, phase_row.sales_status),
      masterplan_url = case when p_masterplan_url = '__unchanged__' then phase_row.masterplan_url else nullif(btrim(p_masterplan_url), '') end,
      approval_status = 'pending',
      lifecycle_state = 'draft',
      published_at = null,
      updated_at = now()
  where id = p_phase_id
  returning * into phase_row;

  update public.developer_projects
  set approval_status = 'pending', rejection_reason = null, reviewed_by = null,
      reviewed_at = null, lifecycle_state = 'draft', published_at = null, updated_at = now()
  where id = phase_row.project_id;
  return phase_row;
end;
$$;

revoke all on function public.create_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb, text[], text[], date, text, text) from public, anon, authenticated;
grant execute on function public.create_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb, text[], text[], date, text, text) to service_role;
revoke all on function public.update_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb, text[], text[], date, text, text) from public, anon, authenticated;
grant execute on function public.update_developer_project_phase(uuid, uuid, uuid, text, text, integer, text, date, jsonb, text[], text[], date, text, text) to service_role;

create or replace function public.clone_developer_project_from_template(
  p_developer_id uuid,
  p_account_id uuid,
  p_template_id uuid,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  template_row public.developer_project_templates%rowtype;
  source jsonb;
  new_project_id uuid;
  new_phase_id uuid;
  new_unit_type_id uuid;
  phase_payload jsonb;
  unit_payload jsonb;
  variant_payload jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_projects') then raise exception 'Project management capability required'; end if;
  select * into template_row from public.developer_project_templates where id = p_template_id and developer_id = p_developer_id and template_type = 'project' and archived_at is null for update;
  if not found then raise exception 'Project template not found or access denied'; end if;
  source := template_row.payload;
  insert into public.developer_projects(
    developer_id, name, description, hero_media, voice_notes, video_links, amenities, selling_points, delivery_date, location,
    acres, footprint, maintenance, payment_plans, payment_plan_templates, limited_time_offers,
    launch_status, launch_date, eoi_value_apt, eoi_value_villa, ch_fees, project_types,
    inventory_url, project_logo_url, approval_status, lifecycle_state, publication_status,
    is_demo
  ) values (
    p_developer_id, coalesce(nullif(btrim(p_name), ''), btrim(coalesce(source->>'name', template_row.name || ' Copy'))),
    nullif(source->>'description', ''), case when jsonb_typeof(source->'hero_media') = 'object' then source->'hero_media' else '{}'::jsonb end,
    case when jsonb_typeof(source->'voice_notes') = 'array' then array(select jsonb_array_elements_text(source->'voice_notes')) else '{}'::text[] end,
    case when jsonb_typeof(source->'video_links') = 'array' then array(select jsonb_array_elements_text(source->'video_links')) else '{}'::text[] end,
    case when jsonb_typeof(source->'amenities') = 'array' then array(select jsonb_array_elements_text(source->'amenities')) else '{}'::text[] end,
    case when jsonb_typeof(source->'selling_points') = 'array' then array(select jsonb_array_elements_text(source->'selling_points')) else '{}'::text[] end,
    nullif(source->>'delivery_date', '')::date,
    nullif(source->>'location', ''), nullif(source->>'acres', '')::numeric, nullif(source->>'footprint', '')::numeric,
    nullif(source->>'maintenance', '')::numeric, nullif(source->>'payment_plans', ''),
    case when jsonb_typeof(source->'payment_plan_templates') = 'array' then source->'payment_plan_templates' else '[]'::jsonb end,
    case when jsonb_typeof(source->'limited_time_offers') = 'array' then source->'limited_time_offers' else '[]'::jsonb end,
    coalesce(nullif(source->>'launch_status', ''), 'upcoming'), nullif(source->>'launch_date', '')::date,
    nullif(source->>'eoi_value_apt', '')::numeric, nullif(source->>'eoi_value_villa', '')::numeric, nullif(source->>'ch_fees', '')::numeric,
    case when jsonb_typeof(source->'project_types') = 'array' then array(select jsonb_array_elements_text(source->'project_types')) else '{}'::text[] end,
    nullif(source->>'inventory_url', ''), nullif(source->>'project_logo_url', ''), 'pending', 'draft', 'draft', false
  ) returning id into new_project_id;
  for phase_payload in select value from jsonb_array_elements(coalesce(source->'phases', '[]'::jsonb)) loop
    -- Project creation creates one default phase through the existing trigger.
    -- Reuse it when a project template includes that phase so cloning remains
    -- idempotent with the phase hierarchy contract.
    if coalesce((phase_payload->>'is_default')::boolean, false) then
      select id into new_phase_id
      from public.developer_project_phases
      where project_id = new_project_id and is_default = true and archived_at is null
      order by phase_order, created_at
      limit 1;
      if new_phase_id is null then
        insert into public.developer_project_phases(project_id, name, phase_order, description, hero_media, launch_status, launch_date, facilities, selling_points, delivery_date, sales_status, masterplan_url, is_default, lifecycle_state, approval_status, publication_status)
        values (new_project_id, coalesce(nullif(phase_payload->>'name', ''), 'Phase'), greatest(1, coalesce(nullif(phase_payload->>'phase_order', '')::integer, 1)), nullif(phase_payload->>'description', ''), case when jsonb_typeof(phase_payload->'hero_media') = 'object' then phase_payload->'hero_media' else '{}'::jsonb end, coalesce(nullif(phase_payload->>'launch_status', ''), 'upcoming'), nullif(phase_payload->>'launch_date', '')::date, case when jsonb_typeof(phase_payload->'facilities') = 'array' then array(select jsonb_array_elements_text(phase_payload->'facilities')) else '{}'::text[] end, case when jsonb_typeof(phase_payload->'selling_points') = 'array' then array(select jsonb_array_elements_text(phase_payload->'selling_points')) else '{}'::text[] end, nullif(phase_payload->>'delivery_date', '')::date, coalesce(nullif(phase_payload->>'sales_status', ''), 'upcoming'), nullif(phase_payload->>'masterplan_url', ''), true, 'draft', 'pending', 'draft') returning id into new_phase_id;
      else
        update public.developer_project_phases
        set name = coalesce(nullif(phase_payload->>'name', ''), name),
            phase_order = greatest(1, coalesce(nullif(phase_payload->>'phase_order', '')::integer, phase_order)),
            description = nullif(phase_payload->>'description', ''),
            hero_media = case when jsonb_typeof(phase_payload->'hero_media') = 'object' then phase_payload->'hero_media' else hero_media end,
            launch_status = coalesce(nullif(phase_payload->>'launch_status', ''), launch_status),
            launch_date = coalesce(nullif(phase_payload->>'launch_date', '')::date, launch_date),
            facilities = case when jsonb_typeof(phase_payload->'facilities') = 'array' then array(select jsonb_array_elements_text(phase_payload->'facilities')) else '{}'::text[] end,
            selling_points = case when jsonb_typeof(phase_payload->'selling_points') = 'array' then array(select jsonb_array_elements_text(phase_payload->'selling_points')) else '{}'::text[] end,
            delivery_date = nullif(phase_payload->>'delivery_date', '')::date,
            sales_status = coalesce(nullif(phase_payload->>'sales_status', ''), 'upcoming'),
            masterplan_url = nullif(phase_payload->>'masterplan_url', ''),
            updated_at = now()
        where id = new_phase_id;
      end if;
    else
      insert into public.developer_project_phases(project_id, name, phase_order, description, hero_media, launch_status, launch_date, facilities, selling_points, delivery_date, sales_status, masterplan_url, is_default, lifecycle_state, approval_status, publication_status)
      values (new_project_id, coalesce(nullif(phase_payload->>'name', ''), 'Phase'), greatest(1, coalesce(nullif(phase_payload->>'phase_order', '')::integer, 1)), nullif(phase_payload->>'description', ''), case when jsonb_typeof(phase_payload->'hero_media') = 'object' then phase_payload->'hero_media' else '{}'::jsonb end, coalesce(nullif(phase_payload->>'launch_status', ''), 'upcoming'), nullif(phase_payload->>'launch_date', '')::date, case when jsonb_typeof(phase_payload->'facilities') = 'array' then array(select jsonb_array_elements_text(phase_payload->'facilities')) else '{}'::text[] end, case when jsonb_typeof(phase_payload->'selling_points') = 'array' then array(select jsonb_array_elements_text(phase_payload->'selling_points')) else '{}'::text[] end, nullif(phase_payload->>'delivery_date', '')::date, coalesce(nullif(phase_payload->>'sales_status', ''), 'upcoming'), nullif(phase_payload->>'masterplan_url', ''), false, 'draft', 'pending', 'draft') returning id into new_phase_id;
    end if;
    for unit_payload in select value from jsonb_array_elements(coalesce(phase_payload->'unit_types', '[]'::jsonb)) loop
      insert into public.project_unit_types(project_id, phase_id, category, label, min_price, max_price, unit_area_min, unit_area_max, land_area_min, land_area_max, finishing_status, description, archived_at)
      values (new_project_id, new_phase_id, nullif(unit_payload->>'category', ''), coalesce(nullif(unit_payload->>'label', ''), 'Unit type'), greatest(100000, coalesce(nullif(unit_payload->>'min_price', '')::numeric, 100000)), nullif(unit_payload->>'max_price', '')::numeric, nullif(unit_payload->>'unit_area_min', '')::numeric, nullif(unit_payload->>'unit_area_max', '')::numeric, nullif(unit_payload->>'land_area_min', '')::numeric, nullif(unit_payload->>'land_area_max', '')::numeric, nullif(unit_payload->>'finishing_status', ''), nullif(unit_payload->>'description', ''), null) returning id into new_unit_type_id;
      for variant_payload in select value from jsonb_array_elements(coalesce(unit_payload->'variants', '[]'::jsonb)) loop
        insert into public.project_unit_variants(project_unit_type_id, category, label, bedrooms, bathrooms, has_garden, has_roof, finishing_status, delivery_date, min_price, max_price, unit_area_min, unit_area_max, land_area_min, land_area_max, down_payment_percent, installment_years, stock_count, description, amenities)
        values (new_unit_type_id, nullif(variant_payload->>'category', ''), nullif(variant_payload->>'label', ''), nullif(variant_payload->>'bedrooms', '')::integer, nullif(variant_payload->>'bathrooms', '')::integer, (variant_payload->>'has_garden')::boolean, (variant_payload->>'has_roof')::boolean, nullif(variant_payload->>'finishing_status', ''), nullif(variant_payload->>'delivery_date', '')::date, greatest(100000, coalesce(nullif(variant_payload->>'min_price', '')::numeric, 100000)), nullif(variant_payload->>'max_price', '')::numeric, nullif(variant_payload->>'unit_area_min', '')::numeric, nullif(variant_payload->>'unit_area_max', '')::numeric, nullif(variant_payload->>'land_area_min', '')::numeric, nullif(variant_payload->>'land_area_max', '')::numeric, nullif(variant_payload->>'down_payment_percent', '')::numeric, nullif(variant_payload->>'installment_years', '')::numeric, nullif(variant_payload->>'stock_count', '')::integer, nullif(variant_payload->>'description', ''), case when jsonb_typeof(variant_payload->'amenities') = 'array' then array(select jsonb_array_elements_text(variant_payload->'amenities')) else null end);
      end loop;
    end loop;
  end loop;
  perform set_config('app.developer_account_id', p_account_id::text, true);
  insert into public.developer_inventory_activity(developer_id, project_id, entity_type, entity_id, action, actor_account_id, metadata)
  values (p_developer_id, new_project_id, 'project', new_project_id, 'cloned_from_template', p_account_id, jsonb_build_object('template_id', p_template_id));
  return new_project_id;
end;
$$;
create or replace function public.restore_developer_inventory_version(
  p_developer_id uuid,
  p_version_id uuid,
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  version_row public.developer_inventory_versions%rowtype;
  project_row public.developer_projects%rowtype;
  phase_row public.developer_project_phases%rowtype;
  unit_type_row public.project_unit_types%rowtype;
  variant_row public.project_unit_variants%rowtype;
  property_row public.properties%rowtype;
  restored boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into version_row from public.developer_inventory_versions where id = p_version_id and developer_id = p_developer_id for update;
  if not found then raise exception 'Inventory version not found or access denied'; end if;
  if version_row.entity_type in ('project', 'phase', 'unit_type', 'unit_variant') and not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_projects') then raise exception 'Project management capability required'; end if;
  if version_row.entity_type = 'property' and not public.developer_account_has_inventory_capability(p_developer_id, p_account_id, 'manage_inventory') then raise exception 'Inventory management capability required'; end if;
  perform set_config('app.developer_account_id', p_account_id::text, true);
  perform set_config('app.developer_inventory_restore_version', version_row.version::text, true);
  if version_row.entity_type = 'project' then
    select * into project_row from jsonb_populate_record(null::public.developer_projects, version_row.snapshot);
    update public.developer_projects set name = project_row.name, description = project_row.description, hero_media = project_row.hero_media, voice_notes = project_row.voice_notes, video_links = project_row.video_links, amenities = project_row.amenities, selling_points = coalesce(project_row.selling_points, '{}'::text[]), delivery_date = project_row.delivery_date, location = project_row.location, acres = project_row.acres, footprint = project_row.footprint, maintenance = project_row.maintenance, payment_plans = project_row.payment_plans, payment_plan_templates = project_row.payment_plan_templates, limited_time_offers = project_row.limited_time_offers, launch_status = project_row.launch_status, launch_date = project_row.launch_date, eoi_value_apt = project_row.eoi_value_apt, eoi_value_villa = project_row.eoi_value_villa, ch_fees = project_row.ch_fees, project_types = project_row.project_types, inventory_url = project_row.inventory_url, project_logo_url = project_row.project_logo_url, approval_status = 'pending', lifecycle_state = 'draft', published_at = null, publication_status = 'draft', rejection_reason = null, reviewed_by = null, reviewed_at = null, updated_at = now() where id = version_row.entity_id and developer_id = p_developer_id;
    restored := found;
  elsif version_row.entity_type = 'phase' then
    select * into phase_row from jsonb_populate_record(null::public.developer_project_phases, version_row.snapshot);
    update public.developer_project_phases set name = phase_row.name, phase_order = phase_row.phase_order, description = phase_row.description, hero_media = phase_row.hero_media, launch_status = phase_row.launch_status, launch_date = phase_row.launch_date, facilities = coalesce(phase_row.facilities, '{}'::text[]), selling_points = coalesce(phase_row.selling_points, '{}'::text[]), delivery_date = phase_row.delivery_date, sales_status = coalesce(phase_row.sales_status, 'upcoming'), masterplan_url = phase_row.masterplan_url, approval_status = 'pending', lifecycle_state = 'draft', published_at = null, publication_status = 'draft', updated_at = now() where id = version_row.entity_id and project_id in (select id from public.developer_projects where developer_id = p_developer_id);
    restored := found;
  elsif version_row.entity_type = 'unit_type' then
    select * into unit_type_row from jsonb_populate_record(null::public.project_unit_types, version_row.snapshot);
    update public.project_unit_types set category = unit_type_row.category, label = unit_type_row.label, min_price = unit_type_row.min_price, max_price = unit_type_row.max_price, unit_area_min = unit_type_row.unit_area_min, unit_area_max = unit_type_row.unit_area_max, land_area_min = unit_type_row.land_area_min, land_area_max = unit_type_row.land_area_max, finishing_status = unit_type_row.finishing_status, description = unit_type_row.description, hero_image_url = unit_type_row.hero_image_url, updated_at = now() where id = version_row.entity_id and project_id in (select id from public.developer_projects where developer_id = p_developer_id);
    restored := found;
  elsif version_row.entity_type = 'unit_variant' then
    select * into variant_row from jsonb_populate_record(null::public.project_unit_variants, version_row.snapshot);
    update public.project_unit_variants set category = variant_row.category, label = variant_row.label, bedrooms = variant_row.bedrooms, bathrooms = variant_row.bathrooms, has_garden = variant_row.has_garden, has_roof = variant_row.has_roof, garden_area_sqm = variant_row.garden_area_sqm, roof_area_sqm = variant_row.roof_area_sqm, finishing_status = variant_row.finishing_status, delivery_date = variant_row.delivery_date, min_price = variant_row.min_price, max_price = variant_row.max_price, unit_area_min = variant_row.unit_area_min, unit_area_max = variant_row.unit_area_max, land_area_min = variant_row.land_area_min, land_area_max = variant_row.land_area_max, layout_options = variant_row.layout_options, down_payment_percent = variant_row.down_payment_percent, installment_years = variant_row.installment_years, stock_count = variant_row.stock_count, description = variant_row.description, amenities = variant_row.amenities, updated_at = now() where id = version_row.entity_id and project_unit_type_id in (select unit_type.id from public.project_unit_types unit_type join public.developer_projects project on project.id = unit_type.project_id where project.developer_id = p_developer_id);
    restored := found;
  elsif version_row.entity_type = 'property' then
    select * into property_row from jsonb_populate_record(null::public.properties, version_row.snapshot);
    update public.properties set property_name = property_row.property_name, specific_location = property_row.specific_location, property_type = property_row.property_type, bedrooms = property_row.bedrooms, bathrooms = property_row.bathrooms, unit_area = property_row.unit_area, price = property_row.price, down_payment_percentage = property_row.down_payment_percentage, monthly_installment = property_row.monthly_installment, installment_years = property_row.installment_years, finishing_status = property_row.finishing_status, delivery_date = property_row.delivery_date, amenities = property_row.amenities, description = property_row.description, photos = property_row.photos, cover_photo_url = property_row.cover_photo_url, floor_plan_url = property_row.floor_plan_url, video_tour_url = property_row.video_tour_url, inventory_code = property_row.inventory_code, building = property_row.building, floor_number = property_row.floor_number, unit_number = property_row.unit_number, inventory_notes = property_row.inventory_notes, price_effective_from = now(), approval_status = 'pending', is_active = false, published_at = null, publication_status = 'draft', rejection_reason = null, reviewed_by = null, reviewed_at = null, updated_at = now() where id = version_row.entity_id and developer_id = p_developer_id and listed_by_agent_id is null;
    restored := found;
  end if;
  if not restored then raise exception 'Inventory entity not found or access denied'; end if;
  insert into public.developer_inventory_activity(developer_id, project_id, phase_id, entity_type, entity_id, action, actor_account_id, metadata)
  values (p_developer_id, case when version_row.entity_type = 'project' then version_row.entity_id else null end, case when version_row.entity_type = 'phase' then version_row.entity_id else null end, version_row.entity_type, version_row.entity_id, 'restored_version', p_account_id, jsonb_build_object('version_id', p_version_id, 'version', version_row.version));
  return jsonb_build_object('restored', true, 'version_id', p_version_id, 'entity_type', version_row.entity_type, 'entity_id', version_row.entity_id, 'version', version_row.version);
end;
$$;

notify pgrst, 'reload schema';
commit;
