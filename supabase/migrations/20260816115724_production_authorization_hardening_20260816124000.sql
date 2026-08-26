-- Final production authorization hardening for shared Supabase resources.
-- This migration is intentionally additive so it can be applied after the
-- earlier security migrations without rewriting migration history.

begin;

-- Renewal approval is an admin-only server workflow. Renewal requests remain
-- callable by authenticated agents/developers, but the function derives and
-- validates the caller instead of trusting a caller-supplied admin identity.
create or replace function public.request_property_renewal(
  p_property_id uuid,
  p_actor_role property_renewal_actor,
  p_actor_id uuid default null,
  p_notes text default null
) returns property_renewal_requests
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  listing record;
  result property_renewal_requests;
  message text;
  caller uuid := auth.uid();
  effective_id uuid;
  is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  effective_id := case when is_service then p_actor_id else caller end;
  if effective_id is null then raise exception 'Authentication required'; end if;
  select * into listing from properties where id = p_property_id for update;
  if not found then raise exception 'Property % not found', p_property_id; end if;
  if listing.approval_status <> 'approved' then raise exception 'Only approved listings can be renewed (property=%)', p_property_id; end if;

  if p_actor_role = 'admin' then
    if not exists (
      select 1 from admins
      where id = effective_id
        and is_active = true
        and (role::text in ('listing_admin', 'super_admin')
          or 'listing_admin' = any(coalesce(roles::text[], '{}'::text[]))
          or 'super_admin' = any(coalesce(roles::text[], '{}'::text[])))
    ) then raise exception 'Active listing admin required'; end if;
    update properties
    set expires_at = greatest(coalesce(listing.expires_at, now()), now()) + interval '3 months',
        last_renewed_at = now(), renewal_status = 'active', renewal_prompted_at = null,
        approval_status = 'approved', is_active = true
    where id = p_property_id returning * into listing;
    insert into property_renewal_requests(property_id, requested_by_role, requested_by_id, status, reviewed_by, reviewed_at, notes)
    values (p_property_id, 'admin', effective_id, 'approved', effective_id, now(), coalesce(p_notes, 'Renewed directly by admin'))
    returning * into result;
    message := format('Listing %s renewed by admin', coalesce(listing.property_name, listing.id::text));
    perform log_property_expiration_event(p_property_id, 'admin', effective_id, 'renewal_approved', message);
    perform log_property_expiration_event(p_property_id, 'agent', listing.listed_by_agent_id, 'renewal_approved', message);
    perform log_property_expiration_event(p_property_id, 'developer', listing.developer_id, 'renewal_approved', message);
    perform enqueue_agent_notification(listing.listed_by_agent_id, 'Listing renewed', message, p_property_id);
    return result;
  elsif p_actor_role = 'agent' then
    if listing.listed_by_agent_id is null or listing.listed_by_agent_id <> effective_id then raise exception 'Only the listing agent can request renewal'; end if;
  elsif p_actor_role = 'developer' then
    if not exists (select 1 from developer_accounts where auth_user_id = effective_id and developer_id = listing.developer_id and status = 'active') then raise exception 'Active developer membership required'; end if;
  else
    raise exception 'Invalid renewal actor';
  end if;

  insert into property_renewal_requests(property_id, requested_by_role, requested_by_id, notes)
  values (p_property_id, p_actor_role, effective_id, p_notes) returning * into result;
  update properties set renewal_status = 'awaiting_admin' where id = p_property_id;
  message := format('Renewal requested by %s for %s', p_actor_role, coalesce(listing.property_name, listing.id::text));
  perform log_property_expiration_event(p_property_id, 'admin', null, 'renewal_request', message);
  perform log_property_expiration_event(p_property_id, 'developer', listing.developer_id, 'renewal_request', message);
  if listing.listed_by_agent_id is not null then perform log_property_expiration_event(p_property_id, 'agent', listing.listed_by_agent_id, 'renewal_request', message); end if;
  return result;
end;
$$;

create or replace function public.review_property_renewal_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_approve boolean,
  p_notes text default null
) returns property_renewal_requests
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  request_row property_renewal_requests%rowtype;
  listing record;
  message text;
  caller uuid := auth.uid();
  effective_admin uuid := case when coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then p_admin_id else caller end;
begin
  if effective_admin is null or not exists (
    select 1 from admins
    where id = effective_admin
      and is_active = true
      and (role::text in ('listing_admin', 'super_admin')
        or 'listing_admin' = any(coalesce(roles::text[], '{}'::text[]))
        or 'super_admin' = any(coalesce(roles::text[], '{}'::text[])))
  ) then raise exception 'Active listing admin required'; end if;
  select * into request_row from property_renewal_requests where id = p_request_id for update;
  if not found then raise exception 'Renewal request % not found', p_request_id; end if;
  if request_row.status <> 'pending' then return request_row; end if;
  select * into listing from properties where id = request_row.property_id for update;
  if not p_approve then
    update property_renewal_requests set status = 'rejected', reviewed_by = effective_admin, reviewed_at = now(), notes = p_notes where id = p_request_id returning * into request_row;
    update properties set renewal_status = 'expired' where id = request_row.property_id;
    message := format('Renewal rejected for %s', coalesce(listing.property_name, listing.id::text));
    perform log_property_expiration_event(request_row.property_id, 'agent', listing.listed_by_agent_id, 'renewal_rejected', message);
    perform log_property_expiration_event(request_row.property_id, 'developer', listing.developer_id, 'renewal_rejected', message);
    perform enqueue_agent_notification(listing.listed_by_agent_id, 'Renewal rejected', message, request_row.property_id);
    return request_row;
  end if;
  update properties set expires_at = greatest(coalesce(listing.expires_at, now()), now()) + interval '3 months', last_renewed_at = now(), renewal_status = 'active', renewal_prompted_at = null, approval_status = 'approved', is_active = true where id = request_row.property_id returning * into listing;
  update property_renewal_requests set status = 'approved', reviewed_by = effective_admin, reviewed_at = now(), notes = p_notes where id = p_request_id returning * into request_row;
  message := format('Renewal approved for %s', coalesce(listing.property_name, listing.id::text));
  perform log_property_expiration_event(request_row.property_id, 'agent', listing.listed_by_agent_id, 'renewal_approved', message);
  perform log_property_expiration_event(request_row.property_id, 'developer', listing.developer_id, 'renewal_approved', message);
  perform enqueue_agent_notification(listing.listed_by_agent_id, 'Listing renewed', message, request_row.property_id);
  return request_row;
