begin;

-- Shared Growth primitives. Existing tables/columns remain the mobile
-- contract; the fields below are additive and default to legacy-active
-- behavior until an administrator explicitly changes lifecycle_state.
create table if not exists public.growth_audiences (
  id uuid primary key default gen_random_uuid(),
  "key" text not null check (char_length(btrim("key")) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  name_ar text,
  description text,
  description_ar text,
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and definition <> '{}'::jsonb),
  lifecycle_state text not null default 'draft',
  start_at timestamptz,
  end_at timestamptz,
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  approval_status text not null default 'not_required',
  approved_by uuid references public.admins(id),
  approved_at timestamptz,
  rejection_reason text,
  created_by uuid references public.admins(id),
  updated_by uuid references public.admins(id),
  created_by_admin uuid references public.admins(id),
  updated_by_admin uuid references public.admins(id),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique ("key"),
  constraint growth_audiences_lifecycle_state_check
    check (lifecycle_state in ('draft', 'scheduled', 'active', 'paused', 'archived')),
  constraint growth_audiences_schedule_check
    check (end_at is null or start_at is null or end_at > start_at)
);

create table if not exists public.growth_audience_versions (
  id uuid primary key default gen_random_uuid(),
  audience_id uuid not null references public.growth_audiences(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  change_type text not null default 'update'
    check (change_type in ('create', 'update', 'publish', 'pause', 'archive', 'restore')),
  changed_by_admin uuid references public.admins(id),
  changed_by uuid references public.admins(id),
  created_at timestamptz not null default now(),
  unique (audience_id, version)
);

create table if not exists public.growth_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'audience', 'gift', 'gift_rule', 'admin_rule', 'tier', 'badge', 'notification_campaign', 'content', 'dashboard_content',
    'gift_claim', 'user_tier', 'agent_badge'
  )),
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete', 'publish', 'pause', 'archive', 'restore')),
  version integer,
  actor_admin_id uuid references public.admins(id),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.growth_resource_versions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'gift', 'gift_rule', 'admin_rule', 'tier', 'badge', 'notification_campaign', 'dashboard_content'
  )),
  entity_id uuid not null,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by_admin uuid references public.admins(id),
  changed_by uuid references public.admins(id),
  change_type text not null default 'update'
    check (change_type in ('create', 'update', 'publish', 'pause', 'archive', 'restore')),
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, version)
);

create index if not exists growth_audiences_lifecycle_idx
  on public.growth_audiences(lifecycle_state, start_at, end_at);
create index if not exists growth_audit_log_entity_idx
  on public.growth_audit_log(entity_type, entity_id, created_at desc);
create index if not exists growth_audience_versions_lookup_idx
  on public.growth_audience_versions(audience_id, version desc);
create index if not exists growth_resource_versions_lookup_idx
  on public.growth_resource_versions(entity_type, entity_id, version desc);

-- Demo records are removable as one explicit batch.  Defaults keep all
-- existing production rows unmarked and therefore outside demo cleanup.
alter table public.growth_audiences
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by uuid references public.admins(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text;
-- Any pre-existing live audience that has never passed the new approval gate
-- is held pending. Existing explicitly approved rows remain compatible.
update public.growth_audiences
set approval_status = 'pending',
    approved_by = null,
    approved_at = null,
    rejection_reason = null,
    metadata = jsonb_set(
      case when jsonb_typeof(metadata) = 'object' then metadata else '{}'::jsonb end,
      '{requires_second_approval}',
      'true'::jsonb,
      true
    )
where lifecycle_state in ('active', 'scheduled')
  and approval_status = 'not_required';
create index if not exists growth_audiences_demo_batch_idx
  on public.growth_audiences(demo_batch) where is_demo;

alter table public.gifts
  add column if not exists audience_id uuid references public.growth_audiences(id),
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by_admin uuid references public.admins(id),
  add column if not exists updated_by_admin uuid references public.admins(id),
  add column if not exists gift_type text not null default 'physical',
  add column if not exists value_amount numeric,
  add column if not exists currency text not null default 'EGP',
  add column if not exists quantity integer,
  add column if not exists fulfillment_method text not null default 'manual',
  add column if not exists fulfillment_instructions text,
  add column if not exists fulfillment_instructions_ar text,
  add column if not exists fulfillment_sla_hours integer,
  add column if not exists requires_approval boolean not null default true,
  add column if not exists terms text,
  add column if not exists terms_ar text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists max_total_claims integer,
  add column if not exists claim_window_days integer,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by uuid references public.admins(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;

alter table public.gift_rules
  add column if not exists audience_id uuid references public.growth_audiences(id),
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by_admin uuid references public.admins(id),
  add column if not exists updated_by_admin uuid references public.admins(id),
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by uuid references public.admins(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;

alter table public.admin_rules
  add column if not exists audience_id uuid references public.growth_audiences(id),
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_by_admin uuid references public.admins(id),
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by uuid references public.admins(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;

alter table public.gift_eligibilities
  add column if not exists evaluation_run_id uuid,
  add column if not exists rule_version integer,
  add column if not exists evaluated_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists reason text,
  add column if not exists reasons jsonb not null default '[]'::jsonb,
  add column if not exists conflicts jsonb not null default '[]'::jsonb,
  add column if not exists source text not null default 'evaluation',
  add column if not exists version integer not null default 1;

alter table public.gift_claims
  add column if not exists fulfillment_owner_id uuid references public.admins(id),
  add column if not exists fulfillment_sla_hours integer,
  add column if not exists fulfillment_due_at timestamptz,
  add column if not exists fulfillment_started_at timestamptz,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfillment_notes text,
  add column if not exists fulfillment_reference text,
  add column if not exists fulfillment_metadata jsonb not null default '{}'::jsonb,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.admins(id),
  add column if not exists rejected_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists updated_by_admin uuid references public.admins(id),
  add column if not exists version integer not null default 1,
  add column if not exists resolution_reason text;

alter table public.tiers
  add column if not exists name_ar text,
  add column if not exists audience_id uuid references public.growth_audiences(id),
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by_admin uuid references public.admins(id),
  add column if not exists updated_by_admin uuid references public.admins(id),
  add column if not exists promotion_criteria jsonb not null default '{}'::jsonb,
  add column if not exists demotion_criteria jsonb not null default '{}'::jsonb,
  add column if not exists promotion_grace_days integer not null default 0,
  add column if not exists demotion_grace_days integer not null default 0,
  add column if not exists reset_period text not null default 'never',
  add column if not exists reset_at timestamptz,
  add column if not exists stacking_mode text not null default 'exclusive',
  add column if not exists stacking_priority integer not null default 0,
  add column if not exists max_stack_count integer,
  add column if not exists carry_over boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by uuid references public.admins(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;

alter table public.user_tiers
  add column if not exists source text not null default 'rule',
  add column if not exists previous_tier_id uuid references public.tiers(id),
  add column if not exists promoted_at timestamptz,
  add column if not exists demoted_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists reset_at timestamptz,
  add column if not exists last_evaluated_at timestamptz,
  add column if not exists promotion_count integer not null default 0,
  add column if not exists demotion_count integer not null default 0,
  add column if not exists stacking_key text,
  add column if not exists transition_reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table public.badges
  add column if not exists audience_id uuid references public.growth_audiences(id),
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by_admin uuid references public.admins(id),
  add column if not exists updated_by_admin uuid references public.admins(id),
  add column if not exists is_repeatable boolean not null default false,
  add column if not exists visibility text not null default 'public',
  add column if not exists priority integer not null default 0,
  add column if not exists is_revocable boolean not null default true,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.admins(id),
  add column if not exists revocation_reason text,
  add column if not exists benefit_code text,
  add column if not exists benefit_metadata jsonb not null default '{}'::jsonb,
  add column if not exists benefit_expires_in_days integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by uuid references public.admins(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;

alter table public.agent_badges
  add column if not exists award_count integer not null default 1,
  add column if not exists last_awarded_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.admins(id),
  add column if not exists revocation_reason text,
  add column if not exists benefit_granted boolean not null default false,
  add column if not exists benefit_expires_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists version integer not null default 1;

create table if not exists public.agent_badge_awards (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  award_number integer not null default 1 check (award_number > 0),
  awarded_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.admins(id),
  revocation_reason text,
  benefit_granted boolean not null default false,
  benefit_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (agent_id, badge_id, award_number)
);

alter table public.notification_campaigns
  add column if not exists audience_id uuid references public.growth_audiences(id),
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists title_ar text,
  add column if not exists message_ar text,
  add column if not exists body_ar text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_by uuid references public.admins(id),
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by uuid references public.admins(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.dashboard_content
  add column if not exists audience_id uuid references public.growth_audiences(id),
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists published_by uuid references public.admins(id),
  add column if not exists archived_at timestamptz;

create table if not exists public.growth_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'all' check (scope in ('all', 'gifts', 'rewards', 'audiences')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  dry_run boolean not null default true,
  requested_by_admin uuid references public.admins(id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  candidate_count integer not null default 0,
  eligible_count integer not null default 0,
  conflict_count integer not null default 0,
  applied_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.growth_evaluation_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.growth_evaluation_runs(id) on delete cascade,
  entity_type text not null check (entity_type in ('gift', 'gift_rule', 'admin_rule', 'tier', 'badge', 'audience')),
  entity_id uuid not null,
  agent_id uuid not null references public.users_profile(id) on delete cascade,
  qualifies boolean not null,
  would_apply boolean not null default false,
  applied boolean not null default false,
  reason text,
  reasons jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  metric_value numeric,
  created_at timestamptz not null default now(),
  unique (run_id, entity_type, entity_id, agent_id)
);

create index if not exists growth_evaluation_runs_status_idx
  on public.growth_evaluation_runs(status, requested_at desc);
create index if not exists growth_evaluation_results_run_idx
  on public.growth_evaluation_results(run_id, qualifies, applied);
create index if not exists growth_evaluation_results_agent_idx
  on public.growth_evaluation_results(agent_id, created_at desc);
create index if not exists gifts_growth_audience_idx on public.gifts(audience_id);
create index if not exists gift_rules_growth_audience_idx on public.gift_rules(audience_id);
create index if not exists admin_rules_growth_audience_idx on public.admin_rules(audience_id);
create index if not exists notification_campaigns_growth_audience_idx on public.notification_campaigns(audience_id);
create index if not exists gift_claims_fulfillment_queue_idx
  on public.gift_claims(status, fulfillment_due_at, fulfillment_owner_id);
create index if not exists agent_badge_awards_agent_badge_idx
  on public.agent_badge_awards(agent_id, badge_id, awarded_at desc);
create index if not exists gifts_growth_demo_batch_idx on public.gifts(demo_batch) where is_demo;
create index if not exists gift_rules_growth_demo_batch_idx on public.gift_rules(demo_batch) where is_demo;
create index if not exists admin_rules_growth_demo_batch_idx on public.admin_rules(demo_batch) where is_demo;
create index if not exists tiers_growth_demo_batch_idx on public.tiers(demo_batch) where is_demo;
create index if not exists badges_growth_demo_batch_idx on public.badges(demo_batch) where is_demo;

create or replace function public.growth_is_live(
  p_lifecycle_state text,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_is_active boolean default true
)
returns boolean
language sql
stable
as $$
  select coalesce(p_is_active, true)
    and p_lifecycle_state in ('scheduled', 'active')
    and (p_lifecycle_state <> 'scheduled' or p_start_at is not null and p_start_at <= now())
    and (p_start_at is null or p_start_at <= now())
    and (p_end_at is null or p_end_at > now());
$$;

create or replace function public.growth_definition_matches_agent(
  p_definition jsonb,
  p_agent_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  profile_row public.users_profile%rowtype;
  condition_row jsonb;
  conditions jsonb;
  match_mode text;
  field_name text;
  operator_name text;
  condition_mode text;
  condition_match boolean;
  any_match boolean := false;
  all_match boolean := true;
  condition_count integer := 0;
  numeric_value numeric;
  maximum_value numeric;
  current_value numeric;
  tier_level integer;
  value_text text;
begin
  if p_agent_id is null or p_definition is null or jsonb_typeof(p_definition) <> 'object' then
    return false;
  end if;

  select * into profile_row from public.users_profile where id = p_agent_id;
  if not found then return false; end if;

  -- The API accepts {match: all|any, conditions:[...]}. A small legacy
  -- agent_ids form is supported for migrations and operational previews.
  if p_definition ? 'agent_ids' then
    if not exists (
      select 1
      from jsonb_array_elements_text(case when jsonb_typeof(p_definition->'agent_ids') = 'array' then p_definition->'agent_ids' else '[]'::jsonb end) value
      where value = p_agent_id::text
    ) then
      return false;
    end if;
  end if;

  conditions := case
    when jsonb_typeof(p_definition->'conditions') = 'array' then p_definition->'conditions'
    when p_definition ? 'metric' then jsonb_build_array(p_definition)
    else '[]'::jsonb
  end;
  match_mode := lower(coalesce(p_definition->>'match', 'all'));
  if match_mode not in ('all', 'any') then return false; end if;

  for condition_row in select value from jsonb_array_elements(conditions)
  loop
    if jsonb_typeof(condition_row) <> 'object' then return false; end if;
    field_name := lower(btrim(coalesce(condition_row->>'field', condition_row->>'metric', '')));
    operator_name := lower(btrim(coalesce(condition_row->>'operator', 'equals')));
    condition_mode := lower(coalesce(condition_row->>'mode', 'include'));
    if field_name = '' or condition_mode not in ('include', 'exclude') then return false; end if;
    condition_count := condition_count + 1;
    condition_match := false;

    if field_name = 'agent_id' or field_name = 'agent_ids' then
      condition_match := case
        when operator_name in ('equals', 'eq', '=', 'in') then exists (
          select 1
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(condition_row->'value') = 'array' then condition_row->'value'
              else jsonb_build_array(condition_row->>'value')
            end
          ) value
          where value = p_agent_id::text
        )
        when operator_name in ('not_equals', 'neq', '<>', 'not_in') then not exists (
          select 1
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(condition_row->'value') = 'array' then condition_row->'value'
              else jsonb_build_array(condition_row->>'value')
            end
          ) value
          where value = p_agent_id::text
        )
        else false
      end;
    elsif field_name = 'verification_status' then
      value_text := profile_row.verification_status::text;
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then value_text = condition_row->>'value'
        when operator_name in ('not_equals', 'neq', '<>') then value_text <> condition_row->>'value'
        when operator_name = 'in' then value_text = any (array(select jsonb_array_elements_text(condition_row->'value')))
        when operator_name = 'not_in' then not (value_text = any (array(select jsonb_array_elements_text(condition_row->'value'))))
        else false
      end;
    elsif field_name = 'account_status' or field_name = 'status' then
      value_text := profile_row.account_status::text;
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then value_text = condition_row->>'value'
        when operator_name in ('not_equals', 'neq', '<>') then value_text <> condition_row->>'value'
        when operator_name = 'in' then value_text = any (array(select jsonb_array_elements_text(condition_row->'value')))
        when operator_name = 'not_in' then not (value_text = any (array(select jsonb_array_elements_text(condition_row->'value'))))
        else false
      end;
    elsif field_name = 'language_preference' then
      value_text := profile_row.language_preference;
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then value_text = condition_row->>'value'
        when operator_name in ('not_equals', 'neq', '<>') then value_text <> condition_row->>'value'
        when operator_name = 'in' then value_text = any (array(select jsonb_array_elements_text(condition_row->'value')))
        when operator_name = 'not_in' then not (value_text = any (array(select jsonb_array_elements_text(condition_row->'value'))))
        when operator_name = 'contains' then value_text ilike '%' || (condition_row->>'value') || '%'
        else false
      end;
    elsif field_name = 'tier_id' then
      select ut.tier_id::text into value_text
      from public.user_tiers ut
      where ut.user_id = p_agent_id
      limit 1;
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then value_text = condition_row->>'value'
        when operator_name in ('not_equals', 'neq', '<>') then value_text <> condition_row->>'value'
        when operator_name = 'in' then value_text = any (array(select jsonb_array_elements_text(condition_row->'value')))
        when operator_name = 'not_in' then not (value_text = any (array(select jsonb_array_elements_text(condition_row->'value'))))
        else false
      end;
    elsif field_name = 'developer_name' then
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then exists (
          select 1 from public.deals d where d.agent_id = p_agent_id and d.developer_name = condition_row->>'value'
        )
        when operator_name in ('not_equals', 'neq', '<>') then not exists (
          select 1 from public.deals d where d.agent_id = p_agent_id and d.developer_name = condition_row->>'value'
        )
        when operator_name = 'contains' then exists (
          select 1 from public.deals d where d.agent_id = p_agent_id and d.developer_name ilike '%' || (condition_row->>'value') || '%'
        )
        when operator_name = 'in' then exists (
          select 1 from public.deals d where d.agent_id = p_agent_id and d.developer_name = any (array(select jsonb_array_elements_text(condition_row->'value')))
        )
        when operator_name = 'not_in' then not exists (
          select 1 from public.deals d where d.agent_id = p_agent_id and d.developer_name = any (array(select jsonb_array_elements_text(condition_row->'value')))
        )
        else false
      end;
    elsif field_name = 'project_id' then
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.project_id::text = condition_row->>'value'
        )
        when operator_name in ('not_equals', 'neq', '<>') then not exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.project_id::text = condition_row->>'value'
        )
        when operator_name = 'in' then exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.project_id::text = any (array(select jsonb_array_elements_text(condition_row->'value')))
        )
        when operator_name = 'not_in' then not exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.project_id::text = any (array(select jsonb_array_elements_text(condition_row->'value')))
        )
        else false
      end;
    elsif field_name = 'property_type' then
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.property_type::text = condition_row->>'value'
        )
        when operator_name in ('not_equals', 'neq', '<>') then not exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.property_type::text = condition_row->>'value'
        )
        when operator_name = 'contains' then exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.property_type::text ilike '%' || (condition_row->>'value') || '%'
        )
        when operator_name = 'in' then exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.property_type::text = any (array(select jsonb_array_elements_text(condition_row->'value')))
        )
        when operator_name = 'not_in' then not exists (
          select 1 from public.properties p where p.listed_by_agent_id = p_agent_id and p.property_type::text = any (array(select jsonb_array_elements_text(condition_row->'value')))
        )
        else false
      end;
    elsif field_name in ('total_deals', 'total_referrals', 'verified_referrals', 'base_commission_rate') then
      current_value := case field_name
        when 'total_deals' then coalesce(profile_row.total_deals, 0)
        when 'total_referrals' then coalesce(profile_row.total_referrals, 0)
        when 'verified_referrals' then coalesce(profile_row.verified_referrals, 0)
        else coalesce(profile_row.base_commission_rate, 0)
      end;
      begin
        numeric_value := (condition_row->>'value')::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        return false;
      end;
      if operator_name = 'between' then
        begin
          maximum_value := (condition_row->>'max')::numeric;
        exception when invalid_text_representation or numeric_value_out_of_range then
          return false;
        end;
      end if;
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then current_value = numeric_value
        when operator_name in ('not_equals', 'neq', '<>') then current_value <> numeric_value
        when operator_name in ('gte', '>=') then current_value >= numeric_value
        when operator_name in ('lte', '<=') then current_value <= numeric_value
        when operator_name = 'gt' then current_value > numeric_value
        when operator_name = 'lt' then current_value < numeric_value
        when operator_name = 'between' then current_value between numeric_value and maximum_value
        else false
      end;
    elsif field_name in ('tier_level', 'current_tier_level') then
      select public.agent_current_tier_level(p_agent_id) into tier_level;
      current_value := coalesce(tier_level, 0);
      begin
        numeric_value := (condition_row->>'value')::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        return false;
      end;
      if operator_name = 'between' then
        begin
          maximum_value := (condition_row->>'max')::numeric;
        exception when invalid_text_representation or numeric_value_out_of_range then
          return false;
        end;
      end if;
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then current_value = numeric_value
        when operator_name in ('not_equals', 'neq', '<>') then current_value <> numeric_value
        when operator_name in ('gte', '>=') then current_value >= numeric_value
        when operator_name in ('lte', '<=') then current_value <= numeric_value
        when operator_name = 'gt' then current_value > numeric_value
        when operator_name = 'lt' then current_value < numeric_value
        when operator_name = 'between' then current_value between numeric_value and maximum_value
        else false
      end;
    elsif field_name in ('deals_count', 'deals_volume', 'revenue', 'referrals', 'claim_acceptance', 'listings_count') then
      begin
        numeric_value := (condition_row->>'value')::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        return false;
      end;
      if operator_name = 'between' then
        begin
          maximum_value := (condition_row->>'max')::numeric;
        exception when invalid_text_representation or numeric_value_out_of_range then
          return false;
        end;
      end if;
      current_value := public.reward_metric_value(
        p_agent_id,
        field_name,
        coalesce(condition_row->>'time_window', 'all_time'),
        coalesce(condition_row->'filters', '{}'::jsonb)
      );
      condition_match := case
        when operator_name in ('equals', 'eq', '=') then current_value = numeric_value
        when operator_name in ('gte', '>=') then current_value >= numeric_value
        when operator_name in ('lte', '<=') then current_value <= numeric_value
        when operator_name = 'gt' then current_value > numeric_value
        when operator_name = 'lt' then current_value < numeric_value
        when operator_name = 'between' then current_value between numeric_value and maximum_value
        else false
      end;
    else
      -- Unknown fields never match. This is the database-side guard against
      -- broad or future fields silently becoming executable rules.
      return false;
    end if;

    if condition_mode = 'exclude' then condition_match := not condition_match; end if;
    if match_mode = 'any' then
      any_match := any_match or condition_match;
    else
      all_match := all_match and condition_match;
    end if;
  end loop;

  if condition_count = 0 and not (p_definition ? 'agent_ids') then return false; end if;
  return case when match_mode = 'any' then any_match else all_match end;
