begin;

-- A suspended account must fail closed at the database boundary even while an
-- already-issued access token is still within its normal JWT lifetime.
create or replace function public.current_account_not_suspended()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select auth.uid() is not null
    and not exists (
      select 1
      from public.users_profile profile
      where profile.id = auth.uid()
        and profile.account_status in ('suspended', 'banned')
    );
$$;

revoke all on function public.current_account_not_suspended() from public, anon;
grant execute on function public.current_account_not_suspended() to authenticated, service_role;

-- Managed content is intentionally read-only to mobile clients. Publishing and
-- mutation remain service-role dashboard operations.
grant select on public.dashboard_content to authenticated;
drop policy if exists dashboard_content_authenticated_read on public.dashboard_content;
create policy dashboard_content_authenticated_read
on public.dashboard_content
for select
to authenticated
using (is_active and public.current_account_not_suspended());

-- Apply a restrictive suspension guard to every table currently granted to
-- authenticated users. Existing tenant/owner policies still decide which rows
-- an active account may access.
do $$
declare
  target record;
begin
  for target in
    select distinct grant_row.table_schema, grant_row.table_name
    from information_schema.role_table_grants grant_row
    join information_schema.tables table_row
      on table_row.table_schema = grant_row.table_schema
     and table_row.table_name = grant_row.table_name
     and table_row.table_type = 'BASE TABLE'
    where grant_row.grantee = 'authenticated'
      and grant_row.table_schema = 'public'
      and grant_row.table_name <> 'users_profile'
  loop
    execute format('drop policy if exists authenticated_accounts_not_suspended on %I.%I', target.table_schema, target.table_name);
    execute format(
      'create policy authenticated_accounts_not_suspended on %I.%I as restrictive for all to authenticated using (public.current_account_not_suspended()) with check (public.current_account_not_suspended())',
      target.table_schema,
      target.table_name
    );
  end loop;
end;
$$;

drop policy if exists authenticated_accounts_not_suspended on storage.objects;
create policy authenticated_accounts_not_suspended
on storage.objects
as restrictive
for all
to authenticated
using (public.current_account_not_suspended())
with check (public.current_account_not_suspended());

