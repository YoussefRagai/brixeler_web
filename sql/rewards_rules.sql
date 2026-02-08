-- Rewards rule engine: metrics + instant evaluation triggers

-- Backfill optional columns (safe if already present)
alter table if exists public.badges add column if not exists name_ar text;

create or replace function public.reward_window_start(p_window text)
returns timestamptz
language sql
stable
as $$
  select case
    when p_window = 'last_30d' then now() - interval '30 days'
    when p_window = 'last_90d' then now() - interval '90 days'
    when p_window = 'quarter' then date_trunc('quarter', now())
    when p_window = 'year' then date_trunc('year', now())
    else null
  end;
$$;

create or replace function public.reward_metric_value(
  p_agent_id uuid,
  p_metric text,
  p_window text,
  p_filters jsonb default '{}'::jsonb
)
returns numeric
language plpgsql
stable
as $$
declare
  window_start timestamptz := public.reward_window_start(p_window);
  v numeric := 0;
  v_developer_name text := nullif(p_filters->>'developer_name','');
  v_developer_id uuid := nullif(p_filters->>'developer_id','')::uuid;
  v_project_id uuid := nullif(p_filters->>'project_id','')::uuid;
  v_property_type text := nullif(p_filters->>'property_type','');
begin
  if p_metric = 'deals_count' then
    select count(*)::numeric into v
    from deals
    where agent_id = p_agent_id
      and (window_start is null or created_at >= window_start)
      and (v_developer_name is null or developer_name = v_developer_name);
  elsif p_metric = 'deals_volume' then
    select coalesce(sum(sale_amount),0)::numeric into v
    from deals
    where agent_id = p_agent_id
      and (window_start is null or created_at >= window_start)
      and (v_developer_name is null or developer_name = v_developer_name);
  elsif p_metric = 'revenue' then
    select coalesce(sum(coalesce(actual_commission, estimated_commission, sale_amount * (commission_rate/100.0))),0)::numeric into v
    from deals
    where agent_id = p_agent_id
      and (window_start is null or created_at >= window_start)
      and (v_developer_name is null or developer_name = v_developer_name);
  elsif p_metric = 'referrals' then
    select count(*)::numeric into v
    from users_profile
    where referred_by = p_agent_id
      and (window_start is null or created_at >= window_start);
  elsif p_metric = 'listings_count' then
    select count(*)::numeric into v
    from properties
    where listed_by_agent_id = p_agent_id
      and (window_start is null or created_at >= window_start)
      and (v_developer_id is null or developer_id = v_developer_id)
      and (v_project_id is null or project_id = v_project_id)
      and (v_property_type is null or property_type::text = v_property_type);
  elsif p_metric = 'claim_acceptance' then
    -- Accepted / (Accepted + Rejected + Requested Change)
    with claims as (
      select status
      from deal_stage_entries
      where agent_id = p_agent_id
        and stage::text = 'SalesClaim'
        and (window_start is null or created_at >= window_start)
    )
    select
      case
        when count(*) = 0 then 0
        else (count(*) filter (where status in ('Accepted - Processing','Paid'))::numeric /
              count(*)::numeric)
      end
    into v
    from claims;
  else
    v := 0;
  end if;

  return coalesce(v,0);
end;
$$;

