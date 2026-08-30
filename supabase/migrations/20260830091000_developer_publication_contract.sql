begin;

-- Existing developers/projects are trusted legacy inventory. New records start
-- as drafts until an operator publishes them, so an invite cannot leak an
-- incomplete developer into mobile metadata.
alter table public.developers
  add column if not exists lifecycle_state text,
  add column if not exists published_at timestamptz;

update public.developers
set lifecycle_state = case when is_active then 'published' else 'archived' end,
    published_at = case when is_active then coalesce(published_at, updated_at, created_at, now()) else null end
where lifecycle_state is null;

update public.developers
set published_at = coalesce(published_at, updated_at, created_at, now())
where lifecycle_state = 'published' and published_at is null;

alter table public.developers
  alter column lifecycle_state set default 'draft',
  alter column lifecycle_state set not null;

alter table public.developers
  drop constraint if exists developers_lifecycle_state_check;
alter table public.developers
  add constraint developers_lifecycle_state_check
  check (lifecycle_state in ('draft', 'published', 'archived'));

alter table public.developer_projects
  add column if not exists lifecycle_state text,
  add column if not exists published_at timestamptz;

update public.developer_projects
set lifecycle_state = case when approval_status = 'approved' then 'published' else 'draft' end,
    published_at = case
      when approval_status = 'approved' then coalesce(published_at, updated_at, created_at, now())
      else null
    end
where lifecycle_state is null;

update public.developer_projects
set published_at = coalesce(published_at, updated_at, created_at, now())
where lifecycle_state = 'published' and published_at is null;

alter table public.developer_projects
  alter column lifecycle_state set default 'draft',
  alter column lifecycle_state set not null;

alter table public.developer_projects
  drop constraint if exists developer_projects_lifecycle_state_check;
alter table public.developer_projects
  add constraint developer_projects_lifecycle_state_check
  check (lifecycle_state in ('draft', 'published', 'archived'));

create index if not exists developers_mobile_publication_idx
  on public.developers(lifecycle_state, is_active, published_at)
  where is_demo = false;
create index if not exists developer_projects_mobile_publication_idx
  on public.developer_projects(developer_id, lifecycle_state, approval_status, published_at)
  where is_demo = false;

create or replace function public.sync_developer_publication_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name = 'developer_projects' then
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

drop trigger if exists developers_sync_publication_timestamp on public.developers;
create trigger developers_sync_publication_timestamp
before insert or update of lifecycle_state, published_at on public.developers
for each row execute function public.sync_developer_publication_timestamp();

drop trigger if exists developer_projects_sync_publication_timestamp on public.developer_projects;
create trigger developer_projects_sync_publication_timestamp
before insert or update of lifecycle_state, published_at, approval_status on public.developer_projects
for each row execute function public.sync_developer_publication_timestamp();

revoke all on function public.sync_developer_publication_timestamp() from public, anon, authenticated;

-- Public catalog reads are still harmless metadata, but only an active,
-- published, non-demo developer/project can be returned to mobile clients.
drop policy if exists developers_public_read on public.developers;
drop policy if exists developers_mobile_public_read on public.developers;
create policy developers_mobile_public_read
on public.developers
for select
to public
using (
  is_active = true
  and lifecycle_state = 'published'
  and published_at is not null
  and is_demo = false
);

drop policy if exists developer_projects_public_read on public.developer_projects;
drop policy if exists developer_projects_mobile_public_read on public.developer_projects;
create policy developer_projects_mobile_public_read
on public.developer_projects
for select
to public
using (
  (
    approval_status = 'approved'
    and lifecycle_state = 'published'
    and published_at is not null
    and is_demo = false
    and exists (
      select 1
      from public.developers developer
      where developer.id = developer_projects.developer_id
        and developer.is_active = true
        and developer.lifecycle_state = 'published'
        and developer.published_at is not null
        and developer.is_demo = false
    )
  )
  or exists (
    select 1
    from public.developer_accounts account
    where account.developer_id = developer_projects.developer_id
      and account.auth_user_id = (select auth.uid())
      and account.status = 'active'
  )
  or exists (
    select 1
    from public.admins admin
    where admin.id = (select auth.uid())
      and admin.is_active = true
  )
);

commit;