-- Agents can continue an existing support conversation without receiving
-- permission to mutate assignment, resolution, or other workflow fields.
create or replace function public.reply_to_support_ticket(p_ticket_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_id uuid := auth.uid();
  message_id uuid;
begin
  if caller_id is null or not public.current_account_not_suspended() then
    raise exception 'Active authentication required';
  end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 20000 then
    raise exception 'Reply must contain between 1 and 20000 characters';
  end if;
  if not exists (
    select 1 from public.support_tickets ticket
    where ticket.id = p_ticket_id
      and ticket.agent_id = caller_id
      and ticket.status not in ('closed')
  ) then
    raise exception 'Support ticket not found or closed';
  end if;

  insert into public.support_ticket_messages(ticket_id, author_type, author_id, message)
  values (p_ticket_id, 'agent', caller_id, btrim(p_message))
  returning id into message_id;

  update public.support_tickets
  set status = 'in_progress', resolved_at = null, updated_at = now()
  where id = p_ticket_id and agent_id = caller_id;

  return message_id;
end;
$$;

revoke all on function public.reply_to_support_ticket(uuid, text) from public, anon;
grant execute on function public.reply_to_support_ticket(uuid, text) to authenticated;

-- Security-definer RPCs bypass table RLS, so place the same active-account
-- boundary in front of the agent mutation entry points. The implementation
-- functions are no longer directly executable by API roles.
alter function public.submit_verification_documents(text[]) rename to submit_verification_documents_active_impl;
revoke all on function public.submit_verification_documents_active_impl(text[]) from public, anon, authenticated;
create function public.submit_verification_documents(p_paths text[])
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.current_account_not_suspended() then raise exception 'Active account required'; end if;
  return public.submit_verification_documents_active_impl(p_paths);
end; $$;
revoke all on function public.submit_verification_documents(text[]) from public, anon;
grant execute on function public.submit_verification_documents(text[]) to authenticated;

alter function public.create_gift_claim(uuid, uuid) rename to create_gift_claim_active_impl;
revoke all on function public.create_gift_claim_active_impl(uuid, uuid) from public, anon, authenticated;
create function public.create_gift_claim(p_gift_id uuid, p_agent_id uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not public.current_account_not_suspended() then raise exception 'Active account required'; end if;
  return public.create_gift_claim_active_impl(p_gift_id, p_agent_id);
end; $$;
revoke all on function public.create_gift_claim(uuid, uuid) from public, anon;
grant execute on function public.create_gift_claim(uuid, uuid) to authenticated, service_role;

alter function public.request_property_renewal(uuid, public.property_renewal_actor, uuid, text)
  rename to request_property_renewal_active_impl;
revoke all on function public.request_property_renewal_active_impl(uuid, public.property_renewal_actor, uuid, text)
  from public, anon, authenticated;
create function public.request_property_renewal(
  p_property_id uuid,
  p_actor_role public.property_renewal_actor,
  p_actor_id uuid default null,
  p_notes text default null
)
returns public.property_renewal_requests
language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not public.current_account_not_suspended() then raise exception 'Active account required'; end if;
  return public.request_property_renewal_active_impl(p_property_id, p_actor_role, p_actor_id, p_notes);
end; $$;
revoke all on function public.request_property_renewal(uuid, public.property_renewal_actor, uuid, text) from public, anon;
grant execute on function public.request_property_renewal(uuid, public.property_renewal_actor, uuid, text) to authenticated, service_role;

alter function public.register_device_push_token(text, text, text) rename to register_device_push_token_active_impl;
revoke all on function public.register_device_push_token_active_impl(text, text, text) from public, anon, authenticated;
create function public.register_device_push_token(p_token text, p_platform text, p_device_label text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.current_account_not_suspended() then raise exception 'Active account required'; end if;
  return public.register_device_push_token_active_impl(p_token, p_platform, p_device_label);
end; $$;
revoke all on function public.register_device_push_token(text, text, text) from public, anon;
grant execute on function public.register_device_push_token(text, text, text) to authenticated;

-- Developer project content now has a moderation state. Existing content is
-- grandfathered as approved; new or materially edited content returns to review.
alter table public.developer_projects
  add column if not exists approval_status text,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references public.admins(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

update public.developer_projects
set approval_status = 'approved'
where approval_status is null;

alter table public.developer_projects
  alter column approval_status set default 'pending',
  alter column approval_status set not null;

alter table public.developer_projects
  drop constraint if exists developer_projects_approval_status_check;
alter table public.developer_projects
  add constraint developer_projects_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

create index if not exists developer_projects_approval_status_idx
  on public.developer_projects(approval_status, updated_at desc);

create table if not exists public.developer_project_moderation_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.developer_projects(id) on delete cascade,
  developer_id uuid not null references public.developers(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  snapshot jsonb not null,
  reason text,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists developer_project_moderation_events_project_idx
  on public.developer_project_moderation_events(project_id, created_at desc);

alter table public.developer_project_moderation_events enable row level security;
alter table public.developer_project_moderation_events force row level security;
revoke all on public.developer_project_moderation_events from public, anon, authenticated;
grant all on public.developer_project_moderation_events to service_role;
drop policy if exists developer_project_moderation_events_service_role on public.developer_project_moderation_events;
create policy developer_project_moderation_events_service_role
on public.developer_project_moderation_events
for all to service_role using (true) with check (true);

create or replace function public.record_developer_project_moderation_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT'
     or new.approval_status is distinct from old.approval_status
     or new.updated_at is distinct from old.updated_at then
    insert into public.developer_project_moderation_events(
      project_id, developer_id, status, snapshot, reason, actor_id
    ) values (
      new.id,
      new.developer_id,
      new.approval_status,
      to_jsonb(new) - 'reviewed_by',
      new.rejection_reason,
      new.reviewed_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists developer_projects_record_moderation on public.developer_projects;
create trigger developer_projects_record_moderation
after insert or update on public.developer_projects
for each row execute function public.record_developer_project_moderation_event();

revoke all on function public.record_developer_project_moderation_event() from public, anon, authenticated;

create or replace function public.mark_developer_project_pending_from_inventory()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  affected_project_id uuid;
  affected_unit_type_id uuid;
begin
  if tg_table_name = 'project_unit_types' then
    affected_project_id := coalesce(new.project_id, old.project_id);
  else
    affected_unit_type_id := coalesce(new.project_unit_type_id, old.project_unit_type_id);
    select project_id into affected_project_id
    from public.project_unit_types
    where id = affected_unit_type_id;
  end if;

  if affected_project_id is not null then
    update public.developer_projects
    set approval_status = 'pending', rejection_reason = null,
        reviewed_by = null, reviewed_at = null, updated_at = now()
    where id = affected_project_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists project_unit_types_require_review on public.project_unit_types;
create trigger project_unit_types_require_review
after insert or update or delete on public.project_unit_types
for each row execute function public.mark_developer_project_pending_from_inventory();

drop trigger if exists project_unit_variants_require_review on public.project_unit_variants;
create trigger project_unit_variants_require_review
after insert or update or delete on public.project_unit_variants
for each row execute function public.mark_developer_project_pending_from_inventory();

revoke all on function public.mark_developer_project_pending_from_inventory() from public, anon, authenticated;

drop policy if exists developer_projects_public_read on public.developer_projects;
create policy developer_projects_public_read
on public.developer_projects
for select
to public
using (
  approval_status = 'approved'
  or exists (
    select 1 from public.developer_accounts account
    where account.developer_id = developer_projects.developer_id
      and account.auth_user_id = auth.uid()
      and account.status = 'active'
  )
  or exists (
    select 1 from public.admins admin
    where admin.id = auth.uid() and admin.is_active
  )
);

drop policy if exists project_unit_types_select on public.project_unit_types;
create policy project_unit_types_select
on public.project_unit_types
for select
to public
using (
  exists (
    select 1 from public.developer_projects project
    where project.id = project_unit_types.project_id
      and (
        project.approval_status = 'approved'
        or exists (
          select 1 from public.developer_accounts account
          where account.developer_id = project.developer_id
            and account.auth_user_id = auth.uid()
            and account.status = 'active'
        )
        or exists (
          select 1 from public.admins admin
          where admin.id = auth.uid() and admin.is_active
        )
      )
  )
);

drop policy if exists project_unit_variants_read on public.project_unit_variants;
create policy project_unit_variants_read
on public.project_unit_variants
for select
to authenticated
using (
  exists (
    select 1
    from public.project_unit_types unit_type
    join public.developer_projects project on project.id = unit_type.project_id
    where unit_type.id = project_unit_variants.project_unit_type_id
      and (
        project.approval_status = 'approved'
        or exists (
          select 1 from public.developer_accounts account
          where account.developer_id = project.developer_id
            and account.auth_user_id = auth.uid()
            and account.status = 'active'
        )
        or exists (
          select 1 from public.admins admin
          where admin.id = auth.uid() and admin.is_active
        )
      )
  )
);

-- Developer-facing lead notifications are distinct from agent notifications.
create table if not exists public.developer_notifications (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  contact_request_id uuid references public.developer_contact_requests(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists developer_notifications_inbox_idx
  on public.developer_notifications(developer_id, is_read, created_at desc);

alter table public.developer_notifications enable row level security;
alter table public.developer_notifications force row level security;
revoke all on public.developer_notifications from public, anon, authenticated;
grant all on public.developer_notifications to service_role;
drop policy if exists developer_notifications_service_role on public.developer_notifications;
create policy developer_notifications_service_role
on public.developer_notifications
for all to service_role using (true) with check (true);

-- Mobile deep links are an allowlist, not arbitrary dashboard-authored paths.
alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_action_url_check;
alter table public.notification_campaigns
  add constraint notification_campaigns_action_url_check
  check (action_url is null or action_url in ('/', '/properties', '/deals', '/gifts', '/profile', '/support'));

alter table public.notifications
  drop constraint if exists notifications_action_url_check;
alter table public.notifications
  add constraint notifications_action_url_check
  check (action_url is null or action_url in ('/', '/properties', '/deals', '/gifts', '/profile', '/support'));

commit;
