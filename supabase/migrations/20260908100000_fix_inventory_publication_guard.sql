-- Keep table-specific trigger records isolated. PostgreSQL may evaluate
-- boolean expressions out of order, so a shared `and` guard can try to read
-- properties.is_active from project/phase NEW records that do not have it.
create or replace function public.guard_developer_inventory_publication_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.publication_status = 'published' then
    if tg_table_name = 'developer_projects' then
      if not (
        new.approval_status = 'approved'
        and new.lifecycle_state = 'published'
        and new.published_at is not null
      ) then
        raise exception 'Published projects require approved moderation, published lifecycle, and published_at';
      end if;
    elsif tg_table_name = 'developer_project_phases' then
      if not (
        new.approval_status = 'approved'
        and new.lifecycle_state = 'published'
        and new.published_at is not null
      ) then
        raise exception 'Published phases require approved moderation, published lifecycle, and published_at';
      end if;
    elsif tg_table_name = 'properties' then
      if not (
        new.approval_status::text = 'approved'
        and new.is_active
        and new.published_at is not null
      ) then
        raise exception 'Published inventory requires approved moderation, active state, and published_at';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_developer_inventory_publication_status() from public, anon, authenticated;
