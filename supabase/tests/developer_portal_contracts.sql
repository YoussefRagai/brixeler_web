begin;

insert into auth.users(id, email)
values
  ('33333333-3333-4333-8333-333333333333', 'developer-contract@example.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'admin-contract@example.invalid');

insert into public.developers(id, name, lifecycle_state, published_at, is_active, is_demo)
values
  ('11111111-1111-4111-8111-111111111111', 'Contract Developer One', 'published', now(), true, false),
  ('22222222-2222-4222-8222-222222222222', 'Contract Developer Two', 'published', now(), true, false);

insert into public.developer_accounts(
  id, developer_id, auth_user_id, role, status, email, activated_at, is_demo
) values (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'project_manager', 'active', 'developer-contract@example.invalid', now(), false
);

insert into public.admins(id, role, roles, is_active)
values (
  '44444444-4444-4444-8444-444444444444',
  'developers_admin',
  array['developers_admin'::public.admin_role],
  true
);

insert into public.properties(
  id, developer_id, property_name, property_type, unit_area, price,
  description, photos, is_active, approval_status, is_demo, archived_at,
  archived_by_developer_account_id
) values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  'Archived contract listing', 'apartment', 100, 1000000,
  'Contract listing', array[
    'https://example.invalid/property-1.jpg',
    'https://example.invalid/property-2.jpg',
    'https://example.invalid/property-3.jpg'
  ], false,
  'pending', false, now(), '55555555-5555-4555-8555-555555555555'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if exists (
    select 1 from public.properties
    where id = '66666666-6666-4666-8666-666666666666'
  ) then
    raise exception 'Archived listing leaked through the authenticated mobile read boundary';
  end if;
end;
$$;

do $$
begin
  begin
    update public.developer_accounts
    set developer_id = '22222222-2222-4222-8222-222222222222', status = 'active'
    where id = '55555555-5555-4555-8555-555555555555';
    raise exception 'Authenticated developer unexpectedly changed its membership boundary';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  begin
    update public.properties
    set is_active = true
    where id = '66666666-6666-4666-8666-666666666666';
    raise exception 'Archived listing unexpectedly became active';
  exception
    when raise_exception then
      if sqlerrm = 'Archived listing unexpectedly became active' then raise; end if;
  end;
end;
$$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select (public.submit_developer_profile_revision(
  '11111111-1111-4111-8111-111111111111',
  '55555555-5555-4555-8555-555555555555',
  'Contract Developer One Reviewed',
  'Reviewed public description',
  'https://example.invalid/developer-logo.png'
)->>'revision_id')::uuid as revision_id \gset

select public.review_developer_profile_revision(
  :'revision_id'::uuid,
  '44444444-4444-4444-8444-444444444444',
  'approve',
  'Contract approval'
);

reset role;

do $$
begin
  if not exists (
    select 1 from public.developers
    where id = '11111111-1111-4111-8111-111111111111'
      and name = 'Contract Developer One Reviewed'
      and description = 'Reviewed public description'
      and logo_url = 'https://example.invalid/developer-logo.png'
  ) then
    raise exception 'Approved developer profile did not publish atomically';
  end if;
  if not exists (
    select 1 from public.developer_profile_revisions
    where developer_id = '11111111-1111-4111-8111-111111111111'
      and status = 'approved'
      and reviewed_by_admin_id = '44444444-4444-4444-8444-444444444444'
      and published_at is not null
  ) then
    raise exception 'Developer profile revision approval history is incomplete';
  end if;
  if not exists (
    select 1
    from public.admin_activity_log activity
    join public.developer_profile_revisions revision on revision.id = activity.entity_id
    where revision.developer_id = '11111111-1111-4111-8111-111111111111'
      and activity.action_type = 'developer.profile_approved'
  ) then
    raise exception 'Developer profile approval was not audited';
  end if;
end;
$$;

rollback;