end;
$$;

revoke all on function public.request_property_renewal(uuid, property_renewal_actor, uuid, text) from public, anon;
grant execute on function public.request_property_renewal(uuid, property_renewal_actor, uuid, text) to authenticated, service_role;
revoke all on function public.review_property_renewal_request(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_property_renewal_request(uuid, uuid, boolean, text) to service_role;

-- Agents may read only their own reward/gift state. All writes and global
-- evaluation remain server-role-only; the claim RPC binds the target agent to
-- auth.uid() for authenticated callers.
do $$
begin
  if to_regclass('public.gifts') is not null then
    alter table public.gifts enable row level security;
    alter table public.gifts force row level security;
    revoke all on table public.gifts from anon, authenticated;
    grant select on table public.gifts to authenticated;
    drop policy if exists gifts_read on public.gifts;
    drop policy if exists gifts_admin_insert on public.gifts;
    drop policy if exists gifts_admin_update on public.gifts;
    drop policy if exists gifts_admin_delete on public.gifts;
    drop policy if exists gifts_authenticated_select on public.gifts;
    create policy gifts_authenticated_select on public.gifts for select to authenticated using (is_active = true);
  end if;
  if to_regclass('public.gift_eligibilities') is not null then
    alter table public.gift_eligibilities enable row level security;
    alter table public.gift_eligibilities force row level security;
    revoke all on table public.gift_eligibilities from anon, authenticated;
    grant select on table public.gift_eligibilities to authenticated;
    drop policy if exists gift_eligibilities_agent_read_own on public.gift_eligibilities;
    drop policy if exists gift_eligibilities_admin_insert on public.gift_eligibilities;
    drop policy if exists gift_eligibilities_admin_update on public.gift_eligibilities;
    drop policy if exists gift_eligibilities_admin_delete on public.gift_eligibilities;
    drop policy if exists gift_eligibilities_agent_select on public.gift_eligibilities;
    create policy gift_eligibilities_agent_select on public.gift_eligibilities for select to authenticated using (agent_id = auth.uid());
  end if;
  if to_regclass('public.gift_claims') is not null then
    alter table public.gift_claims enable row level security;
    alter table public.gift_claims force row level security;
    revoke all on table public.gift_claims from anon, authenticated;
    grant select on table public.gift_claims to authenticated;
    drop policy if exists gift_claims_agent_read_own on public.gift_claims;
    drop policy if exists gift_claims_agent_insert_own on public.gift_claims;
    drop policy if exists gift_claims_admin_update on public.gift_claims;
    drop policy if exists gift_claims_admin_delete on public.gift_claims;
    drop policy if exists gift_claims_agent_select on public.gift_claims;
    create policy gift_claims_agent_select on public.gift_claims for select to authenticated using (agent_id = auth.uid());
  end if;
end;
$$;

create or replace function public.create_gift_claim(p_gift_id uuid, p_agent_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  gift_row gifts%rowtype;
  active_claims integer := 0;
  eligibility gift_eligibilities%rowtype;
  claim_id uuid;
  caller uuid := auth.uid();
  service_call boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  if caller is null and not service_call then raise exception 'Authentication required'; end if;
  if not service_call and p_agent_id <> caller then raise exception 'Cannot claim a gift for another agent'; end if;
  select * into gift_row from gifts where id = p_gift_id and is_active = true;
  if not found then raise exception 'Gift not found or inactive'; end if;
  if gift_row.max_concurrent_claims is not null then
    select count(*) into active_claims from gift_claims where agent_id = p_agent_id and status in ('pending','approved','fulfilled');
    if active_claims >= gift_row.max_concurrent_claims then raise exception 'Claim limit reached'; end if;
  end if;
  select * into eligibility from gift_eligibilities where gift_id = p_gift_id and agent_id = p_agent_id and status = 'eligible';
  if not found then raise exception 'Gift not eligible'; end if;
  insert into gift_claims(gift_id, agent_id, status, claimed_at, updated_at)
  values (p_gift_id, p_agent_id, 'pending', now(), now()) returning id into claim_id;
  update gift_eligibilities set status = 'claimed', updated_at = now() where gift_id = p_gift_id and agent_id = p_agent_id;
  return claim_id;
end;
$$;

revoke all on function public.create_gift_claim(uuid, uuid) from public, anon;
grant execute on function public.create_gift_claim(uuid, uuid) to authenticated, service_role;
revoke all on function public.evaluate_gift_rules_for_agent(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_gift_rules_for_agent(uuid) to service_role;
revoke all on function public.evaluate_gift_rules_for_all() from public, anon, authenticated;
grant execute on function public.evaluate_gift_rules_for_all() to service_role;

commit;