end;
$$;
create or replace function public.growth_audience_matches_agent(
  p_audience_id uuid,
  p_agent_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.growth_is_live(a.lifecycle_state, a.start_at, a.end_at, true)
    and a.approval_status in ('not_required', 'approved')
    and public.growth_definition_matches_agent(a.definition, p_agent_id)
  from public.growth_audiences a
  where a.id = p_audience_id
    and (
      coalesce(auth.role(), '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin')
      or p_agent_id = auth.uid()
    );
$$;

create or replace function public.growth_conflicts_for_agent(
  p_target_type text,
  p_target_id uuid,
  p_agent_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  conflicts jsonb := '[]'::jsonb;
  gift_row public.gifts%rowtype;
  badge_row public.badges%rowtype;
  tier_row public.tiers%rowtype;
  agent_tier_id uuid;
  active_claims integer := 0;
  total_claims integer := 0;
begin
  if p_target_type = 'gift' then
    select * into gift_row from public.gifts where id = p_target_id;
    if not found then
      return jsonb_build_array(jsonb_build_object('code', 'target_not_found', 'message', 'Gift no longer exists'));
    end if;
    if not public.growth_is_live(gift_row.lifecycle_state, gift_row.start_at, gift_row.end_at, gift_row.is_active) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'inactive', 'message', 'Gift is not active in its scheduled window'));
    end if;
    if gift_row.audience_id is not null and not public.growth_audience_matches_agent(gift_row.audience_id, p_agent_id) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'audience', 'message', 'Agent is outside the gift audience'));
    end if;
    if gift_row.approval_status not in ('not_required', 'approved') then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'approval', 'message', 'Gift is awaiting approval'));
    end if;
    if gift_row.tier_ids is not null and cardinality(gift_row.tier_ids) > 0 then
      select ut.tier_id into agent_tier_id from public.user_tiers ut where ut.user_id = p_agent_id limit 1;
      if agent_tier_id is null or not (agent_tier_id = any(gift_row.tier_ids)) then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'tier', 'message', 'Agent tier is not eligible for this gift'));
      end if;
    end if;
    if gift_row.max_total_claims is not null then
      select count(*) into total_claims from public.gift_claims where gift_id = p_target_id and status <> 'cancelled';
      if total_claims >= gift_row.max_total_claims then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'inventory', 'message', 'Gift claim inventory is exhausted'));
      end if;
    end if;
    if gift_row.max_concurrent_claims is not null then
      select count(*) into active_claims
      from public.gift_claims
      where agent_id = p_agent_id and status in ('pending', 'approved');
      if active_claims >= gift_row.max_concurrent_claims then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'claim_limit', 'message', 'Agent claim limit is reached'));
      end if;
    end if;
    if gift_row.exclusivity_mode = 'eligible' and exists (
      select 1 from public.gift_eligibilities ge
      join public.gifts other_gift on other_gift.id = ge.gift_id
      where ge.agent_id = p_agent_id and ge.gift_id <> p_target_id
        and ge.status = 'eligible' and other_gift.exclusivity_mode = 'eligible'
    ) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'exclusive_eligibility', 'message', 'Another exclusive gift is already eligible'));
    end if;
    if gift_row.exclusivity_mode = 'claimed' and exists (
      select 1 from public.gift_claims gc
      join public.gifts other_gift on other_gift.id = gc.gift_id
      where gc.agent_id = p_agent_id and gc.gift_id <> p_target_id
        and gc.status in ('pending', 'approved', 'fulfilled') and other_gift.exclusivity_mode = 'claimed'
    ) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'exclusive_claim', 'message', 'Another exclusive gift is already claimed'));
    end if;
  elsif p_target_type = 'badge' then
    select * into badge_row from public.badges where id = p_target_id;
    if not found then
      return jsonb_build_array(jsonb_build_object('code', 'target_not_found', 'message', 'Badge no longer exists'));
    end if;
    if not public.growth_is_live(badge_row.lifecycle_state, badge_row.start_at, badge_row.end_at, badge_row.is_active)
       or badge_row.revoked_at is not null then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'inactive', 'message', 'Badge is not available'));
    end if;
    if badge_row.audience_id is not null and not public.growth_audience_matches_agent(badge_row.audience_id, p_agent_id) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'audience', 'message', 'Agent is outside the badge audience'));
    end if;
    if badge_row.approval_status not in ('not_required', 'approved') then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'approval', 'message', 'Badge is awaiting approval'));
    end if;
    if not badge_row.is_repeatable and exists (
      select 1 from public.agent_badges ab
      where ab.agent_id = p_agent_id and ab.badge_id = p_target_id and ab.revoked_at is null
    ) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'already_awarded', 'message', 'Badge has already been awarded'));
    end if;
  elsif p_target_type = 'tier' then
    select * into tier_row from public.tiers where id = p_target_id;
    if not found then
      return jsonb_build_array(jsonb_build_object('code', 'target_not_found', 'message', 'Tier no longer exists'));
    end if;
    if not public.growth_is_live(tier_row.lifecycle_state, tier_row.start_at, tier_row.end_at, tier_row.is_active) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'inactive', 'message', 'Tier is not active in its scheduled window'));
    end if;
    if tier_row.audience_id is not null and not public.growth_audience_matches_agent(tier_row.audience_id, p_agent_id) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'audience', 'message', 'Agent is outside the tier audience'));
    end if;
    if tier_row.approval_status not in ('not_required', 'approved') then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code', 'approval', 'message', 'Tier is awaiting approval'));
    end if;
  end if;
  return conflicts;
end;
$$;

