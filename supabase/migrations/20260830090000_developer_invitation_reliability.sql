begin;

-- Developer invitations are the one dashboard workflow that crosses the
-- database/Auth boundary.  Keep all database-side state explicitly marked so
-- demo records can be removed by the existing exact-batch cleanup contract.
alter table public.developers
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;

alter table public.developer_accounts
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  add column if not exists invite_request_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'developers_demo_batch_consistency'
      and conrelid = 'public.developers'::regclass
  ) then
    alter table public.developers
      add constraint developers_demo_batch_consistency
      check ((is_demo and demo_batch is not null) or (not is_demo and demo_batch is null));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'developer_accounts_demo_batch_consistency'
      and conrelid = 'public.developer_accounts'::regclass
  ) then
    alter table public.developer_accounts
      add constraint developer_accounts_demo_batch_consistency
      check ((is_demo and demo_batch is not null) or (not is_demo and demo_batch is null));
  end if;
end;
$$;

create index if not exists developers_demo_batch_idx
  on public.developers (demo_batch) where is_demo;
create index if not exists developer_accounts_demo_batch_idx
  on public.developer_accounts (demo_batch) where is_demo;
create index if not exists developer_accounts_invite_request_id_idx
  on public.developer_accounts (invite_request_id)
  where invite_request_id is not null;

create table if not exists public.developer_account_events (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  developer_account_id uuid not null references public.developer_accounts(id) on delete cascade,
  event_type text not null check (event_type in (
    'developer_account.invite',
    'developer_account.resend_invite',
    'developer_account.accepted',
    'developer_account.login',
    'developer_account.revoke'
  )),
  actor_type text not null check (actor_type in ('admin', 'developer', 'system')),
  actor_id uuid,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint developer_account_events_idempotency_key_key
    unique (developer_account_id, event_type, idempotency_key)
);

create index if not exists developer_account_events_developer_idx
  on public.developer_account_events (developer_id, created_at desc);
create index if not exists developer_account_events_account_idx
  on public.developer_account_events (developer_account_id, created_at desc);

alter table public.developer_account_events enable row level security;
alter table public.developer_account_events force row level security;
drop policy if exists developer_account_events_service_role on public.developer_account_events;
create policy developer_account_events_service_role
  on public.developer_account_events
  for all to service_role
  using (true)
  with check (true);
revoke all on public.developer_account_events from public, anon, authenticated;
grant all on public.developer_account_events to service_role;

