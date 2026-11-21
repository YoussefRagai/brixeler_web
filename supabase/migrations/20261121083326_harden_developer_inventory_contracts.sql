-- Keep project-linked inventory behind the same published phase gate as the
-- phase and unit-type rows.  The legacy phase policy allowed every
-- phase-less property through, which could expose an imported developer row
-- tied to an unpublished project.  Standalone properties and agent resales
-- remain readable through their existing public/agent policies.
drop policy if exists properties_phase_visibility on public.properties;
create policy properties_phase_visibility
on public.properties
as restrictive
for select
to public
using (
  (
    phase_id is null
    and (project_id is null or listed_by_agent_id is not null)
  )
  or public.developer_project_phase_is_public(phase_id)
  or listed_by_agent_id = (select auth.uid())
  or exists (
    select 1 from public.admins admin
    where admin.id = (select auth.uid()) and admin.is_active = true
  )
);

-- The workspace import/edit RPCs return row-level diagnostics, so an error
-- must not leave earlier rows from the same commit request behind.  Keep the
-- existing validator/result shape and run it inside a PL/pgSQL subtransaction;
-- a diagnostic causes the subtransaction to roll back while the caller still
-- receives the row errors needed to repair the preview.
alter function public.bulk_update_developer_inventory(uuid, uuid, uuid, uuid, jsonb, boolean)
  rename to bulk_update_developer_inventory_partial;
alter function public.import_developer_inventory_rows(uuid, uuid, uuid, uuid, jsonb, boolean)
  rename to import_developer_inventory_rows_partial;

