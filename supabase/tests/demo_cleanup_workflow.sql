-- Rollback-only contract for the cleanup preflight.  The suite must run on an
-- isolated migration-built database; it never calls a deletion function.
begin;

do $$
begin
  begin
    perform public.preview_demo_cleanup(clock_timestamp() - interval '7 days');
    raise exception 'preview_demo_cleanup was callable without service role';
  exception when others then
    if sqlerrm <> 'Service role required' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.role', 'service_role', true);

-- Synthetic rollback-only safety case: an old demo parent has a recent
-- non-demo child, an old demo child edited recently, and an old history row
-- without updated_at.  None may become a delete candidate for the parent.
set local session_replication_role = replica;
do $$
declare
  plan jsonb;
  cutoff timestamptz := clock_timestamp() - interval '7 days';
  parent_id uuid := '11111111-1111-4111-8111-111111111111';
  recent_project_id uuid := '22222222-2222-4222-8222-222222222222';
  edited_project_id uuid := '33333333-3333-4333-8333-333333333333';
  recent_moderation_id uuid := '44444444-4444-4444-8444-444444444444';
  old_activity_id uuid := '55555555-5555-4555-8555-555555555555';
  blocker_count bigint;
  edited_count bigint;
begin
  insert into public.demo_data_batches(batch_key, label)
  values ('cleanup-contract-batch', 'cleanup contract synthetic batch');
  insert into public.developers(id, name, created_at, updated_at, is_demo, demo_batch)
  values (parent_id, 'cleanup-contract-developer', cutoff - interval '30 days', cutoff - interval '30 days', true, 'cleanup-contract-batch');
  insert into public.developer_projects(id, developer_id, name, created_at, updated_at, is_demo, demo_batch)
  values
    (recent_project_id, parent_id, 'cleanup-contract-recent-project', cutoff + interval '1 hour', cutoff + interval '1 hour', false, null),
    (edited_project_id, parent_id, 'cleanup-contract-edited-project', cutoff - interval '30 days', cutoff + interval '1 hour', true, 'cleanup-contract-batch');
  insert into public.developer_project_moderation_events(id, project_id, developer_id, status, snapshot, created_at)
  values (recent_moderation_id, recent_project_id, parent_id, 'pending', '{}'::jsonb, cutoff + interval '1 hour');
  insert into public.developer_inventory_activity(id, developer_id, entity_type, action, metadata, created_at)
  values (old_activity_id, parent_id, 'project', 'old_history', '{}'::jsonb, cutoff - interval '30 days');

  plan := public.preview_demo_cleanup(cutoff);
  select count(*) into edited_count
  from jsonb_array_elements(plan->'business_rows') row
  where row->>'table_name' = 'developer_projects'
    and row->>'id' = edited_project_id::text
    and row->>'eligibility' = 'recent_edit';
  if edited_count <> 1 then
    raise exception 'Recently edited child was not protected';
  end if;

  select coalesce(sum((row->>'source_count')::bigint), 0) into blocker_count
  from jsonb_array_elements(plan->'dependency_blockers') row
  where row->>'target_table' = 'developers'
    and row->>'target_id' = parent_id::text
    and row->>'source_table' = 'developer_projects';
  if blocker_count < 2 then
    raise exception 'Recent/non-demo and recently edited project children did not block parent';
  end if;

  select coalesce(sum((row->>'source_count')::bigint), 0) into blocker_count
  from jsonb_array_elements(plan->'dependency_blockers') row
  where row->>'target_table' = 'developers'
    and row->>'target_id' = parent_id::text
    and row->>'source_table' = 'developer_inventory_activity';
  if blocker_count < 1 then
    raise exception 'Old history child without updated_at did not remain conservatively blocked';
  end if;

  begin
    perform public.preview_demo_cleanup(clock_timestamp() - interval '6 days');
    raise exception 'Preview accepted a cutoff less than seven days old';
  exception when others then
    if sqlerrm <> 'Cutoff must be at least seven days before the database clock' then raise; end if;
  end;
end;
$$;

do $$
declare
  plan jsonb;
  cutoff timestamptz := clock_timestamp() - interval '7 days';
begin
  plan := public.preview_demo_cleanup(cutoff);
  if plan->>'manifest_version' <> '1' then
    raise exception 'Unexpected cleanup manifest version';
  end if;
  if (plan->>'cutoff')::timestamptz is distinct from cutoff then
    raise exception 'Preview did not retain the supplied fixed cutoff';
  end if;
  if coalesce((plan->'execution_policy'->>'delete_auth_users')::boolean, true) then
    raise exception 'Auth deletion policy is not protected';
  end if;
  if coalesce((plan->'execution_policy'->>'delete_storage_objects')::boolean, true) then
    raise exception 'Storage deletion policy is not protected';
  end if;
  if coalesce((plan->'execution_policy'->>'delete_admins')::boolean, true) then
    raise exception 'Admin deletion policy is not protected';
  end if;
  if coalesce((plan->'execution_policy'->>'delete_users_profile')::boolean, true) then
    raise exception 'Mobile profile deletion policy is not protected';
  end if;
  if coalesce((plan->'identity_policy'->'security_artifacts'->>'delete_auth_users')::boolean, true) then
    raise exception 'Auth identity retirement policy is not review-only';
  end if;
  if coalesce((plan->'identity_policy'->'security_artifacts'->>'revoke_sessions')::boolean, true)
     or coalesce((plan->'identity_policy'->'security_artifacts'->>'revoke_refresh_tokens')::boolean, true) then
    raise exception 'Session/token cleanup was not separated from the plan';
  end if;
  if coalesce((plan->'identity_policy'->'security_artifacts'->>'recent_sessions_do_not_protect_old_identity')::boolean, false) = false then
    raise exception 'Recent session artifact incorrectly protects old identity';
  end if;
  if coalesce((plan->'identity_policy'->'referential_stub_option'->>'not_implemented_by_this_workflow')::boolean, false) = false then
    raise exception 'Referential stub option must remain owner-approved only';
  end if;
  if jsonb_typeof(plan->'foreign_key_graph') <> 'array' then
    raise exception 'Foreign-key graph is missing';
  end if;
  if jsonb_typeof(plan->'dependency_blockers') <> 'array' then
    raise exception 'Dependency blocker list is missing';
  end if;
  if coalesce((plan->'business_eligibility_policy'->>'updated_at_before_cutoff_required_when_present')::boolean, false) = false
     or plan->'business_eligibility_policy'->>'missing_updated_at_action' <> 'protect' then
    raise exception 'Recent-edit eligibility policy is not conservative';
  end if;
end;
$$;

-- The preflight is read-only: all profile/admin rows present before the call
-- remain present, and no auth/storage relation is touched by the contract.
do $$
declare
  before_profiles bigint;
  after_profiles bigint;
  before_admins bigint;
  after_admins bigint;
begin
  select count(*) into before_profiles from public.users_profile;
  select count(*) into before_admins from public.admins;
  perform public.preview_demo_cleanup(clock_timestamp() - interval '7 days');
  select count(*) into after_profiles from public.users_profile;
  select count(*) into after_admins from public.admins;
  if before_profiles <> after_profiles or before_admins <> after_admins then
    raise exception 'Protected profile/admin counts changed during preview';
  end if;
end;
$$;

rollback;
