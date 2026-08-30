begin;

-- Team membership writes are service-mediated. Keep the database boundary
-- closed even if an environment has not replayed the earlier portal-hardening
-- migration yet; reads remain available only through the existing membership
-- policy and server-side queries.
revoke insert, update, delete, truncate on public.developer_accounts from anon, authenticated;

-- The original developer_accounts.role column was a varchar(20) with legacy
-- values such as member, manager, admin, and owner. Store the closed role
-- vocabulary as text, then normalize existing memberships before adding the
-- constraint. A preferred legacy administrator wins; otherwise the earliest
-- membership is the first company administrator.
alter table public.developer_accounts
  alter column role drop default;

alter table public.developer_accounts
  alter column role type text
  using lower(btrim(coalesce(role, 'project_manager')));

with ranked_memberships as (
  select
    account.id,
    account.role as legacy_role,
    row_number() over (
      partition by account.developer_id
      order by
        case when account.status = 'active' then 0 else 1 end,
        case
          when lower(btrim(coalesce(account.role, ''))) in (
            'developer_super_admin', 'developer_admin', 'super_admin', 'admin', 'owner'
          ) then 0
          else 1
        end,
        account.created_at asc nulls last,
        account.id
    ) as rank_number
  from public.developer_accounts account
)
update public.developer_accounts account
set role = case
  when ranked.rank_number = 1 then 'developer_super_admin'
  when lower(btrim(coalesce(ranked.legacy_role, ''))) in ('sales_manager', 'sales') then 'sales_manager'
  when lower(btrim(coalesce(ranked.legacy_role, ''))) in ('manager', 'member') then 'project_manager'
  else 'project_manager'
end,
updated_at = now()
from ranked_memberships ranked
where account.id = ranked.id;

alter table public.developer_accounts
  alter column role set default 'project_manager',
  alter column role set not null;

alter table public.developer_accounts
  drop constraint if exists developer_accounts_role_check;
alter table public.developer_accounts
  add constraint developer_accounts_role_check
  check (role in ('developer_super_admin', 'project_manager', 'sales_manager'));

create index if not exists developer_accounts_developer_role_idx
  on public.developer_accounts (developer_id, role, status);

-- Keep the capability vocabulary explicit in SQL as well as TypeScript. The
-- service-only account predicate is used by server RPCs and never trusts a
-- browser-supplied developer id without matching membership ownership.
create or replace function public.developer_role_has_capability(
  p_role text,
  p_capability text
)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select case lower(btrim(coalesce(p_role, '')))
    when 'developer_super_admin' then lower(btrim(coalesce(p_capability, ''))) in (
      'manage_company', 'manage_team', 'manage_projects', 'manage_inventory',
      'view_contacts', 'manage_contacts', 'view_analytics', 'manage_integrations'
    )
    when 'project_manager' then lower(btrim(coalesce(p_capability, ''))) in (
      'manage_projects', 'manage_inventory', 'view_analytics'
    )
    when 'sales_manager' then lower(btrim(coalesce(p_capability, ''))) in (
      'manage_inventory', 'view_contacts', 'manage_contacts'
    )
    else false
  end;
$$;

create or replace function public.developer_account_has_capability(
  p_account_id uuid,
  p_developer_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.developer_accounts account
    where account.id = p_account_id
      and account.developer_id = p_developer_id
      and account.status = 'active'
      and public.developer_role_has_capability(account.role, p_capability)
  );
$$;