revoke all on function public.bulk_update_developer_inventory_partial(uuid, uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated, service_role;
revoke all on function public.import_developer_inventory_rows_partial(uuid, uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated, service_role;

-- CSV/XLSX import is a service-mediated write, but it still accepts
-- user-provided media URLs.  Keep the database contract aligned with the
-- server-side normalizeExternalMediaUrl helper: credential-free HTTPS URLs
-- are allowed only on the product's approved hosts.  The Supabase host is
-- represented by its project-host shape here because Postgres migrations do
-- not have access to NEXT_PUBLIC_SUPABASE_URL; the server action applies the
-- exact configured-host check before invoking this RPC.
create or replace function public.developer_inventory_media_url_is_allowed(p_url text)
returns boolean
language plpgsql
immutable
strict
set search_path = public, extensions
as $$
declare
  normalized text := btrim(p_url);
  host_match text[];
  host text;
begin
  if normalized = '' or char_length(normalized) > 2048 then
    return false;
  end if;
  host_match := regexp_match(normalized, '^https://([^/?#]+)(?:[/?#]|$)');
  if host_match is null then
    return false;
  end if;
  host := regexp_replace(lower(host_match[1]), '\\.$', '');
  if host = '' or host ~ '[@:]' or host ~ '[[:space:]]' or host ~ '\\.\\.' then
    return false;
  end if;
  return host in (
    'admin.brixeler.com',
    'images.unsplash.com',
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'vimeo.com',
    'player.vimeo.com'
  ) or host ~ '^[a-z0-9-]+\\.supabase\\.co$';
end;
$$;

create or replace function public.developer_inventory_media_errors(p_rows jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public, extensions
as $$
declare
  input_row jsonb;
  photo text;
  url_value text;
  field_name text;
  row_errors text[];
  errors jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    return errors;
  end if;
  for input_row in select value from jsonb_array_elements(p_rows) loop
    row_errors := '{}';
    if jsonb_typeof(input_row->'photos') = 'array' then
      for photo in select jsonb_array_elements_text(input_row->'photos') loop
        if btrim(photo) <> '' and not public.developer_inventory_media_url_is_allowed(photo) then
          row_errors := array_append(row_errors, 'Every photo must use HTTPS and an approved media host');
        end if;
      end loop;
    else
      for photo in select unnest(string_to_array(coalesce(input_row->>'photos', ''), '|')) loop
        if btrim(photo) <> '' and not public.developer_inventory_media_url_is_allowed(photo) then
          row_errors := array_append(row_errors, 'Every photo must use HTTPS and an approved media host');
        end if;
      end loop;
    end if;
    foreach field_name in array array['floor_plan_url', 'video_tour_url'] loop
      url_value := nullif(btrim(input_row->>field_name), '');
      if url_value is not null and not public.developer_inventory_media_url_is_allowed(url_value) then
        row_errors := array_append(row_errors, replace(initcap(replace(field_name, '_', ' ')), 'Url', 'URL') || ' must use HTTPS and an approved media host');
      end if;
    end loop;
    if cardinality(row_errors) > 0 then
      errors := errors || jsonb_build_array(jsonb_build_object('row', input_row->>'row', 'errors', row_errors));
    end if;
  end loop;
  return errors;
end;
$$;

revoke all on function public.developer_inventory_media_url_is_allowed(text) from public, anon, authenticated;
revoke all on function public.developer_inventory_media_errors(jsonb) from public, anon, authenticated, service_role;

create or replace function public.bulk_update_developer_inventory(
  p_developer_id uuid,
  p_project_id uuid,
  p_phase_id uuid,
  p_account_id uuid,
  p_rows jsonb,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  partial_result jsonb;
  partial_errors jsonb;
begin
  partial_result := public.bulk_update_developer_inventory_partial(
    p_developer_id, p_project_id, p_phase_id, p_account_id, p_rows, p_dry_run
  );
  if p_dry_run then
    return partial_result;
  end if;

  partial_errors := coalesce(partial_result->'errors', '[]'::jsonb);
  if jsonb_typeof(partial_errors) = 'array' and jsonb_array_length(partial_errors) > 0 then
    raise exception using
      errcode = 'ZX001',
      message = 'developer inventory batch contains validation errors';
  end if;
  return partial_result;
exception
  when others then
    if sqlstate = 'ZX001' then
      return jsonb_build_object(
        'dry_run', false,
        'updated_count', 0,
        'rows', '[]'::jsonb,
        'errors', partial_errors
      );
    end if;
    raise;
end;
$$;

create or replace function public.import_developer_inventory_rows(
  p_developer_id uuid,
  p_project_id uuid,
  p_phase_id uuid,
  p_account_id uuid,
  p_rows jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  partial_result jsonb;
  partial_errors jsonb;
  media_errors jsonb;
begin
  media_errors := public.developer_inventory_media_errors(p_rows);
  if not p_dry_run and jsonb_array_length(media_errors) > 0 then
    return jsonb_build_object(
      'dry_run', false,
      'rows_saved', 0,
      'total_rows', coalesce(jsonb_array_length(p_rows), 0),
      'errors', media_errors
    );
  end if;
  partial_result := public.import_developer_inventory_rows_partial(
    p_developer_id, p_project_id, p_phase_id, p_account_id, p_rows, p_dry_run
  );
  if p_dry_run then
    if jsonb_array_length(media_errors) > 0 then
      return jsonb_set(
        partial_result,
        '{errors}',
        coalesce(partial_result->'errors', '[]'::jsonb) || media_errors
      );
    end if;
    return partial_result;
  end if;

  partial_errors := coalesce(partial_result->'errors', '[]'::jsonb);
  if jsonb_typeof(partial_errors) = 'array' and jsonb_array_length(partial_errors) > 0 then
    raise exception using
      errcode = 'ZX002',
      message = 'developer inventory import contains validation errors';
  end if;
  return partial_result;
exception
  when others then
    if sqlstate = 'ZX002' then
      return jsonb_build_object(
        'dry_run', false,
        'rows_saved', 0,
        'total_rows', coalesce(jsonb_array_length(p_rows), 0),
        'errors', partial_errors
      );
    end if;
    raise;
end;
$$;

revoke all on function public.bulk_update_developer_inventory(uuid, uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.bulk_update_developer_inventory(uuid, uuid, uuid, uuid, jsonb, boolean) to service_role;
revoke all on function public.import_developer_inventory_rows(uuid, uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_developer_inventory_rows(uuid, uuid, uuid, uuid, jsonb, boolean) to service_role;

-- Project inventory inherits the reviewed demo classification from its project
-- (and, for project-less developer listings, from its developer).  Client
-- payloads must not be able to turn demo inventory into production inventory
-- by omitting or forcing `is_demo`/`demo_batch`.
create or replace function public.inherit_developer_property_demo_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_developer_id uuid;
  project_is_demo boolean := false;
  project_demo_batch text;
  developer_is_demo boolean := false;
  developer_demo_batch text;
begin
  -- Agent-owned resales are not developer-company inventory, even when a
  -- project association is retained for provenance.
  if new.listed_by_agent_id is not null then
    return new;
  end if;

  if new.project_id is not null then
    select project.developer_id, coalesce(project.is_demo, false), project.demo_batch
      into project_developer_id, project_is_demo, project_demo_batch
    from public.developer_projects project
    where project.id = new.project_id;
    if not found then
      raise exception 'Project not found';
    end if;
    if new.developer_id is null then
      new.developer_id := project_developer_id;
    elsif project_developer_id is not null and new.developer_id <> project_developer_id then
      raise exception 'Inventory developer must match its project tenant';
    end if;
  end if;

  -- Legacy standalone rows without a developer/project owner are not
  -- developer inventory. Preserve their reviewed metadata instead of
  -- silently declassifying them as production rows.
  if new.project_id is null and new.developer_id is null then
    if new.is_demo and (
      new.demo_batch is null
      or not exists (
        select 1 from public.demo_data_batches batch
        where batch.batch_key = new.demo_batch and batch.status = 'active'
      )
    ) then
      raise exception 'Demo inventory requires an active demo batch';
    end if;
    return new;
  end if;

  if new.developer_id is not null then
    select coalesce(developer.is_demo, false), developer.demo_batch
      into developer_is_demo, developer_demo_batch
    from public.developers developer
    where developer.id = new.developer_id;
  end if;

  new.is_demo := coalesce(new.is_demo, false) or project_is_demo or developer_is_demo;
  new.demo_batch := case
    when new.is_demo then case
      when project_is_demo then project_demo_batch
      when developer_is_demo then developer_demo_batch
      else new.demo_batch
    end
    else null
  end;
  if new.is_demo and (
    new.demo_batch is null
    or not exists (
      select 1 from public.demo_data_batches batch
      where batch.batch_key = new.demo_batch and batch.status = 'active'
    )
  ) then
    raise exception 'Demo inventory requires an active demo batch';
  end if;
  return new;
end;
$$;

revoke all on function public.inherit_developer_property_demo_metadata() from public, anon, authenticated;
drop trigger if exists properties_inherit_developer_demo_metadata on public.properties;
create trigger properties_inherit_developer_demo_metadata
before insert or update of project_id, developer_id, listed_by_agent_id, phase_id
on public.properties
for each row execute function public.inherit_developer_property_demo_metadata();


-- Preserve explicit project archive transitions.
create or replace function public.sync_developer_publication_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name = 'developer_projects' then
    -- Explicit archive wins over moderation synchronization. Restore is a
    -- separate draft transition and must never republish automatically.
    if new.lifecycle_state = 'archived' then
      new.published_at := null;
      return new;
    end if;
    -- Approval is the existing moderation boundary for project inventory. A
    -- newly approved project becomes published; edits that return it to review
    -- cannot remain mobile-visible.
    if new.approval_status = 'approved' and new.lifecycle_state = 'draft' then
      new.lifecycle_state := 'published';
    elsif new.approval_status is distinct from 'approved' then
      new.lifecycle_state := 'draft';
    end if;

    -- A first approved project is the existing operator publication action
    -- for a newly invited developer. Keep an explicitly archived developer
    -- archived; only an unpublished draft is promoted automatically.
    if new.approval_status = 'approved' and new.lifecycle_state = 'published' then
      update public.developers
      set lifecycle_state = 'published'
      where id = new.developer_id
        and lifecycle_state = 'draft'
        and is_active = true;
    end if;
  end if;

  if new.lifecycle_state = 'published' then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.lifecycle_state is distinct from 'published' or new.published_at is null then
      new.published_at := coalesce(new.published_at, now());
    end if;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_developer_publication_timestamp() from public, anon, authenticated;
revoke all on function public.create_default_developer_project_phase() from public, anon, authenticated;