-- Create the developer row and membership in one transaction.  The caller
-- sends the Auth invite first, then invokes this function.  If this function
-- fails, the caller can safely compensate the newly-created Auth user because
-- no database row has been committed.
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
  p_is_demo boolean default false,
  p_demo_batch text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  developer_row public.developers%rowtype;
  account_row public.developer_accounts%rowtype;
  normalized_email text := lower(btrim(coalesce(p_member_email, '')));
  normalized_name text := btrim(coalesce(p_developer_name, ''));
  operation_key text := nullif(btrim(coalesce(p_invite_request_id, '')), '');
  event_name text;
  existing_event_name text;
  target_is_demo boolean;
  target_demo_batch text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if not exists (
    select 1 from public.admins
    where id = p_invited_by_admin_id and is_active = true
  ) then
    raise exception 'Active admin required';
  end if;
  if p_auth_user_id is null then
    raise exception 'Auth user is required';
  end if;
  if char_length(normalized_email) < 3 or char_length(normalized_email) > 320
     or position('@' in normalized_email) < 2 then
    raise exception 'A valid member email is required';
  end if;
  if operation_key is null or char_length(operation_key) > 200 then
    raise exception 'Invite request id is required';
  end if;

  if p_create_developer then
    if p_developer_id is null or char_length(normalized_name) not between 1 and 200 then
      raise exception 'Developer name is required';
    end if;
    if p_is_demo and nullif(btrim(coalesce(p_demo_batch, '')), '') is null then
      raise exception 'A demo batch is required for demo developers';
    end if;
    if not p_is_demo and nullif(btrim(coalesce(p_demo_batch, '')), '') is not null then
      raise exception 'Production developers cannot have a demo batch';
    end if;
    if p_is_demo and not exists (
      select 1 from public.demo_data_batches
      where batch_key = btrim(p_demo_batch) and status = 'active'
    ) then
      raise exception 'Demo batch is not active';
    end if;

    select * into developer_row
    from public.developers
    where id = p_developer_id
    for update;
    if found then
      if developer_row.name <> normalized_name then
        raise exception 'Developer request does not match the existing developer';
      end if;
    else
      begin
        insert into public.developers(id, name, contact_email, contact_phone, is_demo, demo_batch)
        values (
          p_developer_id,
          normalized_name,
          nullif(btrim(p_contact_email), ''),
          nullif(btrim(p_contact_phone), ''),
          coalesce(p_is_demo, false),
          case when coalesce(p_is_demo, false) then btrim(p_demo_batch) else null end
        )
        returning * into developer_row;
      exception when unique_violation then
        raise exception 'A developer with this name already exists. Select the existing developer instead.';
      end;
    end if;
  else
    if p_developer_id is null then
      raise exception 'Existing developer is required';
    end if;
    select * into developer_row
    from public.developers
    where id = p_developer_id
    for update;
    if not found then
      raise exception 'Developer not found';
    end if;
  end if;

  target_is_demo := coalesce(developer_row.is_demo, false);
  target_demo_batch := developer_row.demo_batch;

  select * into account_row
  from public.developer_accounts
  where auth_user_id = p_auth_user_id
  for update;

  if found then
    if account_row.developer_id <> developer_row.id then
      raise exception 'This member already belongs to another developer';
    end if;
    if account_row.status = 'active' then
      raise exception 'This member already has active developer access';
    end if;
    if account_row.status = 'revoked' then
      raise exception 'Revoked developer access cannot be reactivated; invite a new member address';
    end if;
    if account_row.status <> 'pending' then
      raise exception 'Developer membership is not eligible for an invite';
    end if;
    if account_row.invite_request_id = operation_key then
      select event_type into existing_event_name
      from public.developer_account_events
      where developer_account_id = account_row.id
        and idempotency_key = operation_key
      order by created_at desc
      limit 1;
      return jsonb_build_object(
        'account_id', account_row.id,
        'developer_id', developer_row.id,
        'action', coalesce(existing_event_name, 'developer_account.resend_invite'),
        'idempotent', true
      );
    end if;

    event_name := 'developer_account.resend_invite';
    update public.developer_accounts
    set email = normalized_email,
        status = 'pending',
        invited_by_admin_id = p_invited_by_admin_id,
        invitation_sent_at = now(),
        invite_request_id = operation_key,
        is_demo = target_is_demo,
        demo_batch = target_demo_batch,
        revoked_at = null,
        updated_at = now()
    where id = account_row.id
    returning * into account_row;
  else
    event_name := 'developer_account.invite';
    insert into public.developer_accounts(
      developer_id, auth_user_id, email, status, invited_at,
      invitation_sent_at, invited_by_admin_id, is_demo, demo_batch,
      invite_request_id
    ) values (
      developer_row.id, p_auth_user_id, normalized_email, 'pending', now(),
      now(), p_invited_by_admin_id, target_is_demo, target_demo_batch,
      operation_key
    )
    returning * into account_row;
  end if;

  insert into public.developer_account_events(
    developer_id, developer_account_id, event_type, actor_type, actor_id,
    idempotency_key, metadata
  ) values (
    developer_row.id,
    account_row.id,
    event_name,
    'admin',
    p_invited_by_admin_id,
    operation_key,
    jsonb_build_object(
      'developer_id', developer_row.id,
      'developer_name', developer_row.name,
      'email', normalized_email,
      'is_demo', target_is_demo,
      'demo_batch', target_demo_batch
    )
  ) on conflict (developer_account_id, event_type, idempotency_key) do nothing;

  return jsonb_build_object(
    'account_id', account_row.id,
    'developer_id', developer_row.id,
    'action', event_name,
    'idempotent', false
  );
end;
$$;

