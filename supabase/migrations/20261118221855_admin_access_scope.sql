create function public.update_admin_access(
  p_actor_id uuid,
  p_admin_id uuid,
  p_roles public.admin_role[],
  p_developer_ids uuid[],
  p_is_active boolean,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subject public.admins%rowtype;
  current_roles public.admin_role[];
  current_developer_ids jsonb;
  next_developer_ids jsonb;
  current_is_active boolean;
  next_is_active boolean;
  reason text := btrim(coalesce(p_reason, ''));
  roles_changed boolean;
  developers_changed boolean;
  status_changed boolean;
begin
  -- Recheck the actor and the target after obtaining a lock shared by every
  -- admin access change. Plain SELECTs can continue while access is updated.
  lock table public.admins in share row exclusive mode;
  if not exists (
    select 1 from public.admins
    where id = p_actor_id and is_active is not false
      and 'super_admin' = any(case when cardinality(roles) > 0 then roles else array[role] end)
  ) then
    raise exception using errcode = '42501', message = 'Active super admin required';
  end if;

  if coalesce(cardinality(p_roles), 0) = 0
     or array_position(p_roles, null) is not null
     or not p_roles <@ array[
       'super_admin', 'user_auth_admin', 'user_support_admin', 'developers_admin',
       'listing_admin', 'deals_admin', 'marketing_admin'
     ]::public.admin_role[] then
    raise exception using errcode = '22023', message = 'Roles must use the supported admin role allowlist';
  end if;

  select * into subject from public.admins where id = p_admin_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Admin not found';
  end if;

  current_roles := case when cardinality(subject.roles) > 0 then subject.roles else array[subject.role] end;
  current_developer_ids := case
    when jsonb_typeof(subject.permissions->'developer_ids') = 'array' then subject.permissions->'developer_ids'
    else '[]'::jsonb
  end;
  next_developer_ids := coalesce(to_jsonb(p_developer_ids), current_developer_ids);
  current_is_active := subject.is_active is not false;
  next_is_active := coalesce(p_is_active, current_is_active);
  roles_changed := current_roles is distinct from p_roles;
  developers_changed := current_developer_ids is distinct from next_developer_ids;
  status_changed := current_is_active is distinct from next_is_active;

  if not (roles_changed or developers_changed or status_changed) then
    return jsonb_build_object('success', true, 'changed', false);
  end if;
  if char_length(reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'A change reason between 3 and 500 characters is required';
  end if;
  if developers_changed and exists (
    select 1 from unnest(p_developer_ids) assignment(id)
    left join public.developers developer on developer.id = assignment.id
    where developer.id is null
  ) then
    raise exception using errcode = '22023', message = 'Developer scope contains an unknown company';
  end if;
  if p_admin_id = p_actor_id and not next_is_active then
    raise exception using errcode = '22023', message = 'You cannot suspend your own admin access';
  end if;
  if p_admin_id = p_actor_id and not ('super_admin' = any(p_roles)) then
    raise exception using errcode = '22023', message = 'You cannot remove your own super-admin access';
  end if;
  if current_is_active and 'super_admin' = any(current_roles)
     and (not next_is_active or not ('super_admin' = any(p_roles)))
     and not exists (
       select 1 from public.admins
       where id <> p_admin_id and is_active is not false
         and 'super_admin' = any(case when cardinality(roles) > 0 then roles else array[role] end)
     ) then
    raise exception using errcode = '22023', message = 'At least one active super admin must remain';
  end if;

  update public.admins
  set roles = p_roles,
      role = case when 'super_admin' = any(p_roles) then 'super_admin' else 'admin' end::public.admin_role,
      permissions = coalesce(subject.permissions, '{}'::jsonb) || jsonb_build_object('developer_ids', next_developer_ids),
      is_active = next_is_active,
      updated_at = now()
  where id = p_admin_id;

  insert into public.admin_activity_log (admin_id, action_type, entity_type, entity_id, details)
  values (
    p_actor_id,
    case when status_changed and not (roles_changed or developers_changed) then 'admin.update_status' else 'admin.update_roles' end,
    'admins',
    p_admin_id,
    jsonb_build_object(
      'reason', reason,
      'previous_roles', current_roles,
      'roles', p_roles,
      'previous_status', case when current_is_active then 'active' else 'suspended' end,
      'status', case when next_is_active then 'active' else 'suspended' end,
      'developer_ids', next_developer_ids
    )
  );

  return jsonb_build_object(
    'success', true,
    'changed', true,
    'status', case when next_is_active then 'active' else 'suspended' end,
    'roles', p_roles
  );
end;
$$;

revoke all on function public.update_admin_access(uuid, uuid, public.admin_role[], uuid[], boolean, text) from public, anon, authenticated;
grant execute on function public.update_admin_access(uuid, uuid, public.admin_role[], uuid[], boolean, text) to service_role;

create or replace function public.developer_support_conversation_action(
  p_ticket_id uuid, p_developer_id uuid, p_actor_id uuid, p_is_admin boolean,
  p_action text, p_body text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare ticket public.developer_support_tickets; admin public.admins; actor_roles public.admin_role[];
begin
  if p_is_admin is null then raise exception 'Actor required'; end if;
  if p_is_admin then
    select * into admin from public.admins where id = p_actor_id and is_active = true;
    actor_roles := case when cardinality(admin.roles) > 0 then admin.roles else array[admin.role] end;
    if not found or not coalesce(actor_roles && array['super_admin','user_support_admin','developers_admin']::public.admin_role[],false) then raise exception 'Support access denied'; end if;
    if not (actor_roles && array['super_admin', 'user_support_admin']::public.admin_role[])
       and not coalesce(
         jsonb_typeof(admin.permissions->'developer_ids') = 'array'
           and (admin.permissions->'developer_ids') ? p_developer_id::text,
         false
       ) then
      raise exception 'Tenant access denied';
    end if;
  elsif not exists(select 1 from public.developer_accounts where id = p_actor_id and developer_id = p_developer_id and status = 'active') then
    raise exception 'Active developer membership required';
  end if;
  select * into ticket from public.developer_support_tickets where id = p_ticket_id and developer_id = p_developer_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if p_action = 'read' then
    update public.developer_support_tickets set unread_for_admin = case when p_is_admin then false else unread_for_admin end,
      unread_for_developer = case when not p_is_admin then false else unread_for_developer end where id = ticket.id;
  elsif p_action = 'reply' then
    if char_length(btrim(coalesce(p_body,''))) not between 1 and 20000 then raise exception 'Message required (maximum 20000 characters)'; end if;
    insert into public.developer_support_messages(developer_id,ticket_id,author_account_id,author_admin_id,author_type,body)
    values(p_developer_id,ticket.id,case when not p_is_admin then p_actor_id end,case when p_is_admin then p_actor_id end,case when p_is_admin then 'support' else 'developer' end,btrim(p_body));
    update public.developer_support_tickets set last_message_preview=left(btrim(p_body),240),last_message_at=now(),updated_at=now(),
      unread_for_admin=not p_is_admin,unread_for_developer=p_is_admin,status=case when p_is_admin then 'waiting_on_developer' else 'open' end,resolved_at=null where id=ticket.id;
    insert into public.developer_activity_events(developer_id,actor_account_id,event_type,entity_type,entity_id,summary,metadata)
    values(p_developer_id,case when not p_is_admin then p_actor_id end,'support.replied','support_ticket',ticket.id,'Support reply added',jsonb_build_object('author_type',case when p_is_admin then 'support' else 'developer' end,'admin_id',case when p_is_admin then p_actor_id end));
  else raise exception 'Invalid support action'; end if;
end $$;

revoke all on function public.developer_support_conversation_action(uuid,uuid,uuid,boolean,text,text) from public, anon, authenticated;
grant execute on function public.developer_support_conversation_action(uuid,uuid,uuid,boolean,text,text) to service_role;

create function public.restore_agent_access(
  p_agent_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_restore_from text,
  p_commit boolean,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile public.users_profile%rowtype;
  previous_event public.agent_account_lifecycle_events%rowtype;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if not exists (
    select 1 from public.admins
    where id = p_admin_id and is_active is not false
      and (case when cardinality(roles) > 0 then roles else array[role] end)
           && array['super_admin', 'user_auth_admin']::public.admin_role[]
  ) then
    raise exception 'User auth admin required';
  end if;
  if p_commit is null or p_restore_from is null or p_restore_from not in ('archived', 'suspended') then
    raise exception 'Invalid agent restore operation';
  end if;
  if char_length(reason) not between 3 and 1000 then
    raise exception 'A reason between 3 and 1000 characters is required';
  end if;
  if exists (select 1 from public.admins where id = p_agent_id)
     or exists (select 1 from public.developer_accounts where auth_user_id = p_agent_id) then
    raise exception 'Dashboard identities must be separated before changing agent access';
  end if;

  select * into profile from public.users_profile where id = p_agent_id for update;
  if not found then raise exception 'Agent not found'; end if;
  if profile.account_status = 'banned' then raise exception 'Banned accounts require a separate review process'; end if;
  if profile.account_lifecycle_state = 'active' and profile.account_status = 'active' then
    select * into previous_event
    from public.agent_account_lifecycle_events
    where agent_id = p_agent_id
    order by created_at desc, id desc
    limit 1;
    if previous_event.event_type = 'restored' and previous_event.metadata->>'restored_from' = p_restore_from
       and (not p_commit or (previous_event.metadata->>'previous_updated_at')::timestamptz is not distinct from p_expected_updated_at) then
      return jsonb_build_object('agent_id', p_agent_id, 'state', 'active', 'already_restored', true);
    end if;
  end if;
  if profile.account_lifecycle_state <> p_restore_from then
    raise exception 'Only % accounts can be restored with this action', p_restore_from;
  end if;

  -- The agent remains blocked by database policies until Auth confirms the
  -- unban. A failed commit must not re-ban an account another request restored.
  if not p_commit then
    return jsonb_build_object('agent_id', p_agent_id, 'state', p_restore_from, 'updated_at', profile.updated_at);
  end if;
  if profile.updated_at is distinct from p_expected_updated_at then
    raise exception 'Agent account changed; reload before restoring';
  end if;

  update public.users_profile
  set account_status = 'active', account_lifecycle_state = 'active', archived_at = null,
      archived_by = null, archive_reason = null, updated_at = clock_timestamp()
  where id = p_agent_id;

  insert into public.agent_account_lifecycle_events (agent_id, event_type, actor_id, reason, metadata, created_at)
  values (
    p_agent_id, 'restored', p_admin_id, reason,
    jsonb_build_object('restored_from', p_restore_from, 'previous_updated_at', profile.updated_at, 'recoverable', true),
    clock_timestamp()
  );
  insert into public.admin_activity_log (admin_id, action_type, entity_type, entity_id, details)
  values (
    p_admin_id, case when p_restore_from = 'archived' then 'agent.restore' else 'agent.reactivate' end,
    'users_profile', p_agent_id, jsonb_build_object('reason', reason, 'recoverable', true)
  );
  return jsonb_build_object('agent_id', p_agent_id, 'state', 'active');
end;
$$;

revoke all on function public.restore_agent_access(uuid, uuid, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.restore_agent_access(uuid, uuid, text, text, boolean, timestamptz) to service_role;