create or replace function public.reward_agent_matches_rule(
  p_agent_id uuid,
  p_metric text,
  p_window text,
  p_operator text,
  p_value_single numeric,
  p_value_min numeric,
  p_value_max numeric,
  p_filters jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
as $$
declare
  agent_value numeric := public.reward_metric_value(p_agent_id, p_metric, p_window, p_filters);
  total_count integer := 0;
  rank_pos integer := null;
begin
  if p_operator = '>=' then
    return agent_value >= coalesce(p_value_single,0);
  elsif p_operator = '<=' then
    return agent_value <= coalesce(p_value_single,0);
  elsif p_operator = 'between' then
    return agent_value between coalesce(p_value_min,0) and coalesce(p_value_max,0);
  elsif p_operator in ('top_n','top_percent') then
    with metrics as (
      select id, public.reward_metric_value(id, p_metric, p_window, p_filters) as v
      from users_profile
    ),
    ranked as (
      select id,
             dense_rank() over (order by v desc) as r,
             count(*) over () as total
      from metrics
    )
    select r, total into rank_pos, total_count
    from ranked where id = p_agent_id;

    if rank_pos is null or total_count = 0 then
      return false;
    end if;

    if p_operator = 'top_n' then
      return rank_pos <= coalesce(p_value_single,0);
    else
      return (rank_pos::numeric / total_count::numeric) <= (coalesce(p_value_single,0) / 100.0);
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.evaluate_admin_rules_for_agent(p_agent_id uuid)
returns void
language plpgsql
as $$
declare
  rule_row record;
  tier_level integer;
  current_level integer;
  expires_days integer;
  badge_id uuid;
begin
  -- clear expired badges for this agent
  delete from agent_badges
   where agent_id = p_agent_id
     and expires_at is not null
     and expires_at < now();

  for rule_row in
    select * from admin_rules where is_active = true
  loop
    if public.reward_agent_matches_rule(
        p_agent_id,
        rule_row.metric,
        rule_row.time_window,
        rule_row.operator,
        rule_row.value_single,
        rule_row.value_min,
        rule_row.value_max,
        rule_row.filters
      ) then
      if rule_row.target_type = 'badge' then
        select id, expires_in_days into badge_id, expires_days
        from badges where id = rule_row.target_id;
        if badge_id is not null then
          insert into agent_badges(agent_id, badge_id, expires_at)
          values (p_agent_id, badge_id,
                  case when expires_days is not null then now() + (expires_days || ' days')::interval else null end)
          on conflict (agent_id, badge_id) do update
            set expires_at = excluded.expires_at,
                unlocked_at = now();
        end if;
      elsif rule_row.target_type = 'tier' then
        select level into tier_level from tiers where id = rule_row.target_id;
        select t.level into current_level
        from user_tiers ut
        join tiers t on t.id = ut.tier_id
        where ut.user_id = p_agent_id
        limit 1;

        if tier_level is not null and (current_level is null or tier_level > current_level) then
          delete from user_tiers where user_id = p_agent_id;
          insert into user_tiers(user_id, tier_id, awarded_at)
          values (p_agent_id, rule_row.target_id, now());
        end if;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.evaluate_admin_rules_for_all()
returns void
language plpgsql
as $$
declare
  row record;
begin
  for row in select id from users_profile loop
    perform public.evaluate_admin_rules_for_agent(row.id);
  end loop;
end;
$$;

-- Trigger helpers
create or replace function public.trigger_eval_admin_rules()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    if new.agent_id is not null then
      perform public.evaluate_admin_rules_for_agent(new.agent_id);
    end if;
  end if;
  if tg_op = 'UPDATE' and old.agent_id is not null and old.agent_id <> new.agent_id then
    perform public.evaluate_admin_rules_for_agent(old.agent_id);
  end if;
  return new;
end;
$$;

create or replace function public.trigger_eval_admin_rules_properties()
returns trigger
language plpgsql
as $$
begin
  if new.listed_by_agent_id is not null then
    perform public.evaluate_admin_rules_for_agent(new.listed_by_agent_id);
  end if;
  if tg_op = 'UPDATE' and old.listed_by_agent_id is not null and old.listed_by_agent_id <> new.listed_by_agent_id then
    perform public.evaluate_admin_rules_for_agent(old.listed_by_agent_id);
  end if;
  return new;
end;
$$;

create or replace function public.trigger_eval_admin_rules_referrals()
returns trigger
language plpgsql
as $$
begin
  if new.referred_by is not null then
    perform public.evaluate_admin_rules_for_agent(new.referred_by);
  end if;
  if tg_op = 'UPDATE' and old.referred_by is not null and old.referred_by <> new.referred_by then
    perform public.evaluate_admin_rules_for_agent(old.referred_by);
  end if;
  return new;
end;
$$;

-- Deals trigger
drop trigger if exists trg_eval_admin_rules_deals on deals;
create trigger trg_eval_admin_rules_deals
after insert or update on deals
for each row execute function public.trigger_eval_admin_rules();

-- Sales claims trigger
drop trigger if exists trg_eval_admin_rules_sales_claims on deal_stage_entries;
create trigger trg_eval_admin_rules_sales_claims
after insert or update on deal_stage_entries
for each row
when (new.stage::text = 'SalesClaim')
execute function public.trigger_eval_admin_rules();

-- Listings trigger
drop trigger if exists trg_eval_admin_rules_properties on properties;
create trigger trg_eval_admin_rules_properties
after insert or update on properties
for each row execute function public.trigger_eval_admin_rules_properties();

-- Referrals trigger
drop trigger if exists trg_eval_admin_rules_referrals on users_profile;
create trigger trg_eval_admin_rules_referrals
after insert or update of referred_by on users_profile
for each row execute function public.trigger_eval_admin_rules_referrals();

-- Preview function for rule builder
create or replace function public.preview_admin_rule(
  target_type text,
  target_id uuid,
  metric text,
  time_window text,
  operator text,
  value_single numeric,
  value_min numeric,
  value_max numeric,
  filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  result_count integer := 0;
  sample_ids text[] := '{}';
begin
  with metrics as (
    select id, public.reward_metric_value(id, metric, time_window, filters) as v
    from users_profile
  ),
  filtered as (
    select id
    from metrics
    where
      case
        when operator = '>=' then v >= coalesce(value_single,0)
        when operator = '<=' then v <= coalesce(value_single,0)
        when operator = 'between' then v between coalesce(value_min,0) and coalesce(value_max,0)
        when operator = 'top_n' then id in (
          select id from metrics order by v desc limit coalesce(value_single,0)::int
        )
        when operator = 'top_percent' then id in (
          select id from metrics order by v desc
          limit greatest(1, ceil((coalesce(value_single,0) / 100.0) * (select count(*) from metrics))::int)
        )
        else false
      end
  )
  select count(*), array_agg(id::text order by id) into result_count, sample_ids
  from filtered;

  return jsonb_build_object(
    'count', coalesce(result_count,0),
    'sample', coalesce(sample_ids[1:10], '{}')
  );
end;
$$;