revoke all on function public.create_developer_account_invite(uuid, text, text, text, boolean, uuid, text, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.create_developer_account_invite(uuid, text, text, text, boolean, uuid, text, uuid, text, boolean, text) to service_role;

create or replace function public.activate_developer_account_invite(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_activation_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_row public.developer_accounts%rowtype;
  developer_name text;
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  normalized_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  operation_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_auth_user_id is null or char_length(normalized_email) < 3 then
    raise exception 'Invite session is invalid';
  end if;

  select * into account_row
  from public.developer_accounts
  where auth_user_id = p_auth_user_id
  order by invitation_sent_at desc
  limit 1
  for update;
  if not found then
    raise exception 'No developer membership was found for this account';
  end if;
  select name into developer_name
  from public.developers
  where id = account_row.developer_id;
  if developer_name is null then
    raise exception 'Developer not found';
  end if;
  if account_row.status = 'active' then
    return jsonb_build_object(
      'account_id', account_row.id,
      'developer_id', account_row.developer_id,
      'developer_name', developer_name,
      'idempotent', true
    );
  end if;
  if account_row.status <> 'pending' then
    raise exception 'This developer invite is no longer available';
  end if;

  operation_key := coalesce(
    nullif(btrim(coalesce(p_activation_request_id, '')), ''),
    'activation:' || account_row.id::text
  );

  update public.developer_accounts
  set email = normalized_email,
      full_name = coalesce(normalized_name, full_name),
      status = 'active',
      activated_at = coalesce(activated_at, now()),
      revoked_at = null,
      updated_at = now()
  where id = account_row.id and status = 'pending';

  insert into public.developer_account_events(
    developer_id, developer_account_id, event_type, actor_type, actor_id,
    idempotency_key, metadata
  ) values (
    account_row.developer_id,
    account_row.id,
    'developer_account.accepted',
    'developer',
    p_auth_user_id,
    operation_key,
    jsonb_build_object(
      'developer_id', account_row.developer_id,
      'email', normalized_email
    )
  ) on conflict (developer_account_id, event_type, idempotency_key) do nothing;

  return jsonb_build_object(
    'account_id', account_row.id,
    'developer_id', account_row.developer_id,
    'developer_name', developer_name,
    'idempotent', false
  );
end;
$$;

revoke all on function public.activate_developer_account_invite(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.activate_developer_account_invite(uuid, text, text, text) to service_role;

create or replace function public.record_developer_account_login(
  p_account_id uuid,
  p_auth_user_id uuid,
  p_login_request_id text,
  p_logged_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_row public.developer_accounts%rowtype;
  operation_key text := nullif(btrim(coalesce(p_login_request_id, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_account_id is null or p_auth_user_id is null or operation_key is null then
    raise exception 'Login audit data is incomplete';
  end if;

  select * into account_row
  from public.developer_accounts
  where id = p_account_id and auth_user_id = p_auth_user_id
  for update;
  if not found or account_row.status <> 'active' then
    raise exception 'Active developer membership required';
  end if;

  update public.developer_accounts
  set last_login = coalesce(p_logged_at, now()), updated_at = now()
  where id = account_row.id;

  insert into public.developer_account_events(
    developer_id, developer_account_id, event_type, actor_type, actor_id,
    idempotency_key, metadata
  ) values (
    account_row.developer_id,
    account_row.id,
    'developer_account.login',
    'developer',
    p_auth_user_id,
    operation_key,
    jsonb_build_object('developer_id', account_row.developer_id)
  ) on conflict (developer_account_id, event_type, idempotency_key) do nothing;

  return jsonb_build_object('account_id', account_row.id, 'idempotent', false);
end;
$$;

revoke all on function public.record_developer_account_login(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_developer_account_login(uuid, uuid, text, timestamptz) to service_role;

create or replace function public.revoke_developer_account(
  p_account_id uuid,
  p_admin_id uuid,
  p_revoke_request_id text,
  p_revoked_at timestamptz default now(),
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_row public.developer_accounts%rowtype;
  operation_key text := nullif(btrim(coalesce(p_revoke_request_id, '')), '');
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if not exists (
    select 1 from public.admins
    where id = p_admin_id and is_active = true
  ) then
    raise exception 'Active admin required';
  end if;
  if p_account_id is null or operation_key is null then
    raise exception 'Revoke request id is required';
  end if;
  if reason is null or char_length(reason) not between 3 and 500 then
    raise exception 'A revoke reason between 3 and 500 characters is required';
  end if;

  select * into account_row
  from public.developer_accounts
  where id = p_account_id
  for update;
  if not found then
    raise exception 'Developer member not found';
  end if;
  if account_row.status = 'revoked' then
    return jsonb_build_object('account_id', account_row.id, 'idempotent', true);
  end if;
  if account_row.status not in ('pending', 'active') then
    raise exception 'Developer membership cannot be revoked';
  end if;

  update public.developer_accounts
  set status = 'revoked', revoked_at = coalesce(p_revoked_at, now()), updated_at = now()
  where id = account_row.id;

  insert into public.developer_account_events(
    developer_id, developer_account_id, event_type, actor_type, actor_id,
    idempotency_key, metadata
  ) values (
    account_row.developer_id,
    account_row.id,
    'developer_account.revoke',
    'admin',
    p_admin_id,
    operation_key,
    jsonb_build_object('developer_id', account_row.developer_id, 'email', account_row.email, 'reason', reason)
  ) on conflict (developer_account_id, event_type, idempotency_key) do nothing;

  return jsonb_build_object('account_id', account_row.id, 'idempotent', false);
end;
$$;

revoke all on function public.revoke_developer_account(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.revoke_developer_account(uuid, uuid, text, timestamptz, text) to service_role;

-- cleanup_demo_batch already owns the exact-batch lifecycle.  This trigger is
-- additive and runs after that function marks a batch removed, so developer
-- accounts/events are included without changing the historical function body.
create or replace function public.cleanup_demo_developer_invites(p_batch text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_ids uuid[] := '{}'::uuid[];
  developer_ids uuid[] := '{}'::uuid[];
  deleted_events integer := 0;
  deleted_accounts integer := 0;
  deleted_developers integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  p_batch := nullif(btrim(p_batch), '');
  if p_batch is null then
    return jsonb_build_object('status', 'refused', 'reason', 'Demo batch is required');
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
    into account_ids
  from public.developer_accounts
  where is_demo and demo_batch = p_batch;
  select coalesce(array_agg(id), '{}'::uuid[])
    into developer_ids
  from public.developers
  where is_demo and demo_batch = p_batch;

  delete from public.developer_account_events
  where developer_account_id = any(account_ids);
  get diagnostics deleted_events = row_count;

  delete from public.developer_accounts
  where id = any(account_ids);
  get diagnostics deleted_accounts = row_count;

  -- Do not remove a developer that has acquired any non-demo dependent data.
  delete from public.developers developer
  where developer.id = any(developer_ids)
    and not exists (
      select 1 from public.properties property
      where property.developer_id = developer.id
        and not (coalesce(property.is_demo, false) and property.demo_batch = p_batch)
    )
    and not exists (
      select 1 from public.developer_projects project
      where project.developer_id = developer.id
        and not (coalesce(project.is_demo, false) and project.demo_batch = p_batch)
    )
    and not exists (
      select 1 from public.developer_contact_requests request
      where request.developer_id = developer.id
        and not (coalesce(request.is_demo, false) and request.demo_batch = p_batch)
    )
    and not exists (
      select 1 from public.developer_commission_rules rule
      where rule.developer_id = developer.id
    )
    and not exists (
      select 1 from public.developer_impersonation_grants grant_row
      where grant_row.developer_id = developer.id
    )
    and not exists (
      select 1 from public.developer_accounts account
      where account.developer_id = developer.id
    );
  get diagnostics deleted_developers = row_count;

  return jsonb_build_object(
    'status', 'removed',
    'batch', p_batch,
    'developer_account_events', deleted_events,
    'developer_accounts', deleted_accounts,
    'developers', deleted_developers
  );
end;
$$;

revoke all on function public.cleanup_demo_developer_invites(text) from public, anon, authenticated;
grant execute on function public.cleanup_demo_developer_invites(text) to service_role;

create or replace function public.cleanup_demo_developer_invites_on_batch_removed()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'removed' and old.status is distinct from new.status then
    perform public.cleanup_demo_developer_invites(new.batch_key);
  end if;
  return new;
end;
$$;

revoke all on function public.cleanup_demo_developer_invites_on_batch_removed() from public, anon, authenticated;
drop trigger if exists demo_data_batches_cleanup_developer_invites on public.demo_data_batches;
create trigger demo_data_batches_cleanup_developer_invites
after update of status on public.demo_data_batches
for each row execute function public.cleanup_demo_developer_invites_on_batch_removed();

commit;