revoke all on function public.developer_role_has_capability(text, text) from public, anon, authenticated;
grant execute on function public.developer_role_has_capability(text, text) to service_role;
revoke all on function public.developer_account_has_capability(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.developer_account_has_capability(uuid, uuid, text) to service_role;

-- Membership tenant and identity fields are immutable. The final active
-- developer_super_admin is also protected at the database boundary, including
-- service-role calls that do not go through the portal RPCs. Demo cleanup is a
-- deliberate system lifecycle operation and may remove its disposable rows.
create or replace function public.guard_developer_account_tenant_and_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
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
     or new.is_demo is distinct from old.is_demo
     or new.demo_batch is distinct from old.demo_batch then
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
$$;

create or replace function public.assign_first_developer_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.role not in ('developer_super_admin', 'project_manager', 'sales_manager') then
    raise exception 'Unsupported developer membership role';
  end if;
  if not exists (
    select 1 from public.developer_accounts account
    where account.developer_id = new.developer_id
  ) then
    new.role := 'developer_super_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists developer_accounts_first_super_admin on public.developer_accounts;
create trigger developer_accounts_first_super_admin
before insert on public.developer_accounts
for each row execute function public.assign_first_developer_super_admin();

drop trigger if exists developer_accounts_tenant_and_super_admin_guard on public.developer_accounts;
create trigger developer_accounts_tenant_and_super_admin_guard
before update or delete on public.developer_accounts
for each row execute function public.guard_developer_account_tenant_and_super_admin();

revoke all on function public.guard_developer_account_tenant_and_super_admin() from public, anon, authenticated;
revoke all on function public.assign_first_developer_super_admin() from public, anon, authenticated;

-- Reuse the existing audit stream for developer-led invitation, role, and
-- revoke actions without changing the admin invitation records.
alter table public.developer_account_events
  drop constraint if exists developer_account_events_event_type_check;
alter table public.developer_account_events
  add constraint developer_account_events_event_type_check
  check (event_type in (
    'developer_account.invite',
    'developer_account.resend_invite',
    'developer_account.accepted',
    'developer_account.login',
    'developer_account.revoke',
    'developer_account.role_changed'
  ));

-- Explicit developer-team invitation. The actor account and tenant are
-- resolved inside the transaction; p_developer_id is intentionally absent so
-- a caller cannot redirect an invitation to another company.
create or replace function public.invite_developer_team_member(
  p_actor_account_id uuid,
  p_auth_user_id uuid,
  p_member_email text,
  p_role text,
  p_invite_request_id text,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor_account public.developer_accounts%rowtype;
  developer_row public.developers%rowtype;
  target_account public.developer_accounts%rowtype;
  normalized_email text := lower(btrim(coalesce(p_member_email, '')));
  normalized_role text := lower(btrim(coalesce(p_role, '')));
  normalized_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  operation_key text := nullif(btrim(coalesce(p_invite_request_id, '')), '');
  event_name text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_auth_user_id is null then
    raise exception 'Auth user is required';
  end if;
  if char_length(normalized_email) < 3 or char_length(normalized_email) > 320
     or position('@' in normalized_email) < 2 then
    raise exception 'A valid member email is required';
  end if;
  if normalized_role not in ('developer_super_admin', 'project_manager', 'sales_manager') then
    raise exception 'A valid developer member role is required';
  end if;
  if normalized_name is not null and char_length(normalized_name) > 200 then
    raise exception 'Member name must be 200 characters or fewer';
  end if;
  if operation_key is null or char_length(operation_key) > 200 then
    raise exception 'Invite request id is required';
  end if;

  select * into actor_account
  from public.developer_accounts account
  where account.id = p_actor_account_id
    and account.status = 'active'
    and account.role = 'developer_super_admin'
  for update;
  if not found then
    raise exception 'Active developer super admin membership required';
  end if;

  -- Serializing on the developer row makes first-member and role transition
  -- decisions deterministic even when invitations arrive concurrently.
  select * into developer_row
  from public.developers developer
  where developer.id = actor_account.developer_id
  for update;
  if not found then
    raise exception 'Developer company not found';
  end if;

  select * into target_account
  from public.developer_accounts account
  where account.auth_user_id = p_auth_user_id
  for update;

  if found then
    if target_account.developer_id <> actor_account.developer_id then
      raise exception 'This member already belongs to another developer company';
    end if;
    if target_account.status = 'active' then
      raise exception 'This member already has active developer access';
    end if;
    if target_account.status = 'revoked' then
      raise exception 'Revoked developer access cannot be reactivated';
    end if;
    if target_account.status <> 'pending' then
      raise exception 'Developer membership is not eligible for an invitation';
    end if;
    if target_account.invite_request_id = operation_key then
      return jsonb_build_object(
        'account_id', target_account.id,
        'developer_id', actor_account.developer_id,
        'role', target_account.role,
        'action', 'developer_account.invite',
        'idempotent', true
      );
    end if;
    event_name := 'developer_account.resend_invite';
    update public.developer_accounts
    set email = normalized_email,
        full_name = coalesce(normalized_name, full_name),
        role = normalized_role,
        invitation_sent_at = now(),
        invite_request_id = operation_key,
        revoked_at = null,
        updated_at = now()
    where id = target_account.id
    returning * into target_account;
  else
    event_name := 'developer_account.invite';
    insert into public.developer_accounts(
      developer_id, auth_user_id, email, full_name, role, status,
      invited_at, invitation_sent_at, is_demo, demo_batch, invite_request_id
    ) values (
      actor_account.developer_id, p_auth_user_id, normalized_email, normalized_name,
      normalized_role, 'pending', now(), now(),
      coalesce(developer_row.is_demo, false), developer_row.demo_batch, operation_key
    ) returning * into target_account;
  end if;

  insert into public.developer_account_events(
    developer_id, developer_account_id, event_type, actor_type, actor_id,
    idempotency_key, metadata
  ) values (
    actor_account.developer_id,
    target_account.id,
    event_name,
    'developer',
    actor_account.id,
    operation_key,
    jsonb_build_object(
      'developer_id', actor_account.developer_id,
      'email', normalized_email,
      'role', target_account.role
    )
  ) on conflict (developer_account_id, event_type, idempotency_key) do nothing;

  return jsonb_build_object(
    'account_id', target_account.id,
    'developer_id', actor_account.developer_id,
    'role', target_account.role,
    'action', event_name,
    'idempotent', false
  );
end;
$$;

create or replace function public.resend_developer_team_invite(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_invite_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor_account public.developer_accounts%rowtype;
  target_account public.developer_accounts%rowtype;
  operation_key text := nullif(btrim(coalesce(p_invite_request_id, '')), '');
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_target_account_id is null or operation_key is null or char_length(operation_key) > 200 then
    raise exception 'Resend request is incomplete';
  end if;

  select * into actor_account
  from public.developer_accounts account
  where account.id = p_actor_account_id
    and account.status = 'active'
    and account.role = 'developer_super_admin'
  for update;
  if not found then
    raise exception 'Active developer super admin membership required';
  end if;

  select * into target_account
  from public.developer_accounts account
  where account.id = p_target_account_id
    and account.developer_id = actor_account.developer_id
  for update;
  if not found then
    raise exception 'Developer member not found';
  end if;
  if target_account.status = 'active' then
    raise exception 'This developer member is already active';
  end if;
  if target_account.status = 'revoked' then
    raise exception 'Revoked developer access cannot be reactivated';
  end if;
  if target_account.status <> 'pending' or target_account.email is null then
    raise exception 'Only pending invitations can be resent';
  end if;
  if target_account.invite_request_id = operation_key then
    return jsonb_build_object(
      'account_id', target_account.id,
      'developer_id', target_account.developer_id,
      'role', target_account.role,
      'action', 'developer_account.resend_invite',
      'idempotent', true
    );
  end if;

  result := public.invite_developer_team_member(
    p_actor_account_id,
    target_account.auth_user_id,
    target_account.email,
    target_account.role,
    operation_key,
    target_account.full_name
  );
  return result || jsonb_build_object('action', 'developer_account.resend_invite');
end;
$$;

create or replace function public.update_developer_team_member_role(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_role text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor_account public.developer_accounts%rowtype;
  target_account public.developer_accounts%rowtype;
  normalized_role text := lower(btrim(coalesce(p_role, '')));
  operation_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if normalized_role not in ('developer_super_admin', 'project_manager', 'sales_manager') then
    raise exception 'A valid developer member role is required';
  end if;

  select * into actor_account
  from public.developer_accounts account
  where account.id = p_actor_account_id
    and account.status = 'active'
    and account.role = 'developer_super_admin'
  for update;
  if not found then
    raise exception 'Active developer super admin membership required';
  end if;

  select * into target_account
  from public.developer_accounts account
  where account.id = p_target_account_id
    and account.developer_id = actor_account.developer_id
  for update;
  if not found then
    raise exception 'Developer member not found';
  end if;
  if target_account.status = 'revoked' then
    raise exception 'Revoked developer access cannot be changed';
  end if;
  if target_account.id = actor_account.id and normalized_role <> 'developer_super_admin' then
    raise exception 'You cannot demote or lock your own developer account';
  end if;
  if target_account.role = normalized_role then
    return jsonb_build_object(
      'account_id', target_account.id,
      'developer_id', target_account.developer_id,
      'role', target_account.role,
      'idempotent', true
    );
  end if;

  operation_key := coalesce(nullif(btrim(coalesce(p_request_id, '')), ''), 'role:' || target_account.id::text || ':' || normalized_role);
  if char_length(operation_key) > 200 then
    raise exception 'Invalid role update request';
  end if;

  update public.developer_accounts
  set role = normalized_role, updated_at = now()
  where id = target_account.id;

  insert into public.developer_account_events(
    developer_id, developer_account_id, event_type, actor_type, actor_id,
    idempotency_key, metadata
  ) values (
    actor_account.developer_id,
    target_account.id,
    'developer_account.role_changed',
    'developer',
    actor_account.id,
    operation_key,
    jsonb_build_object('previous_role', target_account.role, 'role', normalized_role)
  ) on conflict (developer_account_id, event_type, idempotency_key) do nothing;

  return jsonb_build_object(
    'account_id', target_account.id,
    'developer_id', target_account.developer_id,
    'role', normalized_role,
    'idempotent', false
  );
end;
$$;

create or replace function public.revoke_developer_team_member(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_revoke_request_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor_account public.developer_accounts%rowtype;
  target_account public.developer_accounts%rowtype;
  operation_key text := nullif(btrim(coalesce(p_revoke_request_id, '')), '');
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if operation_key is null or char_length(operation_key) > 200 then
    raise exception 'Revoke request id is required';
  end if;
  if reason is not null and char_length(reason) > 500 then
    raise exception 'Revoke reason must be 500 characters or fewer';
  end if;

  select * into actor_account
  from public.developer_accounts account
  where account.id = p_actor_account_id
    and account.status = 'active'
    and account.role = 'developer_super_admin'
  for update;
  if not found then
    raise exception 'Active developer super admin membership required';
  end if;

  select * into target_account
  from public.developer_accounts account
  where account.id = p_target_account_id
    and account.developer_id = actor_account.developer_id
  for update;
  if not found then
    raise exception 'Developer member not found';
  end if;
  if target_account.status = 'revoked' then
    return jsonb_build_object(
      'account_id', target_account.id,
      'developer_id', target_account.developer_id,
      'idempotent', true
    );
  end if;
  if target_account.id = actor_account.id then
    raise exception 'You cannot revoke or lock your own developer account';
  end if;
  if target_account.status not in ('pending', 'active') then
    raise exception 'Developer membership cannot be revoked';
  end if;
  if target_account.status = 'active'
     and target_account.role = 'developer_super_admin'
     and not exists (
       select 1 from public.developer_accounts replacement
       where replacement.developer_id = actor_account.developer_id
         and replacement.id <> target_account.id
         and replacement.status = 'active'
         and replacement.role = 'developer_super_admin'
     ) then
    raise exception 'Cannot remove the final active developer super admin';
  end if;

  update public.developer_accounts
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = target_account.id;

  insert into public.developer_account_events(
    developer_id, developer_account_id, event_type, actor_type, actor_id,
    idempotency_key, metadata
  ) values (
    actor_account.developer_id,
    target_account.id,
    'developer_account.revoke',
    'developer',
    actor_account.id,
    operation_key,
    jsonb_build_object('reason', reason, 'email', target_account.email)
  ) on conflict (developer_account_id, event_type, idempotency_key) do nothing;

  return jsonb_build_object(
    'account_id', target_account.id,
    'developer_id', target_account.developer_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.invite_developer_team_member(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.invite_developer_team_member(uuid, uuid, text, text, text, text) to service_role;
revoke all on function public.resend_developer_team_invite(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resend_developer_team_invite(uuid, uuid, text) to service_role;
revoke all on function public.update_developer_team_member_role(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_developer_team_member_role(uuid, uuid, text, text) to service_role;
revoke all on function public.revoke_developer_team_member(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.revoke_developer_team_member(uuid, uuid, text, text) to service_role;

-- Add an explicit role-bearing overload for future/admin callers while the
-- historical 11-argument invitation RPC remains untouched for compatibility.
-- New companies must always start with a super admin; existing companies must
-- provide one of the three roles rather than receiving an arbitrary legacy
-- value.
create or replace function public.create_developer_account_invite(
  p_developer_id uuid,
  p_developer_name text,
  p_contact_email text,
  p_contact_phone text,
  p_create_developer boolean,
  p_auth_user_id uuid,
  p_member_email text,
  p_invited_by_admin_id uuid,
  p_invite_request_id text,
  p_is_demo boolean,
  p_demo_batch text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_role text := lower(btrim(coalesce(p_role, '')));
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if normalized_role not in ('developer_super_admin', 'project_manager', 'sales_manager') then
    raise exception 'An explicit developer member role is required';
  end if;
  if p_create_developer and normalized_role <> 'developer_super_admin' then
    raise exception 'The first member of a new developer company must be developer_super_admin';
  end if;
  result := public.create_developer_account_invite(
    p_developer_id,
    p_developer_name,
    p_contact_email,
    p_contact_phone,
    p_create_developer,
    p_auth_user_id,
    p_member_email,
    p_invited_by_admin_id,
    p_invite_request_id,
    p_is_demo,
    p_demo_batch
  );

  update public.developer_accounts
  set role = normalized_role, updated_at = now()
  where id = nullif(result->>'account_id', '')::uuid
    and developer_id = p_developer_id
    and status = 'pending';

  return result || jsonb_build_object('role', normalized_role);
end;
$$;

revoke all on function public.create_developer_account_invite(uuid, text, text, text, boolean, uuid, text, uuid, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.create_developer_account_invite(uuid, text, text, text, boolean, uuid, text, uuid, text, boolean, text, text)
  to service_role;

-- Profile revision submission is company management, not a general member
-- write. Keep the existing five-argument signature and tighten its database
-- authorization; the later slogan overload delegates to this function.
create or replace function public.submit_developer_profile_revision(
  p_developer_id uuid,
  p_account_id uuid,
  p_name text,
  p_description text default null,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_row public.developer_accounts%rowtype;
  existing_row public.developer_profile_revisions%rowtype;
  created_row public.developer_profile_revisions%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  normalized_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
  next_version integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if char_length(normalized_name) not between 1 and 200 then
    raise exception 'Developer name must contain between 1 and 200 characters';
  end if;
  if normalized_description is not null and char_length(normalized_description) > 500 then
    raise exception 'Developer description cannot exceed 500 characters';
  end if;
  if normalized_logo is not null and (
    char_length(normalized_logo) > 2048 or normalized_logo !~* '^https://'
  ) then
    raise exception 'Developer logo must use a valid HTTPS URL';
  end if;

  select * into account_row
  from public.developer_accounts account
  where account.id = p_account_id
    and account.developer_id = p_developer_id
    and account.status = 'active'
  for update;
  if not found then
    raise exception 'Active developer membership required';
  end if;
  if account_row.role <> 'developer_super_admin' then
    raise exception 'Developer super admin membership required to edit the company profile';
  end if;

  perform 1 from public.developers where id = p_developer_id for update;
  if not found then
    raise exception 'Developer not found';
  end if;

  select * into existing_row
  from public.developer_profile_revisions
  where developer_id = p_developer_id and status = 'pending'
  for update;

  if found
     and existing_row.name = normalized_name
     and existing_row.description is not distinct from normalized_description
     and existing_row.logo_url is not distinct from normalized_logo then
    return jsonb_build_object(
      'revision_id', existing_row.id,
      'developer_id', existing_row.developer_id,
      'version', existing_row.version,
      'status', existing_row.status,
      'idempotent', true
    );
  end if;

  if found then
    update public.developer_profile_revisions
    set status = 'superseded', updated_at = now()
    where id = existing_row.id;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.developer_profile_revisions
  where developer_id = p_developer_id;

  insert into public.developer_profile_revisions(
    developer_id, version, name, description, logo_url, status,
    submitted_by_account_id, submitted_at
  ) values (
    p_developer_id, next_version, normalized_name, normalized_description,
    normalized_logo, 'pending', account_row.id, now()
  ) returning * into created_row;

  return jsonb_build_object(
    'revision_id', created_row.id,
    'developer_id', created_row.developer_id,
    'version', created_row.version,
    'status', created_row.status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.submit_developer_profile_revision(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_developer_profile_revision(uuid, uuid, text, text, text)
  to service_role;

revoke all on function public.submit_developer_profile_revision(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_developer_profile_revision(uuid, uuid, text, text, text, text)
  to service_role;

commit;
