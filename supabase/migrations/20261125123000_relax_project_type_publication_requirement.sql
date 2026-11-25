begin;

-- Project types are optional marketing metadata. The phase-scoped
-- project_unit_types rows are the inventory contract that mobile actually
-- consumes, so an empty project_types array must not block a complete project
-- from entering moderation or publication review.
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

  -- Only active unit types in active phases can be exposed to mobile.  An
  -- archived type (or a type retained under an archived phase) must not make
  -- an otherwise empty project appear publication-ready.
  select count(*) into unit_count
  from public.project_unit_types unit_type
  join public.developer_project_phases release_phase on release_phase.id = unit_type.phase_id
  where unit_type.project_id = p_project_id
    and release_phase.project_id = p_project_id
    and unit_type.archived_at is null
    and release_phase.archived_at is null
    and release_phase.lifecycle_state <> 'archived';

  select count(*) into incomplete_unit_count
  from public.project_unit_types unit_type
  join public.developer_project_phases release_phase on release_phase.id = unit_type.phase_id
  where unit_type.project_id = p_project_id
    and release_phase.project_id = p_project_id
    and unit_type.archived_at is null
    and release_phase.archived_at is null
    and release_phase.lifecycle_state <> 'archived'
    and (
      nullif(btrim(coalesce(unit_type.label, '')), '') is null
      or unit_type.min_price is null or unit_type.min_price <= 0
    );

  if nullif(btrim(coalesce(project_row.name, '')), '') is null then issues := array_append(issues, 'Project name is required'); end if;
  if nullif(btrim(coalesce(project_row.description, '')), '') is null then issues := array_append(issues, 'Project description is required'); end if;
  if nullif(btrim(coalesce(project_row.location, '')), '') is null then issues := array_append(issues, 'Project location is required'); end if;
  if not has_hero then issues := array_append(issues, 'Hero media is required for the mobile preview'); end if;
  if project_row.developer_id is null or not exists (select 1 from public.developers where id = project_row.developer_id and is_active = true) then issues := array_append(issues, 'An active developer association is required'); end if;
  if unit_count = 0 then issues := array_append(issues, 'At least one unit type is required'); end if;
  if incomplete_unit_count > 0 then issues := array_append(issues, 'Every unit type needs a label and positive price'); end if;

  checks := jsonb_build_object(
    'identity', nullif(btrim(coalesce(project_row.name, '')), '') is not null
      and project_row.developer_id is not null,
    'description', nullif(btrim(coalesce(project_row.description, '')), '') is not null,
    'location', nullif(btrim(coalesce(project_row.location, '')), '') is not null,
    'hero_media', has_hero,
    -- Keep the legacy key for moderation/UI consumers, but make it reflect
    -- the same phase-scoped inventory readiness as unit_types.
    'project_types', unit_count > 0 and incomplete_unit_count = 0,
    'unit_types', unit_count > 0 and incomplete_unit_count = 0,
    'active_developer', project_row.developer_id is not null and exists (select 1 from public.developers where id = project_row.developer_id and is_active = true)
  );

  return jsonb_build_object('ready', cardinality(issues) = 0, 'issues', to_jsonb(issues), 'checks', checks, 'unit_count', unit_count);
end;
$$;

-- Replacing a function preserves its existing security boundary, but keep the
-- grants explicit so a recreated function cannot accidentally become public.
revoke all on function public.developer_project_publication_check(uuid) from public, anon, authenticated;
grant execute on function public.developer_project_publication_check(uuid) to service_role;

commit;