create or replace function public.preview_growth_rule(
  p_target_type text default null,
  p_target_id uuid default null,
  p_audience_id uuid default null,
  p_definition jsonb default null,
  p_metric text default null,
  p_time_window text default null,
  p_operator text default null,
  p_value_single numeric default null,
  p_value_min numeric default null,
  p_value_max numeric default null,
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  agent_row record;
  matches boolean;
  candidate_count integer := 0;
  eligible_count integer := 0;
  conflict_count integer := 0;
  result_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  sample_ids text[] := array[]::text[];
  recipients jsonb := '[]'::jsonb;
  conflicts jsonb;
  reason_text text;
  warning_items jsonb := '[]'::jsonb;
begin
  if p_audience_id is not null and not exists (select 1 from public.growth_audiences where id = p_audience_id) then
    warning_items := warning_items || jsonb_build_array('Audience not found');
  end if;
  if p_target_type is not null and p_target_id is null then
    warning_items := warning_items || jsonb_build_array('Target is not selected');
  end if;
  if p_metric is null and p_audience_id is null and p_definition is null then
    warning_items := warning_items || jsonb_build_array('A named audience or executable rule is required');
  end if;

  for agent_row in
    select
      profile.id,
      coalesce(nullif(profile.display_name, ''), nullif(concat_ws(' ', profile.first_name_en, profile.last_name_en), ''), profile.id::text) as display_name,
      profile.profile_picture_url
    from public.users_profile profile
    where profile.account_status = 'active'
    order by profile.id
  loop
    matches := case
      when p_audience_id is not null then public.growth_audience_matches_agent(p_audience_id, agent_row.id)
      when p_definition is not null then public.growth_definition_matches_agent(p_definition, agent_row.id)
      when p_metric is not null and p_operator is not null then public.reward_agent_matches_rule(
        agent_row.id, p_metric, coalesce(p_time_window, 'all_time'), p_operator,
        p_value_single, p_value_min, p_value_max, coalesce(p_filters, '{}'::jsonb)
      )
      else false
    end;
    if not matches then continue; end if;

    candidate_count := candidate_count + 1;
    sample_ids := sample_ids || agent_row.id::text;
    conflicts := case when p_target_type is null or p_target_id is null
      then '[]'::jsonb
      else public.growth_conflicts_for_agent(p_target_type, p_target_id, agent_row.id)
    end;
    if jsonb_array_length(conflicts) = 0 then eligible_count := eligible_count + 1; else conflict_count := conflict_count + 1; end if;
    reason_text := case
      when jsonb_array_length(conflicts) > 0 then 'Matches the audience, but has one or more conflicts'
      when p_audience_id is not null then 'Matches the named audience'
      when p_definition is not null then 'Matches the supplied audience definition'
      else format('Matches %s %s', coalesce(p_metric, 'rule'), coalesce(p_operator, ''))
    end;
    if candidate_count <= result_limit then
      recipients := recipients || jsonb_build_array(jsonb_build_object(
        'id', agent_row.id,
        'agent_id', agent_row.id,
        'name', agent_row.display_name,
        'display_name', agent_row.display_name,
        'avatarUrl', agent_row.profile_picture_url,
        'avatar_url', agent_row.profile_picture_url,
        'reason', reason_text,
        'eligible', jsonb_array_length(conflicts) = 0,
        'conflicts', conflicts
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'count', candidate_count,
    'eligible_count', eligible_count,
    'excludedCount', conflict_count,
    'conflict_count', conflict_count,
    'sample', coalesce(sample_ids[1:10], array[]::text[]),
    'sample_ids', coalesce(sample_ids[1:10], array[]::text[]),
    'recipients', recipients,
    'conflicts', jsonb_build_object('count', conflict_count),
    'warnings', warning_items,
    'generated_at', now()
  );
end;
$$;

create or replace function public.preview_growth_audience(
  p_audience_id uuid default null,
  p_definition jsonb default null,
  p_limit integer default 25
)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select public.preview_growth_rule(
    p_target_type => null,
    p_target_id => null,
    p_audience_id => p_audience_id,
    p_definition => p_definition,
    p_limit => p_limit
  );
$$;

create or replace function public.growth_award_badge(
  p_agent_id uuid,
  p_badge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  badge_row public.badges%rowtype;
  badge_assignment public.agent_badges%rowtype;
  next_award_number integer;
  expiry timestamptz;
begin
  select * into badge_row
  from public.badges
  where id = p_badge_id;
  if not found or badge_row.approval_status not in ('not_required', 'approved')
     or not public.growth_is_live(badge_row.lifecycle_state, badge_row.start_at, badge_row.end_at, badge_row.is_active)
     or badge_row.revoked_at is not null then
    return false;
  end if;
  if badge_row.audience_id is not null and not public.growth_audience_matches_agent(badge_row.audience_id, p_agent_id) then
    return false;
  end if;

  select * into badge_assignment
  from public.agent_badges
  where agent_id = p_agent_id and badge_id = p_badge_id
  for update;

  if not badge_row.is_repeatable and found and badge_assignment.revoked_at is null
     and (badge_assignment.expires_at is null or badge_assignment.expires_at > now()) then
    return false;
  end if;

  next_award_number := coalesce(badge_assignment.award_count, 0) + 1;
  expiry := case when badge_row.expires_in_days is not null
    then now() + make_interval(days => badge_row.expires_in_days) else null end;

  insert into public.agent_badge_awards(
    agent_id, badge_id, award_number, awarded_at, expires_at,
    benefit_granted, benefit_expires_at, metadata
  ) values (
    p_agent_id, p_badge_id, next_award_number, now(), expiry,
    badge_row.benefit_type <> 'none',
    case when badge_row.benefit_expires_in_days is not null
      then now() + make_interval(days => badge_row.benefit_expires_in_days) else null end,
    badge_row.benefit_metadata
  ) on conflict (agent_id, badge_id, award_number) do nothing;

  insert into public.agent_badges(
    agent_id, badge_id, unlocked_at, expires_at, award_count,
    last_awarded_at, revoked_at, revoked_by, revocation_reason,
    benefit_granted, benefit_expires_at, metadata, version
  ) values (
    p_agent_id, p_badge_id, now(), expiry, next_award_number, now(), null, null, null,
    badge_row.benefit_type <> 'none',
    case when badge_row.benefit_expires_in_days is not null
      then now() + make_interval(days => badge_row.benefit_expires_in_days) else null end,
    badge_row.benefit_metadata, 1
  ) on conflict (agent_id, badge_id) do update set
    unlocked_at = now(),
    expires_at = excluded.expires_at,
    award_count = case when badge_row.is_repeatable then excluded.award_count else public.agent_badges.award_count end,
    last_awarded_at = now(),
    revoked_at = null,
    revoked_by = null,
    revocation_reason = null,
    benefit_granted = excluded.benefit_granted,
    benefit_expires_at = excluded.benefit_expires_at,
    metadata = excluded.metadata,
    version = public.agent_badges.version + 1;
  return true;
end;
$$;

create or replace function public.growth_apply_tier(
  p_agent_id uuid,
  p_tier_id uuid,
  p_reason text,
  p_allow_demotion boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_tier public.tiers%rowtype;
  current_assignment public.user_tiers%rowtype;
  current_level integer;
begin
  select * into target_tier from public.tiers where id = p_tier_id;
  if not found or target_tier.approval_status not in ('not_required', 'approved')
     or not public.growth_is_live(target_tier.lifecycle_state, target_tier.start_at, target_tier.end_at, target_tier.is_active) then
    return false;
  end if;
  if target_tier.audience_id is not null and not public.growth_audience_matches_agent(target_tier.audience_id, p_agent_id) then
    return false;
  end if;
  select * into current_assignment from public.user_tiers where user_id = p_agent_id for update;
  if found then
    select level into current_level from public.tiers where id = current_assignment.tier_id;
    if current_level is not null and current_level = target_tier.level then
      update public.user_tiers set last_evaluated_at = now(), updated_at = now() where id = current_assignment.id;
      return false;
    end if;
    if current_level is not null and target_tier.level < current_level and not p_allow_demotion then
      return false;
    end if;
    update public.user_tiers
    set previous_tier_id = tier_id,
        tier_id = p_tier_id,
        awarded_at = now(),
        promoted_at = case when current_level is null or target_tier.level > current_level then now() else promoted_at end,
        demoted_at = case when current_level is not null and target_tier.level < current_level then now() else demoted_at end,
        promotion_count = promotion_count + case when current_level is null or target_tier.level > current_level then 1 else 0 end,
        demotion_count = demotion_count + case when current_level is not null and target_tier.level < current_level then 1 else 0 end,
        transition_reason = nullif(btrim(p_reason), ''),
        last_evaluated_at = now(),
        updated_at = now(),
        version = version + 1
    where id = current_assignment.id;
  else
    insert into public.user_tiers(
      user_id, tier_id, awarded_at, promoted_at, last_evaluated_at,
      promotion_count, transition_reason, version
    ) values (p_agent_id, p_tier_id, now(), now(), now(), 1, nullif(btrim(p_reason), ''), 1);
  end if;
  return true;
end;
$$;

create or replace function public.evaluate_admin_rules_for_agent(p_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  rule_row record;
  badge_row public.badges%rowtype;
  tier_row public.tiers%rowtype;
  should_match boolean;
begin
  if p_agent_id is null then return; end if;

  delete from public.agent_badges
  where agent_id = p_agent_id
    and expires_at is not null and expires_at <= now();

  for rule_row in
    select * from public.admin_rules
    where is_active
      and approval_status in ('not_required', 'approved')
      and public.growth_is_live(lifecycle_state, start_at, end_at, true)
  loop
    if rule_row.audience_id is not null
       and not public.growth_audience_matches_agent(rule_row.audience_id, p_agent_id) then
      continue;
    end if;
    should_match := public.reward_agent_matches_rule(
      p_agent_id, rule_row.metric, rule_row.time_window, rule_row.operator,
      rule_row.value_single, rule_row.value_min, rule_row.value_max,
      coalesce(rule_row.filters, '{}'::jsonb)
    );
    if not should_match then continue; end if;

    if rule_row.target_type = 'badge' then
      select * into badge_row from public.badges where id = rule_row.target_id;
      if found and badge_row.approval_status in ('not_required', 'approved')
         and public.growth_is_live(badge_row.lifecycle_state, badge_row.start_at, badge_row.end_at, badge_row.is_active)
         and badge_row.revoked_at is null
         and (badge_row.audience_id is null or public.growth_audience_matches_agent(badge_row.audience_id, p_agent_id)) then
        perform public.growth_award_badge(p_agent_id, badge_row.id);
      end if;
    elsif rule_row.target_type = 'tier' then
      select * into tier_row from public.tiers where id = rule_row.target_id;
      if found and public.growth_is_live(tier_row.lifecycle_state, tier_row.start_at, tier_row.end_at, tier_row.is_active)
         and (tier_row.audience_id is null or public.growth_audience_matches_agent(tier_row.audience_id, p_agent_id)) then
        perform public.growth_apply_tier(
          p_agent_id,
          tier_row.id,
          coalesce(rule_row.reason, format('Matched reward rule %s', rule_row.id)),
          tier_row.demotion_criteria <> '{}'::jsonb
        );
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.evaluate_admin_rules_for_all()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  agent_row record;
begin
  for agent_row in select id from public.users_profile where account_status = 'active' loop
    perform public.evaluate_admin_rules_for_agent(agent_row.id);
  end loop;
end;
$$;

create or replace function public.evaluate_gift_rules_for_agent(p_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  gift_row record;
  rule_row record;
  agent_tier_id uuid;
  matches boolean;
  rule_count integer := 0;
  rule_reasons jsonb;
  gift_conflicts jsonb;
  existing_status text;
  expiry timestamptz;
begin
  if p_agent_id is null then return; end if;
  select ut.tier_id into agent_tier_id from public.user_tiers ut where ut.user_id = p_agent_id limit 1;

  for gift_row in
    select * from public.gifts
    where approval_status in ('not_required', 'approved')
      and public.growth_is_live(lifecycle_state, start_at, end_at, is_active)
  loop
    if gift_row.audience_id is not null
       and not public.growth_audience_matches_agent(gift_row.audience_id, p_agent_id) then
      update public.gift_eligibilities set status = 'blocked', reason = 'Audience does not match', reasons = jsonb_build_array('audience'), updated_at = now(), evaluated_at = now()
      where gift_id = gift_row.id and agent_id = p_agent_id and status <> 'claimed';
      continue;
    end if;
    if gift_row.tier_ids is not null and cardinality(gift_row.tier_ids) > 0
       and (agent_tier_id is null or not (agent_tier_id = any(gift_row.tier_ids))) then
      update public.gift_eligibilities set status = 'blocked', reason = 'Tier does not match', reasons = jsonb_build_array('tier'), updated_at = now(), evaluated_at = now()
      where gift_id = gift_row.id and agent_id = p_agent_id and status <> 'claimed';
      continue;
    end if;

    matches := false;
    rule_reasons := '[]'::jsonb;
    rule_count := 0;
    for rule_row in
      select * from public.gift_rules
      where gift_id = gift_row.id
        and is_active
        and approval_status in ('not_required', 'approved')
        and public.growth_is_live(lifecycle_state, start_at, end_at, true)
    loop
      if rule_row.audience_id is not null
         and not public.growth_audience_matches_agent(rule_row.audience_id, p_agent_id) then
        continue;
      end if;
      rule_count := rule_count + 1;
      if public.reward_agent_matches_rule(
        p_agent_id, rule_row.metric, rule_row.time_window, rule_row.operator,
        rule_row.value_single, rule_row.value_min, rule_row.value_max,
        coalesce(rule_row.filters, '{}'::jsonb)
      ) then
        matches := true;
        rule_reasons := rule_reasons || jsonb_build_array(coalesce(rule_row.reason, format('Matched rule %s', rule_row.id)));
      end if;
    end loop;

    if not matches or rule_count = 0 then
      select status into existing_status from public.gift_eligibilities where gift_id = gift_row.id and agent_id = p_agent_id;
      if existing_status = 'claimed' then
        continue;
      end if;
      delete from public.gift_eligibilities where gift_id = gift_row.id and agent_id = p_agent_id;
      continue;
    end if;

    gift_conflicts := public.growth_conflicts_for_agent('gift', gift_row.id, p_agent_id);
    expiry := case
      when gift_row.end_at is not null then gift_row.end_at
      when gift_row.claim_window_days is not null then now() + make_interval(days => gift_row.claim_window_days)
      else null
    end;
    if jsonb_array_length(gift_conflicts) > 0 then
      insert into public.gift_eligibilities(
        gift_id, agent_id, status, eligible_at, updated_at, evaluated_at,
        expires_at, reason, reasons, conflicts, source, rule_version
      ) values (
        gift_row.id, p_agent_id, 'blocked', now(), now(), now(), expiry,
        'Matches a rule but has conflicts', rule_reasons, gift_conflicts, 'evaluation',
        (select max(version) from public.gift_rules where gift_id = gift_row.id)
      ) on conflict (gift_id, agent_id) do update set
        status = case when public.gift_eligibilities.status = 'claimed' then public.gift_eligibilities.status else 'blocked' end,
        updated_at = now(), evaluated_at = now(), expires_at = excluded.expires_at,
        reason = excluded.reason, reasons = excluded.reasons, conflicts = excluded.conflicts,
        rule_version = excluded.rule_version;
    else
      insert into public.gift_eligibilities(
        gift_id, agent_id, status, eligible_at, updated_at, evaluated_at,
        expires_at, reason, reasons, conflicts, source, rule_version
      ) values (
        gift_row.id, p_agent_id, 'eligible', now(), now(), now(), expiry,
        'Matches a Growth rule', rule_reasons, '[]'::jsonb, 'evaluation',
        (select max(version) from public.gift_rules where gift_id = gift_row.id)
      ) on conflict (gift_id, agent_id) do update set
        status = case when public.gift_eligibilities.status = 'claimed' then public.gift_eligibilities.status else 'eligible' end,
        updated_at = now(), evaluated_at = now(), expires_at = excluded.expires_at,
        reason = excluded.reason, reasons = excluded.reasons, conflicts = excluded.conflicts,
        rule_version = excluded.rule_version;
    end if;
  end loop;
end;
$$;

create or replace function public.evaluate_gift_rules_for_all()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  agent_row record;
begin
  for agent_row in select id from public.users_profile where account_status = 'active' loop
    perform public.evaluate_gift_rules_for_agent(agent_row.id);
  end loop;
end;
$$;

create or replace function public.run_growth_evaluation(
  p_scope text default 'all',
  p_dry_run boolean default true,
  p_requested_by_admin uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  run_id uuid;
  v_candidate_count integer := 0;
  v_eligible_count integer := 0;
  v_conflict_count integer := 0;
  v_applied_count integer := 0;
  audience_row record;
  preview jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if p_scope not in ('all', 'gifts', 'rewards', 'audiences') then
    raise exception 'Invalid Growth evaluation scope';
  end if;
  if p_requested_by_admin is not null and not exists (
    select 1 from public.admins where id = p_requested_by_admin and is_active
  ) then
    raise exception 'Active admin required';
  end if;

  insert into public.growth_evaluation_runs(
    scope, status, dry_run, requested_by_admin, started_at, metadata
  ) values (
    p_scope, 'running', coalesce(p_dry_run, true), p_requested_by_admin, now(),
    jsonb_build_object('source', 'admin_or_scheduler')
  ) returning id into run_id;

  select count(*)::integer into v_candidate_count
  from public.users_profile where account_status = 'active';

  -- Every run records audience decisions, including dry runs.  The result
  -- sample is capped by preview_growth_rule to keep a run bounded.
  if p_scope in ('all', 'audiences') then
    for audience_row in
      select id from public.growth_audiences
      where public.growth_is_live(lifecycle_state, start_at, end_at, true)
      order by id
    loop
      preview := public.preview_growth_audience(audience_row.id, null, 100);
      v_eligible_count := v_eligible_count + coalesce((preview->>'eligible_count')::integer, 0);
      v_conflict_count := v_conflict_count + coalesce((preview->>'conflict_count')::integer, 0);
    end loop;
  end if;

  if not coalesce(p_dry_run, true) then
    if p_scope in ('all', 'gifts') then
      perform public.evaluate_gift_rules_for_all();
    end if;
    if p_scope in ('all', 'rewards') then
      perform public.evaluate_admin_rules_for_all();
    end if;
    v_applied_count := case when p_scope in ('all', 'gifts', 'rewards') then v_candidate_count else 0 end;
  end if;

  update public.growth_evaluation_runs
  set status = 'succeeded', completed_at = now(), candidate_count = v_candidate_count,
      eligible_count = v_eligible_count, conflict_count = v_conflict_count,
      applied_count = v_applied_count,
      metadata = jsonb_build_object(
        'source', 'admin_or_scheduler',
        'dry_run', coalesce(p_dry_run, true),
        'audiences_evaluated', (select count(*) from public.growth_audiences where public.growth_is_live(lifecycle_state, start_at, end_at, true))
      )
  where id = run_id;

  return jsonb_build_object(
    'run_id', run_id,
    'scope', p_scope,
    'dry_run', coalesce(p_dry_run, true),
    'status', 'succeeded',
    'candidate_count', v_candidate_count,
    'eligible_count', v_eligible_count,
    'conflict_count', v_conflict_count,
    'applied_count', v_applied_count
  );
exception when others then
  if run_id is not null then
    update public.growth_evaluation_runs
    set status = 'failed', completed_at = now(), error_message = sqlerrm
    where id = run_id;
  end if;
  raise;
end;
$$;

create or replace function public.evaluate_growth_due()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  return public.run_growth_evaluation('all', false, null);
end;
$$;

create or replace function public.create_gift_claim(p_gift_id uuid, p_agent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  gift_row public.gifts%rowtype;
  eligibility_row public.gift_eligibilities%rowtype;
  claim_id uuid;
  active_claims integer := 0;
  total_claims integer := 0;
  caller_id uuid := auth.uid();
  service_call boolean := coalesce(auth.role(), '') = 'service_role'
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  claim_status text := 'pending';
  due_at timestamptz;
begin
  if caller_id is null and not service_call then raise exception 'Authentication required'; end if;
  if not service_call and p_agent_id <> caller_id then raise exception 'Cannot claim a gift for another agent'; end if;
  if p_gift_id is null or p_agent_id is null then raise exception 'Gift and agent are required'; end if;

  select * into gift_row from public.gifts where id = p_gift_id for update;
  if not found or gift_row.approval_status not in ('not_required', 'approved')
     or not public.growth_is_live(gift_row.lifecycle_state, gift_row.start_at, gift_row.end_at, gift_row.is_active) then
    raise exception 'Gift not found or inactive';
  end if;
  if gift_row.audience_id is not null and not public.growth_audience_matches_agent(gift_row.audience_id, p_agent_id) then
    raise exception 'Gift is not available to this agent';
  end if;
  if gift_row.max_total_claims is not null then
    select count(*) into total_claims from public.gift_claims where gift_id = p_gift_id and status <> 'cancelled';
    if total_claims >= gift_row.max_total_claims then raise exception 'Gift inventory exhausted'; end if;
  end if;
  if gift_row.max_concurrent_claims is not null then
    select count(*) into active_claims
    from public.gift_claims
    where agent_id = p_agent_id and status in ('pending', 'approved');
    if active_claims >= gift_row.max_concurrent_claims then raise exception 'Claim limit reached'; end if;
  end if;
  select * into eligibility_row
  from public.gift_eligibilities
  where gift_id = p_gift_id and agent_id = p_agent_id
  for update;
  if not found or eligibility_row.status <> 'eligible' then raise exception 'Gift not eligible'; end if;
  if eligibility_row.expires_at is not null and eligibility_row.expires_at <= now() then
    update public.gift_eligibilities set status = 'expired', updated_at = now() where id = eligibility_row.id;
    raise exception 'Gift eligibility expired';
  end if;
  if exists (
    select 1 from public.gift_claims
    where gift_id = p_gift_id and agent_id = p_agent_id
      and status in ('pending', 'approved', 'fulfilled')
  ) then
    raise exception 'Gift already claimed';
  end if;
  if not gift_row.requires_approval then claim_status := 'approved'; end if;
  due_at := case when gift_row.fulfillment_sla_hours is not null
    then now() + make_interval(hours => gift_row.fulfillment_sla_hours) else null end;

  insert into public.gift_claims(
    gift_id, agent_id, status, claimed_at, updated_at,
    fulfillment_sla_hours, fulfillment_due_at, approved_at
  ) values (
    p_gift_id, p_agent_id, claim_status, now(), now(),
    gift_row.fulfillment_sla_hours, due_at,
    case when claim_status = 'approved' then now() else null end
  ) returning id into claim_id;

  update public.gift_eligibilities
  set status = 'claimed', updated_at = now()
  where id = eligibility_row.id;
  return claim_id;
end;
$$;

create or replace function public.update_gift_claim_fulfillment(
  p_claim_id uuid,
  p_status text,
  p_admin_id uuid,
  p_notes text default null,
  p_fulfillment_owner_id uuid default null,
  p_fulfillment_due_at timestamptz default null,
  p_fulfillment_reference text default null,
  p_fulfillment_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  claim_row public.gift_claims%rowtype;
  existing_owner uuid;
  note_value text := nullif(btrim(p_notes), '');
  reference_value text := nullif(btrim(p_fulfillment_reference), '');
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if p_status not in ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled') then
    raise exception 'Invalid claim status';
  end if;
  if not exists (select 1 from public.admins where id = p_admin_id and is_active) then
    raise exception 'Active admin required';
  end if;
  if p_fulfillment_owner_id is not null
     and not exists (select 1 from public.admins where id = p_fulfillment_owner_id and is_active) then
    raise exception 'Fulfillment owner must be an active admin';
  end if;

  select * into claim_row from public.gift_claims where id = p_claim_id for update;
  if not found then raise exception 'Gift claim not found'; end if;
  if claim_row.status in ('fulfilled', 'rejected', 'cancelled') and claim_row.status <> p_status then
    raise exception 'Claim is already resolved';
  end if;
  if claim_row.status = 'pending' and p_status not in ('pending', 'approved', 'rejected', 'cancelled') then
    raise exception 'Invalid pending claim transition';
  end if;
  if claim_row.status = 'approved' and p_status not in ('approved', 'fulfilled', 'cancelled') then
    raise exception 'Invalid approved claim transition';
  end if;
  if p_status = 'fulfilled' and claim_row.status not in ('approved', 'fulfilled') then
    raise exception 'Only approved claims can be fulfilled';
  end if;

  existing_owner := coalesce(p_fulfillment_owner_id, claim_row.fulfillment_owner_id);
  update public.gift_claims
  set status = p_status,
      notes = coalesce(note_value, notes),
      updated_at = now(),
      updated_by_admin = p_admin_id,
      version = version + 1,
      fulfillment_owner_id = existing_owner,
      fulfillment_sla_hours = coalesce(fulfillment_sla_hours, (select fulfillment_sla_hours from public.gifts where id = gift_id)),
      fulfillment_due_at = coalesce(p_fulfillment_due_at, fulfillment_due_at),
      fulfillment_started_at = case when p_status = 'approved' then coalesce(fulfillment_started_at, now()) else fulfillment_started_at end,
      fulfillment_notes = coalesce(note_value, fulfillment_notes),
      fulfillment_reference = coalesce(reference_value, fulfillment_reference),
      fulfillment_metadata = case when jsonb_typeof(coalesce(p_fulfillment_metadata, '{}'::jsonb)) = 'object'
        then coalesce(p_fulfillment_metadata, '{}'::jsonb) else fulfillment_metadata end,
      approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
      approved_by = case when p_status = 'approved' then coalesce(approved_by, p_admin_id) else approved_by end,
      fulfilled_at = case when p_status = 'fulfilled' then coalesce(fulfilled_at, now()) else fulfilled_at end,
      rejected_at = case when p_status = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
      cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
      resolution_reason = case when p_status in ('fulfilled', 'rejected', 'cancelled') then coalesce(note_value, resolution_reason) else resolution_reason end
  where id = p_claim_id;

  if p_status in ('rejected', 'cancelled') then
    update public.gift_eligibilities
    set status = case when p_status = 'cancelled' then 'eligible' else 'blocked' end,
        updated_at = now()
    where gift_id = claim_row.gift_id and agent_id = claim_row.agent_id and status = 'claimed';
  end if;
  return (select to_jsonb(updated_claim) from public.gift_claims updated_claim where id = p_claim_id);
end;
$$;

create or replace function public.growth_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  before_data jsonb;
  after_data jsonb;
  entity_id_value uuid;
  version_value integer;
  actor_id uuid;
  actor_text text := nullif(current_setting('request.jwt.claim.sub', true), '');
  entity_type_value text;
begin
  if tg_op = 'DELETE' then
    before_data := to_jsonb(old);
    after_data := null;
    entity_id_value := old.id;
  else
    before_data := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    after_data := to_jsonb(new);
    entity_id_value := new.id;
  end if;
  begin
    actor_id := actor_text::uuid;
  exception when invalid_text_representation then
    actor_id := null;
  end;
  if actor_id is null then
    begin
      actor_id := coalesce(
        nullif(coalesce(after_data, before_data)->>'updated_by_admin', '')::uuid,
        nullif(coalesce(after_data, before_data)->>'updated_by', '')::uuid,
        nullif(coalesce(after_data, before_data)->>'created_by_admin', '')::uuid,
        nullif(coalesce(after_data, before_data)->>'created_by', '')::uuid
      );
    exception when invalid_text_representation then
      actor_id := null;
    end;
  end if;
  if actor_id is not null and not exists (select 1 from public.admins where id = actor_id) then
    actor_id := null;
  end if;
  entity_type_value := case tg_table_name
    when 'growth_audiences' then 'audience'
    when 'gifts' then 'gift'
    when 'gift_rules' then 'gift_rule'
    when 'admin_rules' then 'admin_rule'
    when 'tiers' then 'tier'
    when 'badges' then 'badge'
    when 'notification_campaigns' then 'notification_campaign'
    when 'dashboard_content' then 'dashboard_content'
    when 'gift_claims' then 'gift_claim'
    when 'user_tiers' then 'user_tier'
    when 'agent_badges' then 'agent_badge'
    else null
  end;
  if entity_type_value is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  begin
    version_value := nullif(coalesce(after_data, before_data)->>'version', '')::integer;
  exception when invalid_text_representation then
    version_value := null;
  end;
  insert into public.growth_audit_log(
    entity_type, entity_id, action, version, actor_admin_id, before_data, after_data, metadata
  ) values (
    entity_type_value,
    entity_id_value,
    lower(tg_op),
    version_value,
    actor_id,
    before_data,
    after_data,
    jsonb_build_object('table', tg_table_name, 'trigger', tg_name)
  );
  if tg_op <> 'DELETE' and tg_table_name in ('gifts', 'gift_rules', 'admin_rules', 'tiers', 'badges', 'notification_campaigns', 'dashboard_content') then
    insert into public.growth_resource_versions(
      entity_type, entity_id, version, snapshot, changed_by_admin, changed_by, change_type
    ) values (
      entity_type_value,
      entity_id_value,
      coalesce(version_value, 1),
      after_data,
      actor_id,
      actor_id,
      case when tg_op = 'INSERT' then 'create' else 'update' end
    ) on conflict (entity_type, entity_id, version) do nothing;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.growth_capture_audience_version()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor_id uuid;
  actor_text text := nullif(current_setting('request.jwt.claim.sub', true), '');
  change_kind text := case when tg_op = 'INSERT' then 'create' else 'update' end;
begin
  begin
    actor_id := actor_text::uuid;
  exception when invalid_text_representation then
    actor_id := null;
  end;
  if actor_id is null then
    begin
      actor_id := coalesce(
        nullif(to_jsonb(new)->>'updated_by', '')::uuid,
        nullif(to_jsonb(new)->>'updated_by_admin', '')::uuid,
        nullif(to_jsonb(new)->>'created_by', '')::uuid,
        nullif(to_jsonb(new)->>'created_by_admin', '')::uuid
      );
    exception when invalid_text_representation then
      actor_id := null;
    end;
  end if;
  if actor_id is not null and not exists (select 1 from public.admins where id = actor_id) then actor_id := null; end if;
  insert into public.growth_audience_versions(audience_id, version, snapshot, change_type, changed_by_admin, changed_by)
  values (new.id, new.version, to_jsonb(new), change_kind, actor_id, actor_id)
  on conflict (audience_id, version) do nothing;
  return new;
end;
$$;

create or replace function public.growth_bump_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.version <= old.version then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists growth_audiences_bump_version on public.growth_audiences;
create trigger growth_audiences_bump_version before update on public.growth_audiences
for each row execute function public.growth_bump_version();
drop trigger if exists growth_audiences_audit on public.growth_audiences;
create trigger growth_audiences_audit after insert or update or delete on public.growth_audiences
for each row execute function public.growth_audit_row_change();
drop trigger if exists growth_audiences_version_snapshot on public.growth_audiences;
create trigger growth_audiences_version_snapshot after insert or update on public.growth_audiences
for each row execute function public.growth_capture_audience_version();

drop trigger if exists gifts_growth_bump_version on public.gifts;
create trigger gifts_growth_bump_version before update on public.gifts
for each row execute function public.growth_bump_version();
drop trigger if exists gifts_growth_audit on public.gifts;
create trigger gifts_growth_audit after insert or update or delete on public.gifts
for each row execute function public.growth_audit_row_change();

drop trigger if exists gift_rules_growth_bump_version on public.gift_rules;
create trigger gift_rules_growth_bump_version before update on public.gift_rules
for each row execute function public.growth_bump_version();
drop trigger if exists gift_rules_growth_audit on public.gift_rules;
create trigger gift_rules_growth_audit after insert or update or delete on public.gift_rules
for each row execute function public.growth_audit_row_change();

drop trigger if exists admin_rules_growth_bump_version on public.admin_rules;
create trigger admin_rules_growth_bump_version before update on public.admin_rules
for each row execute function public.growth_bump_version();
drop trigger if exists admin_rules_growth_audit on public.admin_rules;
create trigger admin_rules_growth_audit after insert or update or delete on public.admin_rules
for each row execute function public.growth_audit_row_change();

drop trigger if exists tiers_growth_bump_version on public.tiers;
create trigger tiers_growth_bump_version before update on public.tiers
for each row execute function public.growth_bump_version();
drop trigger if exists tiers_growth_audit on public.tiers;
create trigger tiers_growth_audit after insert or update or delete on public.tiers
for each row execute function public.growth_audit_row_change();

drop trigger if exists badges_growth_bump_version on public.badges;
create trigger badges_growth_bump_version before update on public.badges
for each row execute function public.growth_bump_version();
drop trigger if exists badges_growth_audit on public.badges;
create trigger badges_growth_audit after insert or update or delete on public.badges
for each row execute function public.growth_audit_row_change();

drop trigger if exists notification_campaigns_growth_bump_version on public.notification_campaigns;
create trigger notification_campaigns_growth_bump_version before update on public.notification_campaigns
for each row execute function public.growth_bump_version();
drop trigger if exists notification_campaigns_growth_audit on public.notification_campaigns;
create trigger notification_campaigns_growth_audit after insert or update or delete on public.notification_campaigns
for each row execute function public.growth_audit_row_change();

drop trigger if exists dashboard_content_growth_bump_version on public.dashboard_content;
create trigger dashboard_content_growth_bump_version before update on public.dashboard_content
for each row execute function public.growth_bump_version();
drop trigger if exists dashboard_content_growth_audit on public.dashboard_content;
create trigger dashboard_content_growth_audit after insert or update or delete on public.dashboard_content
for each row execute function public.growth_audit_row_change();

drop trigger if exists gift_claims_growth_audit on public.gift_claims;
create trigger gift_claims_growth_audit after insert or update or delete on public.gift_claims
for each row execute function public.growth_audit_row_change();
drop trigger if exists user_tiers_growth_audit on public.user_tiers;
create trigger user_tiers_growth_audit after insert or update or delete on public.user_tiers
for each row execute function public.growth_audit_row_change();
drop trigger if exists agent_badges_growth_audit on public.agent_badges;
create trigger agent_badges_growth_audit after insert or update or delete on public.agent_badges
for each row execute function public.growth_audit_row_change();

create or replace function public.restore_growth_resource_version(
  p_entity_type text,
  p_entity_id uuid,
  p_version integer,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  snapshot jsonb;
  current_snapshot jsonb;
  current_version integer;
  current_status text;
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if p_entity_type not in ('gift', 'gift_rule', 'admin_rule', 'tier', 'badge', 'notification_campaign', 'dashboard_content') then
    raise exception 'Invalid Growth resource type';
  end if;
  if p_entity_id is null or p_version is null or p_version < 1 then raise exception 'Resource and version are required'; end if;
  if not exists (select 1 from public.admins where id = p_admin_id and is_active) then raise exception 'Active admin required'; end if;
  select versions.snapshot into snapshot
  from public.growth_resource_versions versions
  where versions.entity_type = p_entity_type and versions.entity_id = p_entity_id and versions.version = p_version;
  if snapshot is null then raise exception 'Growth resource version not found'; end if;

  -- Capture the state being replaced before applying the historical snapshot.
  -- The insert is idempotent because row versions are unique; creation/update
  -- triggers normally have already captured the same state.
  if p_entity_type = 'notification_campaign' then
    select to_jsonb(campaign_row), campaign_row.version, campaign_row.status
      into current_snapshot, current_version, current_status
    from public.notification_campaigns campaign_row
    where campaign_row.id = p_entity_id for update;
  elsif p_entity_type = 'dashboard_content' then
    select to_jsonb(content_row), content_row.version
      into current_snapshot, current_version
    from public.dashboard_content content_row
    where content_row.id = p_entity_id for update;
  elsif p_entity_type = 'gift' then
    select to_jsonb(gift_current), gift_current.version
      into current_snapshot, current_version
    from public.gifts gift_current
    where gift_current.id = p_entity_id for update;
  elsif p_entity_type = 'gift_rule' then
    select to_jsonb(gift_rule_current), gift_rule_current.version
      into current_snapshot, current_version
    from public.gift_rules gift_rule_current
    where gift_rule_current.id = p_entity_id for update;
  elsif p_entity_type = 'admin_rule' then
    select to_jsonb(admin_rule_current), admin_rule_current.version
      into current_snapshot, current_version
    from public.admin_rules admin_rule_current
    where admin_rule_current.id = p_entity_id for update;
  elsif p_entity_type = 'tier' then
    select to_jsonb(tier_current), tier_current.version
      into current_snapshot, current_version
    from public.tiers tier_current
    where tier_current.id = p_entity_id for update;
  elsif p_entity_type = 'badge' then
    select to_jsonb(badge_current), badge_current.version
      into current_snapshot, current_version
    from public.badges badge_current
    where badge_current.id = p_entity_id for update;
  end if;
  if current_snapshot is null then raise exception 'Growth resource not found'; end if;
  if current_status in ('sent', 'processing', 'fulfilled') then raise exception 'Sent or fulfilled Growth resources are immutable'; end if;
  insert into public.growth_resource_versions(entity_type, entity_id, version, snapshot, changed_by_admin, changed_by, change_type)
  values (p_entity_type, p_entity_id, greatest(coalesce(current_version, 1), 1), current_snapshot, p_admin_id, p_admin_id, 'update')
  on conflict (entity_type, entity_id, version) do nothing;

  if p_entity_type = 'notification_campaign' then
    select status into current_status from public.notification_campaigns where id = p_entity_id for update;
    if not found then raise exception 'Notification campaign not found'; end if;
    if current_status in ('sent', 'processing') then raise exception 'Sent notification campaigns are immutable'; end if;
    update public.notification_campaigns set
      audience = coalesce(snapshot->>'audience', audience),
      audience_id = nullif(snapshot->>'audience_id', '')::uuid,
      title = coalesce(snapshot->>'title', title),
      title_ar = snapshot->>'title_ar',
      message = coalesce(snapshot->>'message', message),
      message_ar = snapshot->>'message_ar', body_ar = snapshot->>'body_ar',
      action_url = snapshot->>'action_url',
      lifecycle_state = coalesce(snapshot->>'lifecycle_state', lifecycle_state),
      start_at = nullif(snapshot->>'start_at', '')::timestamptz,
      end_at = nullif(snapshot->>'end_at', '')::timestamptz,
      metadata = case when jsonb_typeof(snapshot->'metadata') = 'object' then snapshot->'metadata' else metadata end,
      approval_status = case when approval_status = 'not_required' then 'not_required' else 'pending' end,
      approved_by = null, approved_at = null, rejection_reason = null,
      updated_by = p_admin_id, updated_at = now()
    where id = p_entity_id
    returning to_jsonb(notification_campaigns) into result;
  elsif p_entity_type = 'dashboard_content' then
    if not exists (select 1 from public.dashboard_content where id = p_entity_id) then raise exception 'Content item not found'; end if;
    update public.dashboard_content set
      content_type = coalesce(snapshot->>'content_type', content_type),
      content_key = coalesce(snapshot->>'content_key', content_key),
      label = coalesce(snapshot->>'label', label), label_ar = snapshot->>'label_ar',
      body = snapshot->>'body', body_ar = snapshot->>'body_ar',
      sort_order = coalesce(nullif(snapshot->>'sort_order', '')::integer, sort_order),
      is_active = coalesce((snapshot->>'is_active')::boolean, is_active),
      audience_id = nullif(snapshot->>'audience_id', '')::uuid,
      lifecycle_state = coalesce(snapshot->>'lifecycle_state', lifecycle_state),
      start_at = nullif(snapshot->>'start_at', '')::timestamptz,
      end_at = nullif(snapshot->>'end_at', '')::timestamptz,
      metadata = case when jsonb_typeof(snapshot->'metadata') = 'object' then snapshot->'metadata' else metadata end,
      updated_by = p_admin_id, updated_at = now()
    where id = p_entity_id
    returning to_jsonb(dashboard_content) into result;
  elsif p_entity_type = 'gift' then
    if not exists (select 1 from public.gifts where id = p_entity_id) then raise exception 'Gift not found'; end if;
    update public.gifts set
      title = coalesce(snapshot->>'title', title), title_ar = snapshot->>'title_ar',
      description = snapshot->>'description', icon_url = snapshot->>'icon_url',
      is_active = coalesce((snapshot->>'is_active')::boolean, is_active),
      tier_ids = case when jsonb_typeof(snapshot->'tier_ids') = 'array' then array(select value::text::uuid from jsonb_array_elements_text(snapshot->'tier_ids')) else tier_ids end,
      audience_id = nullif(snapshot->>'audience_id', '')::uuid,
      lifecycle_state = coalesce(snapshot->>'lifecycle_state', lifecycle_state),
      start_at = nullif(snapshot->>'start_at', '')::timestamptz,
      end_at = nullif(snapshot->>'end_at', '')::timestamptz,
      gift_type = coalesce(snapshot->>'gift_type', gift_type), value_amount = nullif(snapshot->>'value_amount', '')::numeric,
      currency = coalesce(snapshot->>'currency', currency), quantity = nullif(snapshot->>'quantity', '')::integer,
      fulfillment_method = coalesce(snapshot->>'fulfillment_method', fulfillment_method),
      fulfillment_instructions = snapshot->>'fulfillment_instructions', fulfillment_instructions_ar = snapshot->>'fulfillment_instructions_ar',
      fulfillment_sla_hours = nullif(snapshot->>'fulfillment_sla_hours', '')::integer,
      requires_approval = coalesce((snapshot->>'requires_approval')::boolean, requires_approval),
      terms = snapshot->>'terms', terms_ar = snapshot->>'terms_ar',
      metadata = case when jsonb_typeof(snapshot->'metadata') = 'object' then snapshot->'metadata' else metadata end,
      max_total_claims = nullif(snapshot->>'max_total_claims', '')::integer,
      claim_window_days = nullif(snapshot->>'claim_window_days', '')::integer,
      approval_status = case when approval_status = 'not_required' then 'not_required' else 'pending' end,
      approved_by = null, approved_at = null, rejection_reason = null,
      updated_by_admin = p_admin_id, updated_at = now()
    where id = p_entity_id
    returning to_jsonb(gifts) into result;
  elsif p_entity_type = 'gift_rule' then
    if not exists (select 1 from public.gift_rules where id = p_entity_id) then raise exception 'Gift rule not found'; end if;
    update public.gift_rules set
      gift_id = nullif(snapshot->>'gift_id', '')::uuid, audience_id = nullif(snapshot->>'audience_id', '')::uuid,
      metric = coalesce(snapshot->>'metric', metric), time_window = coalesce(snapshot->>'time_window', time_window),
      operator = coalesce(snapshot->>'operator', operator), value_single = nullif(snapshot->>'value_single', '')::numeric,
      value_min = nullif(snapshot->>'value_min', '')::numeric, value_max = nullif(snapshot->>'value_max', '')::numeric,
      filters = case when jsonb_typeof(snapshot->'filters') = 'object' then snapshot->'filters' else filters end,
      is_active = coalesce((snapshot->>'is_active')::boolean, is_active), lifecycle_state = coalesce(snapshot->>'lifecycle_state', lifecycle_state),
      start_at = nullif(snapshot->>'start_at', '')::timestamptz, end_at = nullif(snapshot->>'end_at', '')::timestamptz,
      reason = snapshot->>'reason', metadata = case when jsonb_typeof(snapshot->'metadata') = 'object' then snapshot->'metadata' else metadata end,
      approval_status = case when approval_status = 'not_required' then 'not_required' else 'pending' end,
      approved_by = null, approved_at = null, rejection_reason = null,
      updated_at = now()
    where id = p_entity_id
    returning to_jsonb(gift_rules) into result;
  elsif p_entity_type = 'admin_rule' then
    if not exists (select 1 from public.admin_rules where id = p_entity_id) then raise exception 'Reward rule not found'; end if;
    update public.admin_rules set
      target_type = coalesce(snapshot->>'target_type', target_type), target_id = nullif(snapshot->>'target_id', '')::uuid,
      audience_id = nullif(snapshot->>'audience_id', '')::uuid, metric = coalesce(snapshot->>'metric', metric),
      time_window = coalesce(snapshot->>'time_window', time_window), operator = coalesce(snapshot->>'operator', operator),
      value_single = nullif(snapshot->>'value_single', '')::numeric, value_min = nullif(snapshot->>'value_min', '')::numeric,
      value_max = nullif(snapshot->>'value_max', '')::numeric,
      filters = case when jsonb_typeof(snapshot->'filters') = 'object' then snapshot->'filters' else filters end,
      is_active = coalesce((snapshot->>'is_active')::boolean, is_active), lifecycle_state = coalesce(snapshot->>'lifecycle_state', lifecycle_state),
      start_at = nullif(snapshot->>'start_at', '')::timestamptz, end_at = nullif(snapshot->>'end_at', '')::timestamptz,
      reason = snapshot->>'reason', metadata = case when jsonb_typeof(snapshot->'metadata') = 'object' then snapshot->'metadata' else metadata end,
      approval_status = case when approval_status = 'not_required' then 'not_required' else 'pending' end,
      approved_by = null, approved_at = null, rejection_reason = null,
      updated_at = now()
    where id = p_entity_id
    returning to_jsonb(admin_rules) into result;
  elsif p_entity_type = 'tier' then
    if not exists (select 1 from public.tiers where id = p_entity_id) then raise exception 'Tier not found'; end if;
    update public.tiers set
      name = coalesce(snapshot->>'name', name), name_ar = snapshot->>'name_ar', description = snapshot->>'description', icon_url = coalesce(snapshot->>'icon_url', icon_url),
      level = coalesce(nullif(snapshot->>'level', '')::integer, level), benefit_type = coalesce(snapshot->>'benefit_type', benefit_type),
      benefit_value = nullif(snapshot->>'benefit_value', '')::numeric, benefit_description = snapshot->>'benefit_description',
      audience_id = nullif(snapshot->>'audience_id', '')::uuid, lifecycle_state = coalesce(snapshot->>'lifecycle_state', lifecycle_state),
      start_at = nullif(snapshot->>'start_at', '')::timestamptz, end_at = nullif(snapshot->>'end_at', '')::timestamptz,
      promotion_criteria = case when jsonb_typeof(snapshot->'promotion_criteria') = 'object' then snapshot->'promotion_criteria' else promotion_criteria end,
      demotion_criteria = case when jsonb_typeof(snapshot->'demotion_criteria') = 'object' then snapshot->'demotion_criteria' else demotion_criteria end,
      stacking_mode = coalesce(snapshot->>'stacking_mode', stacking_mode), stacking_priority = coalesce(nullif(snapshot->>'stacking_priority', '')::integer, stacking_priority),
      reset_period = coalesce(snapshot->>'reset_period', reset_period),
      reset_at = nullif(snapshot->>'reset_at', '')::timestamptz,
      max_stack_count = nullif(snapshot->>'max_stack_count', '')::integer,
      carry_over = coalesce((snapshot->>'carry_over')::boolean, carry_over),
      metadata = case when jsonb_typeof(snapshot->'metadata') = 'object' then snapshot->'metadata' else metadata end,
      approval_status = case when approval_status = 'not_required' then 'not_required' else 'pending' end,
      approved_by = null, approved_at = null, rejection_reason = null,
      updated_by_admin = p_admin_id, updated_at = now()
    where id = p_entity_id
    returning to_jsonb(tiers) into result;
  elsif p_entity_type = 'badge' then
    if not exists (select 1 from public.badges where id = p_entity_id) then raise exception 'Badge not found'; end if;
    update public.badges set
      name = coalesce(snapshot->>'name', name), name_ar = snapshot->>'name_ar', description = snapshot->>'description', icon_url = coalesce(snapshot->>'icon_url', icon_url),
      unlock_criteria = case when jsonb_typeof(snapshot->'unlock_criteria') = 'object' then snapshot->'unlock_criteria' else unlock_criteria end,
      audience_id = nullif(snapshot->>'audience_id', '')::uuid, lifecycle_state = coalesce(snapshot->>'lifecycle_state', lifecycle_state),
      start_at = nullif(snapshot->>'start_at', '')::timestamptz, end_at = nullif(snapshot->>'end_at', '')::timestamptz,
      is_repeatable = coalesce((snapshot->>'is_repeatable')::boolean, is_repeatable), visibility = coalesce(snapshot->>'visibility', visibility),
      priority = coalesce(nullif(snapshot->>'priority', '')::integer, priority), is_revocable = coalesce((snapshot->>'is_revocable')::boolean, is_revocable),
      benefit_code = snapshot->>'benefit_code', benefit_metadata = case when jsonb_typeof(snapshot->'benefit_metadata') = 'object' then snapshot->'benefit_metadata' else benefit_metadata end,
      benefit_expires_in_days = nullif(snapshot->>'benefit_expires_in_days', '')::integer,
      approval_status = case when approval_status = 'not_required' then 'not_required' else 'pending' end,
      approved_by = null, approved_at = null, rejection_reason = null,
      updated_by_admin = p_admin_id, updated_at = now()
    where id = p_entity_id
    returning to_jsonb(badges) into result;
  end if;
  return result;
end;
$$;

-- Existing notification dispatch is retained, but drafts, paused campaigns,
-- archived campaigns, and out-of-window campaigns are never dispatched.
create or replace function public.dispatch_notification_campaign(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  campaign public.notification_campaigns%rowtype;
  inserted_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  select * into campaign from public.notification_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if campaign.lifecycle_state in ('draft', 'paused', 'archived') then return 0; end if;
  if campaign.approval_status not in ('not_required', 'approved') then return 0; end if;
  if campaign.start_at is not null and campaign.start_at > now() then return 0; end if;
  if campaign.end_at is not null and campaign.end_at <= now() then
    update public.notification_campaigns set status = 'cancelled', updated_at = now() where id = campaign.id;
    return 0;
  end if;
  if campaign.status not in ('scheduled', 'failed') then return campaign.recipient_count; end if;
  if campaign.scheduled_for > now() then return 0; end if;

  update public.notification_campaigns set status = 'processing', updated_at = now(), error_message = null where id = campaign.id;
  insert into public.notifications (
    agent_id, type, title, message, action_url, push_sent, is_demo, demo_batch,
    related_entity_type, related_entity_id
  )
  select
    agent.id,
    'admin_message'::public.notification_type,
    case when agent.language_preference = 'ar'
              and nullif(btrim(campaign.title_ar), '') is not null
              and nullif(btrim(campaign.message_ar), '') is not null
         then campaign.title_ar else campaign.title end,
    case when agent.language_preference = 'ar'
              and nullif(btrim(campaign.title_ar), '') is not null
              and nullif(btrim(campaign.message_ar), '') is not null
         then campaign.message_ar else campaign.message end,
    campaign.action_url,
    false,
    campaign.is_demo,
    campaign.demo_batch,
    'notification_campaign',
    campaign.id
  from public.users_profile agent
  where agent.account_status = 'active'
    and (
      case when campaign.audience_id is not null then public.growth_audience_matches_agent(campaign.audience_id, agent.id) else false end
      or case when campaign.audience_id is null then
        campaign.audience = 'all'
        or (campaign.audience = 'verified' and agent.verification_status = 'verified')
        or (campaign.audience = 'no_deals' and coalesce(agent.total_deals, 0) = 0)
        or (
          campaign.audience = 'waiting_payment'
          and exists (select 1 from public.deals deal where deal.agent_id = agent.id and deal.status in ('approved', 'confirmed', 'awaiting_payment'))
        )
      else false end
    );
  get diagnostics inserted_count = row_count;
  update public.notification_campaigns
  set status = 'sent', recipient_count = inserted_count, sent_at = now(), updated_at = now()
  where id = campaign.id;
  if campaign.channel = 'in_app_push' then perform public.enqueue_campaign_pushes(campaign.id); end if;
  return inserted_count;
exception when others then
  update public.notification_campaigns set status = 'failed', error_message = sqlerrm, updated_at = now() where id = p_campaign_id;
  raise;
end;
$$;

create or replace function public.process_due_notification_campaigns()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item record;
  processed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  for item in
    select id from public.notification_campaigns
    where status = 'scheduled'
      and scheduled_for <= now()
      and lifecycle_state not in ('draft', 'paused', 'archived')
      and (start_at is null or start_at <= now())
      and (end_at is null or end_at > now())
    order by scheduled_for
    limit 25
  loop
    perform public.dispatch_notification_campaign(item.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

create or replace function public.enqueue_campaign_pushes(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  campaign public.notification_campaigns%rowtype;
  batch record;
  queued integer := 0;
  batch_count integer := 0;
  net_request_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  select * into campaign from public.notification_campaigns where id = p_campaign_id;
  if not found then raise exception 'Campaign not found'; end if;
  if campaign.lifecycle_state in ('draft', 'paused', 'archived') then return 0; end if;
  if campaign.approval_status not in ('not_required', 'approved') then return 0; end if;
  if campaign.start_at is not null and campaign.start_at > now() then return 0; end if;
  if campaign.end_at is not null and campaign.end_at <= now() then return 0; end if;
  if campaign.channel <> 'in_app_push' then return 0; end if;

  for batch in
    with eligible as (
      select token.id, token.expo_push_token, agent.language_preference,
             row_number() over (order by token.id) - 1 as position
      from public.device_push_tokens token
      join public.users_profile agent on agent.id = token.agent_id
      where token.enabled and agent.account_status = 'active'
        and (
          case when campaign.audience_id is not null then public.growth_audience_matches_agent(campaign.audience_id, agent.id) else false end
          or case when campaign.audience_id is null then
            campaign.audience = 'all'
            or (campaign.audience = 'verified' and agent.verification_status = 'verified')
            or (campaign.audience = 'no_deals' and coalesce(agent.total_deals, 0) = 0)
            or (
              campaign.audience = 'waiting_payment'
              and exists (select 1 from public.deals deal where deal.agent_id = agent.id and deal.status in ('approved', 'confirmed', 'awaiting_payment'))
            )
          else false end
        )
    )
    select
      array_agg(id order by position) as token_ids,
      jsonb_agg(jsonb_build_object(
        'to', expo_push_token,
        'title', case when language_preference = 'ar'
                           and nullif(btrim(campaign.title_ar), '') is not null
                           and nullif(btrim(campaign.message_ar), '') is not null
                      then campaign.title_ar else campaign.title end,
        'body', case when language_preference = 'ar'
                          and nullif(btrim(campaign.title_ar), '') is not null
                          and nullif(btrim(campaign.message_ar), '') is not null
                     then campaign.message_ar else campaign.message end,
        'sound', 'default',
        'priority', 'high',
        'channelId', 'brixeler-default',
        'data', jsonb_build_object('actionUrl', coalesce(campaign.action_url, '/'), 'campaignId', campaign.id::text)
      ) order by position) as payload
    from eligible
    group by floor(position / 100)
    order by floor(position / 100)
  loop
    net_request_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := batch.payload,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
    insert into public.push_delivery_batches(campaign_id, request_id, token_ids, request_payload, token_count)
    values (campaign.id, net_request_id, batch.token_ids, batch.payload, cardinality(batch.token_ids));
    queued := queued + cardinality(batch.token_ids);
    batch_count := batch_count + 1;
  end loop;
  update public.notification_campaigns
  set push_recipient_count = queued, push_batch_count = batch_count, updated_at = now()
  where id = campaign.id;
  update public.notifications notification
  set push_sent = true
  where notification.related_entity_type = 'notification_campaign'
    and notification.related_entity_id = campaign.id
    and exists (
      select 1 from public.device_push_tokens token
      where token.agent_id = notification.agent_id and token.enabled
    );
  return queued;
end;
$$;

-- Fail closed for all Growth state and history tables. Dashboard routes use
-- the service-role client; mobile receives only the existing own/read paths.
alter table public.growth_audiences enable row level security;
alter table public.growth_audiences force row level security;
alter table public.growth_audience_versions enable row level security;
alter table public.growth_audience_versions force row level security;
alter table public.growth_audit_log enable row level security;
alter table public.growth_audit_log force row level security;
alter table public.growth_resource_versions enable row level security;
alter table public.growth_resource_versions force row level security;
alter table public.growth_evaluation_runs enable row level security;
alter table public.growth_evaluation_runs force row level security;
alter table public.growth_evaluation_results enable row level security;
alter table public.growth_evaluation_results force row level security;
alter table public.agent_badge_awards enable row level security;
alter table public.agent_badge_awards force row level security;

revoke all on public.growth_audiences, public.growth_audience_versions,
  public.growth_audit_log, public.growth_resource_versions,
  public.growth_evaluation_runs, public.growth_evaluation_results,
  public.agent_badge_awards from public, anon, authenticated;
grant all on public.growth_audiences, public.growth_audience_versions,
  public.growth_audit_log, public.growth_resource_versions,
  public.growth_evaluation_runs, public.growth_evaluation_results,
  public.agent_badge_awards to service_role;

create policy growth_audiences_service_role on public.growth_audiences
for all to service_role using (true) with check (true);
create policy growth_audience_versions_service_role on public.growth_audience_versions
for all to service_role using (true) with check (true);
create policy growth_audit_log_service_role on public.growth_audit_log
for all to service_role using (true) with check (true);
create policy growth_resource_versions_service_role on public.growth_resource_versions
for all to service_role using (true) with check (true);
create policy growth_evaluation_runs_service_role on public.growth_evaluation_runs
for all to service_role using (true) with check (true);
create policy growth_evaluation_results_service_role on public.growth_evaluation_results
for all to service_role using (true) with check (true);
create policy agent_badge_awards_service_role on public.agent_badge_awards
for all to service_role using (true) with check (true);

alter table public.gifts enable row level security;
alter table public.gifts force row level security;
alter table public.gift_rules enable row level security;
alter table public.gift_rules force row level security;
alter table public.gift_eligibilities enable row level security;
alter table public.gift_eligibilities force row level security;
alter table public.gift_claims enable row level security;
alter table public.gift_claims force row level security;
alter table public.admin_rules enable row level security;
alter table public.admin_rules force row level security;
alter table public.tiers enable row level security;
alter table public.tiers force row level security;
alter table public.user_tiers enable row level security;
alter table public.user_tiers force row level security;
alter table public.badges enable row level security;
alter table public.badges force row level security;
alter table public.agent_badges enable row level security;
alter table public.agent_badges force row level security;
alter table public.notification_campaigns enable row level security;
alter table public.notification_campaigns force row level security;
alter table public.dashboard_content enable row level security;
alter table public.dashboard_content force row level security;

revoke all on public.gifts, public.gift_rules, public.gift_eligibilities, public.gift_claims,
  public.admin_rules, public.tiers, public.user_tiers, public.badges, public.agent_badges,
  public.notification_campaigns, public.dashboard_content from public, anon, authenticated;
grant select on public.gifts, public.gift_eligibilities, public.gift_claims,
  public.tiers, public.user_tiers, public.badges, public.agent_badges,
  public.dashboard_content to authenticated;
grant all on public.gifts, public.gift_rules, public.gift_eligibilities, public.gift_claims,
  public.admin_rules, public.tiers, public.user_tiers, public.badges, public.agent_badges,
  public.notification_campaigns, public.dashboard_content to service_role;

create policy gifts_growth_mobile_read on public.gifts
for select to authenticated
using (
  approval_status in ('not_required', 'approved')
  and
  public.growth_is_live(lifecycle_state, start_at, end_at, is_active)
  and (audience_id is null or public.growth_audience_matches_agent(audience_id, (select auth.uid())))
);
create policy gifts_growth_approval_boundary on public.gifts
as restrictive for select to authenticated
using (
  approval_status in ('not_required', 'approved')
  and public.growth_is_live(lifecycle_state, start_at, end_at, is_active)
  and (audience_id is null or public.growth_audience_matches_agent(audience_id, (select auth.uid())))
);
create policy gift_eligibilities_growth_agent_read on public.gift_eligibilities
for select to authenticated
using (agent_id = (select auth.uid()));
create policy gift_eligibilities_growth_boundary on public.gift_eligibilities
as restrictive for select to authenticated
using (
  agent_id = (select auth.uid())
  and exists (
    select 1 from public.gifts gift
    where gift.id = gift_id
      and gift.approval_status in ('not_required', 'approved')
      and public.growth_is_live(gift.lifecycle_state, gift.start_at, gift.end_at, gift.is_active)
      and (gift.audience_id is null or public.growth_audience_matches_agent(gift.audience_id, (select auth.uid())))
  )
);
create policy gift_claims_growth_agent_read on public.gift_claims
for select to authenticated
using (agent_id = (select auth.uid()));
create policy tiers_growth_mobile_read on public.tiers
for select to authenticated
using (
  approval_status in ('not_required', 'approved')
  and
  public.growth_is_live(lifecycle_state, start_at, end_at, is_active)
  and (audience_id is null or public.growth_audience_matches_agent(audience_id, (select auth.uid())))
);
create policy tiers_growth_approval_boundary on public.tiers
as restrictive for select to authenticated
using (
  approval_status in ('not_required', 'approved')
  and public.growth_is_live(lifecycle_state, start_at, end_at, is_active)
  and (audience_id is null or public.growth_audience_matches_agent(audience_id, (select auth.uid())))
);
create policy user_tiers_growth_agent_read on public.user_tiers
for select to authenticated
using (user_id = (select auth.uid()));
create policy user_tiers_growth_boundary on public.user_tiers
as restrictive for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.tiers tier
    where tier.id = tier_id
      and tier.approval_status in ('not_required', 'approved')
      and public.growth_is_live(tier.lifecycle_state, tier.start_at, tier.end_at, tier.is_active)
      and (tier.audience_id is null or public.growth_audience_matches_agent(tier.audience_id, (select auth.uid())))
  )
);
create policy badges_growth_mobile_read on public.badges
for select to authenticated
using (
  approval_status in ('not_required', 'approved')
  and
  public.growth_is_live(lifecycle_state, start_at, end_at, is_active)
  and revoked_at is null
  and (audience_id is null or public.growth_audience_matches_agent(audience_id, (select auth.uid())))
);
create policy badges_growth_approval_boundary on public.badges
as restrictive for select to authenticated
using (
  approval_status in ('not_required', 'approved')
  and public.growth_is_live(lifecycle_state, start_at, end_at, is_active)
  and revoked_at is null
  and (audience_id is null or public.growth_audience_matches_agent(audience_id, (select auth.uid())))
);
create policy agent_badges_growth_agent_read on public.agent_badges
for select to authenticated
using (
  agent_id = (select auth.uid())
  and revoked_at is null
  and (expires_at is null or expires_at > now())
);
create policy agent_badges_growth_boundary on public.agent_badges
as restrictive for select to authenticated
using (
  agent_id = (select auth.uid())
  and revoked_at is null
  and (expires_at is null or expires_at > now())
  and exists (
    select 1 from public.badges badge
    where badge.id = badge_id
      and badge.approval_status in ('not_required', 'approved')
      and public.growth_is_live(badge.lifecycle_state, badge.start_at, badge.end_at, badge.is_active)
      and (badge.audience_id is null or public.growth_audience_matches_agent(badge.audience_id, (select auth.uid())))
  )
);
create policy dashboard_content_growth_mobile_read on public.dashboard_content
for select to authenticated
using (
  is_active
  and public.growth_is_live(lifecycle_state, start_at, end_at, true)
  and (audience_id is null or public.growth_audience_matches_agent(audience_id, (select auth.uid())))
);
create policy dashboard_content_growth_boundary on public.dashboard_content
as restrictive for select to authenticated
using (
  is_active
  and public.growth_is_live(lifecycle_state, start_at, end_at, true)
  and (audience_id is null or public.growth_audience_matches_agent(audience_id, (select auth.uid())))
);
create policy gifts_growth_service_role on public.gifts for all to service_role using (true) with check (true);
create policy gift_rules_growth_service_role on public.gift_rules for all to service_role using (true) with check (true);
create policy gift_eligibilities_growth_service_role on public.gift_eligibilities for all to service_role using (true) with check (true);
create policy gift_claims_growth_service_role on public.gift_claims for all to service_role using (true) with check (true);
create policy admin_rules_growth_service_role on public.admin_rules for all to service_role using (true) with check (true);
create policy tiers_growth_service_role on public.tiers for all to service_role using (true) with check (true);
create policy user_tiers_growth_service_role on public.user_tiers for all to service_role using (true) with check (true);
create policy badges_growth_service_role on public.badges for all to service_role using (true) with check (true);
create policy agent_badges_growth_service_role on public.agent_badges for all to service_role using (true) with check (true);
create policy notification_campaigns_growth_service_role on public.notification_campaigns for all to service_role using (true) with check (true);
create policy dashboard_content_growth_service_role on public.dashboard_content for all to service_role using (true) with check (true);

-- SECURITY DEFINER functions are deny-by-default.  Only the two boolean
-- helpers needed while evaluating authenticated read policies and the
-- agent-bound claim RPC are callable by authenticated clients; previews,
-- evaluators, fulfillment, dispatch, and restore stay service-only.
revoke all on function public.growth_is_live(text, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.growth_is_live(text, timestamptz, timestamptz, boolean) to authenticated, service_role;
revoke all on function public.growth_audience_matches_agent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.growth_audience_matches_agent(uuid, uuid) to authenticated, service_role;
revoke all on function public.growth_definition_matches_agent(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.growth_conflicts_for_agent(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.preview_growth_rule(text, uuid, uuid, jsonb, text, text, text, numeric, numeric, numeric, jsonb, integer) from public, anon, authenticated;
revoke all on function public.preview_growth_audience(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.growth_award_badge(uuid, uuid) from public, anon, authenticated;
revoke all on function public.growth_apply_tier(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.evaluate_admin_rules_for_agent(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_admin_rules_for_all() from public, anon, authenticated;
revoke all on function public.evaluate_gift_rules_for_agent(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_gift_rules_for_all() from public, anon, authenticated;
revoke all on function public.run_growth_evaluation(text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.evaluate_growth_due() from public, anon, authenticated;
revoke all on function public.create_gift_claim(uuid, uuid) from public, anon;
grant execute on function public.create_gift_claim(uuid, uuid) to authenticated, service_role;
revoke all on function public.update_gift_claim_fulfillment(uuid, text, uuid, text, uuid, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.restore_growth_resource_version(text, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.dispatch_notification_campaign(uuid) from public, anon, authenticated;
revoke all on function public.process_due_notification_campaigns() from public, anon, authenticated;
revoke all on function public.enqueue_campaign_pushes(uuid) from public, anon, authenticated;
revoke all on function public.growth_audit_row_change() from public, anon, authenticated;
revoke all on function public.growth_capture_audience_version() from public, anon, authenticated;
revoke all on function public.growth_bump_version() from public, anon, authenticated;
grant execute on function public.growth_audience_matches_agent(uuid, uuid) to service_role;
grant execute on function public.growth_conflicts_for_agent(text, uuid, uuid) to service_role;
grant execute on function public.preview_growth_rule(text, uuid, uuid, jsonb, text, text, text, numeric, numeric, numeric, jsonb, integer) to service_role;
grant execute on function public.preview_growth_audience(uuid, jsonb, integer) to service_role;
grant execute on function public.growth_award_badge(uuid, uuid) to service_role;
grant execute on function public.growth_apply_tier(uuid, uuid, text, boolean) to service_role;
grant execute on function public.evaluate_admin_rules_for_agent(uuid) to service_role;
grant execute on function public.evaluate_admin_rules_for_all() to service_role;
grant execute on function public.evaluate_gift_rules_for_agent(uuid) to service_role;
grant execute on function public.evaluate_gift_rules_for_all() to service_role;
grant execute on function public.run_growth_evaluation(text, boolean, uuid) to service_role;
grant execute on function public.evaluate_growth_due() to service_role;
grant execute on function public.update_gift_claim_fulfillment(uuid, text, uuid, text, uuid, timestamptz, text, jsonb) to service_role;
grant execute on function public.restore_growth_resource_version(text, uuid, integer, uuid) to service_role;
grant execute on function public.dispatch_notification_campaign(uuid) to service_role;
grant execute on function public.process_due_notification_campaigns() to service_role;
grant execute on function public.enqueue_campaign_pushes(uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'brixeler-growth-evaluation') then
    perform cron.schedule(
      'brixeler-growth-evaluation',
      '*/15 * * * *',
      'select public.evaluate_growth_due();'
    );
  end if;
exception when others then
  raise notice 'Unable to schedule Growth evaluator: %', sqlerrm;
end;
$$;

-- Demo Growth records use the same batch cleanup contract as the existing
-- dashboard demo data.  Production rows are never selected unless explicitly
-- marked is_demo=true for this batch.
create or replace function public.cleanup_demo_batch(p_batch text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb := '{}'::jsonb;
  audience_ids uuid[] := '{}'::uuid[];
  gift_ids uuid[] := '{}'::uuid[];
  gift_rule_ids uuid[] := '{}'::uuid[];
  admin_rule_ids uuid[] := '{}'::uuid[];
  tier_ids uuid[] := '{}'::uuid[];
  badge_ids uuid[] := '{}'::uuid[];
  campaign_ids uuid[] := '{}'::uuid[];
  content_ids uuid[] := '{}'::uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required'; end if;
  p_batch := nullif(btrim(p_batch), '');
  if p_batch is null then
    return jsonb_build_object('status', 'refused', 'reason', 'Demo batch is required');
  end if;
  if not exists (
    select 1 from public.demo_data_batches
    where batch_key = p_batch and status = 'active'
  ) then
    return jsonb_build_object('status', 'not_found', 'batch', p_batch);
  end if;
  result := jsonb_build_object('batch', p_batch, 'status', 'removing');

  select coalesce(array_agg(id), '{}'::uuid[]) into audience_ids from public.growth_audiences where is_demo and demo_batch = p_batch;
  select coalesce(array_agg(id), '{}'::uuid[]) into gift_ids from public.gifts where is_demo and demo_batch = p_batch;
  select coalesce(array_agg(id), '{}'::uuid[]) into gift_rule_ids from public.gift_rules where is_demo and demo_batch = p_batch;
  select coalesce(array_agg(id), '{}'::uuid[]) into admin_rule_ids from public.admin_rules where is_demo and demo_batch = p_batch;
  select coalesce(array_agg(id), '{}'::uuid[]) into tier_ids from public.tiers where is_demo and demo_batch = p_batch;
  select coalesce(array_agg(id), '{}'::uuid[]) into badge_ids from public.badges where is_demo and demo_batch = p_batch;
  select coalesce(array_agg(id), '{}'::uuid[]) into campaign_ids from public.notification_campaigns where is_demo and demo_batch = p_batch;
  select coalesce(array_agg(id), '{}'::uuid[]) into content_ids from public.dashboard_content where is_demo and demo_batch = p_batch;

  -- A demo audience can be referenced by a non-demo resource.  Preserve that
  -- resource and remove only the dangling optional audience link.
  update public.gifts set audience_id = null where audience_id = any(audience_ids) and not (is_demo and demo_batch = p_batch);
  update public.gift_rules set audience_id = null where audience_id = any(audience_ids) and not (is_demo and demo_batch = p_batch);
  update public.admin_rules set audience_id = null where audience_id = any(audience_ids) and not (is_demo and demo_batch = p_batch);
  update public.tiers set audience_id = null where audience_id = any(audience_ids) and not (is_demo and demo_batch = p_batch);
  update public.badges set audience_id = null where audience_id = any(audience_ids) and not (is_demo and demo_batch = p_batch);
  update public.notification_campaigns set audience_id = null where audience_id = any(audience_ids) and not (is_demo and demo_batch = p_batch);
  update public.dashboard_content set audience_id = null where audience_id = any(audience_ids) and not (is_demo and demo_batch = p_batch);

  with deleted as (
    delete from public.notifications
    where is_demo and demo_batch = p_batch
    returning 1
  ) select result || jsonb_build_object('notifications', count(*)) into result from deleted;
  with deleted as (
    delete from public.growth_evaluation_results
    where (entity_type = 'audience' and entity_id = any(audience_ids))
       or (entity_type = 'gift' and entity_id = any(gift_ids))
       or (entity_type = 'gift_rule' and entity_id = any(gift_rule_ids))
       or (entity_type = 'admin_rule' and entity_id = any(admin_rule_ids))
       or (entity_type = 'tier' and entity_id = any(tier_ids))
       or (entity_type = 'badge' and entity_id = any(badge_ids))
    returning 1
  ) select result || jsonb_build_object('growth_evaluation_results', count(*)) into result from deleted;
  with deleted as (
    delete from public.agent_badge_awards where badge_id = any(badge_ids) returning 1
  ) select result || jsonb_build_object('agent_badge_awards', count(*)) into result from deleted;
  with deleted as (
    delete from public.agent_badges where badge_id = any(badge_ids) returning 1
  ) select result || jsonb_build_object('agent_badges', count(*)) into result from deleted;
  with deleted as (
    delete from public.user_tiers where tier_id = any(tier_ids) returning 1
  ) select result || jsonb_build_object('user_tiers', count(*)) into result from deleted;
  with deleted as (
    delete from public.gift_claims claim using public.gifts gift
    where claim.gift_id = gift.id and gift.is_demo and gift.demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('gift_claims', count(*)) into result from deleted;
  with deleted as (
    delete from public.gift_eligibilities eligibility using public.gifts gift
    where eligibility.gift_id = gift.id and gift.is_demo and gift.demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('gift_eligibilities', count(*)) into result from deleted;
  with deleted as (
    delete from public.gift_rules where is_demo and demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('gift_rules', count(*)) into result from deleted;
  with deleted as (
    delete from public.admin_rules where is_demo and demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('admin_rules', count(*)) into result from deleted;
  with deleted as (
    delete from public.gifts where is_demo and demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('gifts', count(*)) into result from deleted;
  with deleted as (
    delete from public.tiers where is_demo and demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('tiers', count(*)) into result from deleted;
  with deleted as (
    delete from public.badges where is_demo and demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('badges', count(*)) into result from deleted;
  with deleted as (
    delete from public.notification_campaigns where is_demo and demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('notification_campaigns', count(*)) into result from deleted;
  with deleted as (
    delete from public.dashboard_content where is_demo and demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('dashboard_content', count(*)) into result from deleted;
  with deleted as (
    delete from public.growth_audiences where is_demo and demo_batch = p_batch returning 1
  ) select result || jsonb_build_object('growth_audiences', count(*)) into result from deleted;

  -- Trigger audit rows for the deletes above are removed by ID, while
  -- unrelated history remains intact.
  delete from public.growth_resource_versions
  where (entity_type = 'gift' and entity_id = any(gift_ids))
     or (entity_type = 'gift_rule' and entity_id = any(gift_rule_ids))
     or (entity_type = 'admin_rule' and entity_id = any(admin_rule_ids))
     or (entity_type = 'tier' and entity_id = any(tier_ids))
     or (entity_type = 'badge' and entity_id = any(badge_ids))
     or (entity_type = 'notification_campaign' and entity_id = any(campaign_ids))
     or (entity_type = 'dashboard_content' and entity_id = any(content_ids));
  delete from public.growth_audit_log
  where (entity_type = 'audience' and entity_id = any(audience_ids))
     or (entity_type = 'gift' and entity_id = any(gift_ids))
     or (entity_type = 'gift_rule' and entity_id = any(gift_rule_ids))
     or (entity_type = 'admin_rule' and entity_id = any(admin_rule_ids))
     or (entity_type = 'tier' and entity_id = any(tier_ids))
     or (entity_type = 'badge' and entity_id = any(badge_ids))
     or (entity_type = 'notification_campaign' and entity_id = any(campaign_ids))
     or (entity_type = 'content' and entity_id = any(content_ids))
     or (entity_type = 'dashboard_content' and entity_id = any(content_ids));

  with deleted as (delete from public.deal_stage_entries where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('deal_stage_entries', count(*)) into result from deleted;
  with deleted as (delete from public.deals where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('deals', count(*)) into result from deleted;
  with deleted as (delete from public.developer_contact_requests where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('developer_contact_requests', count(*)) into result from deleted;
  with deleted as (delete from public.support_tickets where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('support_tickets', count(*)) into result from deleted;
  with deleted as (delete from public.properties where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('properties', count(*)) into result from deleted;
  with deleted as (delete from public.developer_projects where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('developer_projects', count(*)) into result from deleted;
  with deleted as (delete from public.admin_export_jobs where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('admin_export_jobs', count(*)) into result from deleted;
  with deleted as (delete from public.support_macros where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('support_macros', count(*)) into result from deleted;
  with deleted as (delete from public.admin_tasks where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('admin_tasks', count(*)) into result from deleted;
  with deleted as (delete from public.admin_agent_notes where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('admin_agent_notes', count(*)) into result from deleted;

  update public.demo_data_batches set status = 'removed', removed_at = now() where batch_key = p_batch;
  return result || jsonb_build_object('status', 'removed');
end;
$$;

revoke all on function public.cleanup_demo_batch(text) from public, anon, authenticated;
grant execute on function public.cleanup_demo_batch(text) to service_role;

-- A small, fully flagged workflow makes local/staging Growth demos coherent;
-- no seed is inserted when the project has no active administrator to own it.
do $$
declare
  demo_admin uuid;
  demo_batch constant text := 'growth-demo-20260829';
  demo_audience constant uuid := 'd2000000-0000-4000-8000-000000000001';
  demo_gift constant uuid := 'd2100000-0000-4000-8000-000000000001';
  demo_gift_rule constant uuid := 'd2200000-0000-4000-8000-000000000001';
  demo_tier constant uuid := 'd2300000-0000-4000-8000-000000000001';
  demo_badge constant uuid := 'd2400000-0000-4000-8000-000000000001';
  demo_admin_rule constant uuid := 'd2500000-0000-4000-8000-000000000001';
begin
  select id into demo_admin from public.admins where is_active order by created_at limit 1;
  if demo_admin is null then return; end if;
  insert into public.demo_data_batches(batch_key, label, notes, created_by)
  values (demo_batch, 'Growth workflow demonstration', 'All rows are explicitly flagged and removable with cleanup_demo_batch.', demo_admin)
  on conflict (batch_key) do update set status = 'active', removed_at = null, created_by = excluded.created_by;
  insert into public.growth_audiences(id, "key", name, name_ar, description, definition, lifecycle_state, version, metadata, created_by, updated_by, created_by_admin, updated_by_admin, is_demo, demo_batch)
  values (demo_audience, 'growth-demo-verified', 'Demo verified agents', 'وكلاء تجريبيون موثقون', 'Explicitly flagged Growth demo audience.', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(jsonb_build_object('field', 'verification_status', 'operator', 'eq', 'value', 'verified'))), 'draft', 1, '{}'::jsonb, demo_admin, demo_admin, demo_admin, demo_admin, true, demo_batch)
  on conflict (id) do update set definition = excluded.definition, lifecycle_state = excluded.lifecycle_state, is_demo = true, demo_batch = excluded.demo_batch, updated_by = excluded.updated_by, updated_by_admin = excluded.updated_by_admin;
  insert into public.gifts(id, title, title_ar, description, icon_url, is_active, tier_ids, exclusivity_mode, gift_type, value_amount, currency, quantity, fulfillment_method, fulfillment_sla_hours, requires_approval, max_total_claims, approval_status, approved_by, approved_at, audience_id, lifecycle_state, created_by_admin, updated_by_admin, is_demo, demo_batch)
  values (demo_gift, 'Demo welcome experience', 'تجربة ترحيبية تجريبية', 'A clearly marked Growth demonstration reward.', 'https://placehold.co/128x128/png?text=Gift', false, '{}'::uuid[], 'none', 'experience', 0, 'EGP', 25, 'manual', 72, false, 25, 'not_required', null, null, demo_audience, 'draft', demo_admin, demo_admin, true, demo_batch)
  on conflict (id) do update set audience_id = excluded.audience_id, lifecycle_state = excluded.lifecycle_state, is_active = false, is_demo = true, demo_batch = excluded.demo_batch, updated_by_admin = excluded.updated_by_admin;
  insert into public.gift_rules(id, gift_id, metric, time_window, operator, value_single, filters, is_active, audience_id, lifecycle_state, approval_status, approved_by, approved_at, created_by_admin, updated_by_admin, is_demo, demo_batch)
  values (demo_gift_rule, demo_gift, 'deals_count', 'all_time', '>=', 1, '{}'::jsonb, false, demo_audience, 'draft', 'not_required', null, null, demo_admin, demo_admin, true, demo_batch)
  on conflict (id) do update set gift_id = excluded.gift_id, audience_id = excluded.audience_id, lifecycle_state = excluded.lifecycle_state, is_active = false, is_demo = true, demo_batch = excluded.demo_batch, updated_by_admin = excluded.updated_by_admin;
  insert into public.tiers(id, name, name_ar, level, icon_url, description, is_active, benefit_type, benefit_value, lifecycle_state, approval_status, audience_id, created_by_admin, updated_by_admin, is_demo, demo_batch)
  values (demo_tier, 'Demo Momentum', 'زخم تجريبي', 9001, 'https://placehold.co/128x128/png?text=Tier', 'A clearly marked Growth demonstration tier.', false, 'none', null, 'draft', 'not_required', demo_audience, demo_admin, demo_admin, true, demo_batch)
  on conflict (id) do update set audience_id = excluded.audience_id, lifecycle_state = excluded.lifecycle_state, is_active = false, is_demo = true, demo_batch = excluded.demo_batch, updated_by_admin = excluded.updated_by_admin;
  insert into public.badges(id, name, name_ar, description, icon_url, badge_type, unlock_criteria, is_active, display_order, expires_in_days, audience_id, lifecycle_state, is_repeatable, visibility, priority, is_revocable, metadata, is_demo, demo_batch, created_by_admin, updated_by_admin)
  values (demo_badge, 'Demo First Win', 'أول نجاح تجريبي', 'A clearly marked Growth demonstration badge.', 'https://placehold.co/128x128/png?text=Badge', 'special', jsonb_build_object('type', 'rule'), false, 9001, null, demo_audience, 'draft', false, 'public', 9001, true, '{}'::jsonb, true, demo_batch, demo_admin, demo_admin)
  on conflict (id) do update set audience_id = excluded.audience_id, lifecycle_state = excluded.lifecycle_state, is_active = false, is_demo = true, demo_batch = excluded.demo_batch, updated_by_admin = excluded.updated_by_admin;
  insert into public.admin_rules(id, target_type, target_id, metric, time_window, operator, value_single, filters, is_active, audience_id, lifecycle_state, approval_status, created_by_admin, updated_by_admin, is_demo, demo_batch)
  values (demo_admin_rule, 'badge', demo_badge, 'deals_count', 'all_time', '>=', 1, '{}'::jsonb, false, demo_audience, 'draft', 'not_required', demo_admin, demo_admin, true, demo_batch)
  on conflict (id) do update set target_id = excluded.target_id, audience_id = excluded.audience_id, lifecycle_state = excluded.lifecycle_state, is_active = false, is_demo = true, demo_batch = excluded.demo_batch, updated_by_admin = excluded.updated_by_admin;
end;
$$;

-- Keep suspended accounts out of mobile Growth reads even if a legacy
-- authenticated policy is restored by a later migration.
do $$
declare
  table_name text;
begin
  for table_name in select unnest(array['gifts', 'gift_eligibilities', 'gift_claims', 'tiers', 'user_tiers', 'badges', 'agent_badges', 'dashboard_content']) loop
    execute format('drop policy if exists growth_authenticated_not_suspended on public.%I', table_name);
    execute format('create policy growth_authenticated_not_suspended on public.%I as restrictive for all to authenticated using (public.current_account_not_suspended()) with check (public.current_account_not_suspended())', table_name);
  end loop;
end;
$$;

-- Constraints are installed separately so this migration remains safe when an
-- earlier environment already has one of the additive columns.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gifts_growth_lifecycle_state_check') then
    alter table public.gifts add constraint gifts_growth_lifecycle_state_check
      check (lifecycle_state in ('draft', 'scheduled', 'active', 'paused', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gifts_growth_schedule_check') then
    alter table public.gifts add constraint gifts_growth_schedule_check
      check (end_at is null or start_at is null or end_at > start_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gifts_growth_claim_limits_check') then
    alter table public.gifts add constraint gifts_growth_claim_limits_check
      check ((max_total_claims is null or max_total_claims > 0)
        and (max_concurrent_claims is null or max_concurrent_claims > 0)
        and (quantity is null or quantity > 0)
        and (claim_window_days is null or claim_window_days > 0)
        and (fulfillment_sla_hours is null or fulfillment_sla_hours > 0)
        and (value_amount is null or value_amount >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gifts_growth_type_check') then
    alter table public.gifts add constraint gifts_growth_type_check
      check (gift_type in ('physical', 'cash', 'discount', 'experience', 'digital', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gifts_growth_fulfillment_method_check') then
    alter table public.gifts add constraint gifts_growth_fulfillment_method_check
      check (fulfillment_method in ('manual', 'shipping', 'wallet', 'coupon', 'external', 'none'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gift_rules_growth_lifecycle_state_check') then
    alter table public.gift_rules add constraint gift_rules_growth_lifecycle_state_check
      check (lifecycle_state in ('draft', 'scheduled', 'active', 'paused', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gift_rules_growth_schedule_check') then
    alter table public.gift_rules add constraint gift_rules_growth_schedule_check
      check (end_at is null or start_at is null or end_at > start_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_rules_growth_lifecycle_state_check') then
    alter table public.admin_rules add constraint admin_rules_growth_lifecycle_state_check
      check (lifecycle_state in ('draft', 'scheduled', 'active', 'paused', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_rules_growth_schedule_check') then
    alter table public.admin_rules add constraint admin_rules_growth_schedule_check
      check (end_at is null or start_at is null or end_at > start_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiers_growth_lifecycle_state_check') then
    alter table public.tiers add constraint tiers_growth_lifecycle_state_check
      check (lifecycle_state in ('draft', 'scheduled', 'active', 'paused', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiers_growth_schedule_check') then
    alter table public.tiers add constraint tiers_growth_schedule_check
      check (end_at is null or start_at is null or end_at > start_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiers_growth_values_check') then
    alter table public.tiers add constraint tiers_growth_values_check
      check (promotion_grace_days >= 0 and demotion_grace_days >= 0
        and stacking_priority >= 0 and (max_stack_count is null or max_stack_count > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiers_growth_reset_period_check') then
    alter table public.tiers add constraint tiers_growth_reset_period_check
      check (reset_period in ('never', 'monthly', 'quarterly', 'yearly', 'custom'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiers_growth_stacking_mode_check') then
    alter table public.tiers add constraint tiers_growth_stacking_mode_check
      check (stacking_mode in ('exclusive', 'additive', 'highest_only', 'none'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'badges_growth_lifecycle_state_check') then
    alter table public.badges add constraint badges_growth_lifecycle_state_check
      check (lifecycle_state in ('draft', 'scheduled', 'active', 'paused', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'badges_growth_schedule_check') then
    alter table public.badges add constraint badges_growth_schedule_check
      check (end_at is null or start_at is null or end_at > start_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'badges_growth_visibility_check') then
    alter table public.badges add constraint badges_growth_visibility_check
      check (visibility in ('public', 'private', 'hidden'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'badges_growth_priority_check') then
    alter table public.badges add constraint badges_growth_priority_check check (priority >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'badges_growth_benefit_expiry_check') then
    alter table public.badges add constraint badges_growth_benefit_expiry_check
      check (benefit_expires_in_days is null or benefit_expires_in_days > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'badges_growth_approval_status_check') then
    alter table public.badges add constraint badges_growth_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_campaigns_growth_lifecycle_state_check') then
    alter table public.notification_campaigns add constraint notification_campaigns_growth_lifecycle_state_check
      check (lifecycle_state in ('draft', 'scheduled', 'active', 'paused', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_campaigns_growth_schedule_check') then
    alter table public.notification_campaigns add constraint notification_campaigns_growth_schedule_check
      check (end_at is null or start_at is null or end_at > start_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_content_growth_lifecycle_state_check') then
    alter table public.dashboard_content add constraint dashboard_content_growth_lifecycle_state_check
      check (lifecycle_state in ('draft', 'scheduled', 'active', 'paused', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_content_growth_schedule_check') then
    alter table public.dashboard_content add constraint dashboard_content_growth_schedule_check
      check (end_at is null or start_at is null or end_at > start_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gift_claims_growth_sla_check') then
    alter table public.gift_claims add constraint gift_claims_growth_sla_check
      check (fulfillment_sla_hours is null or fulfillment_sla_hours > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gifts_growth_approval_status_check') then
    alter table public.gifts add constraint gifts_growth_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'growth_audiences_approval_status_check') then
    alter table public.growth_audiences add constraint growth_audiences_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'growth_audiences_live_requires_approval_check') then
    alter table public.growth_audiences add constraint growth_audiences_live_requires_approval_check
      check (lifecycle_state not in ('active', 'scheduled') or approval_status in ('pending', 'approved'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gift_rules_growth_approval_status_check') then
    alter table public.gift_rules add constraint gift_rules_growth_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_rules_growth_approval_status_check') then
    alter table public.admin_rules add constraint admin_rules_growth_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiers_growth_approval_status_check') then
    alter table public.tiers add constraint tiers_growth_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_campaigns_growth_approval_status_check') then
    alter table public.notification_campaigns add constraint notification_campaigns_growth_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
end;
$$;

commit;
