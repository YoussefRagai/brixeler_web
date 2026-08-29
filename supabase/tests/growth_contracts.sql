begin;

do $$
declare
  required_table text;
  required_column text;
  missing text[] := '{}'::text[];
begin
  foreach required_table in array array[
    'growth_audiences', 'growth_audience_versions', 'growth_audit_log',
    'growth_resource_versions', 'growth_evaluation_runs', 'growth_evaluation_results',
    'agent_badge_awards'
  ] loop
    if to_regclass('public.' || required_table) is null then
      missing := array_append(missing, required_table);
    end if;
  end loop;
  if cardinality(missing) > 0 then raise exception 'Missing Growth tables: %', missing; end if;

  foreach required_column in array array[
    'growth_audiences.created_by', 'growth_audiences.updated_by', 'growth_audiences.definition',
    'growth_audiences.approval_status', 'growth_audiences.approved_by', 'growth_audiences.approved_at',
    'growth_resource_versions.changed_by',
    'notification_campaigns.audience_id', 'notification_campaigns.title_ar', 'notification_campaigns.message_ar',
    'dashboard_content.audience_id', 'dashboard_content.lifecycle_state', 'dashboard_content.version',
    'gifts.audience_id', 'gifts.fulfillment_method', 'gifts.approval_status',
    'gift_rules.audience_id', 'gift_rules.approval_status', 'admin_rules.audience_id',
    'tiers.promotion_criteria', 'tiers.demotion_criteria', 'tiers.stacking_mode', 'tiers.approval_status',
    'badges.is_repeatable', 'badges.visibility', 'badges.priority', 'badges.is_revocable', 'badges.approval_status',
    'gift_claims.fulfillment_owner_id', 'gift_claims.fulfillment_due_at', 'gift_claims.fulfillment_notes'
  ] loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and (c.table_name || '.' || c.column_name) = required_column
    ) then
      missing := array_append(missing, required_column);
    end if;
  end loop;
  if cardinality(missing) > 0 then raise exception 'Missing Growth columns: %', missing; end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'growth_audiences'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'growth_audiences must use forced RLS'; end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'growth_resource_versions'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'growth_resource_versions must use forced RLS'; end if;

  if has_function_privilege('authenticated', 'public.preview_growth_rule(text,uuid,uuid,jsonb,text,text,text,numeric,numeric,numeric,jsonb,integer)', 'execute') then
    raise exception 'Authenticated role must not execute named Growth previews';
  end if;
  if has_function_privilege('authenticated', 'public.restore_growth_resource_version(text,uuid,integer,uuid)', 'execute') then
    raise exception 'Authenticated role must not restore Growth versions';
  end if;
  if has_function_privilege('authenticated', 'public.run_growth_evaluation(text,boolean,uuid)', 'execute') then
    raise exception 'Authenticated role must not execute Growth evaluations';
  end if;
  if not has_function_privilege('authenticated', 'public.create_gift_claim(uuid,uuid)', 'execute') then
    raise exception 'Authenticated role must execute the agent-bound gift claim RPC';
  end if;
  if not has_function_privilege('service_role', 'public.preview_growth_rule(text,uuid,uuid,jsonb,text,text,text,numeric,numeric,numeric,jsonb,integer)', 'execute') then
    raise exception 'Service role must execute named Growth previews';
  end if;
end;
$$;

rollback;
