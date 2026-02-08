-- Gifts data model + rules engine + instant evaluation triggers

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ar text,
  description text,
  icon_url text,
  is_active boolean default true,
  tier_ids uuid[] default '{}'::uuid[],
  max_concurrent_claims integer,
  exclusivity_mode text default 'none' check (exclusivity_mode in ('none','eligible','claimed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.gift_rules (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid references gifts(id) on delete cascade,
  metric text not null,
  time_window text not null,
  operator text not null,
  value_single numeric,
  value_min numeric,
  value_max numeric,
  filters jsonb default '{}'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.gift_eligibilities (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid references gifts(id) on delete cascade,
  agent_id uuid references users_profile(id) on delete cascade,
  status text not null default 'eligible' check (status in ('eligible','claimed','expired','blocked')),
  eligible_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (gift_id, agent_id)
);

create table if not exists public.gift_claims (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid references gifts(id) on delete cascade,
  agent_id uuid references users_profile(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','fulfilled','cancelled')),
  claimed_at timestamptz default now(),
  updated_at timestamptz default now(),
  notes text
);

create or replace function public.agent_current_tier_level(p_agent_id uuid)
returns integer
language sql
stable
as $$
  select t.level
  from user_tiers ut
  join tiers t on t.id = ut.tier_id
  where ut.user_id = p_agent_id
  limit 1;
$$;

create or replace function public.gift_agent_matches_rule(
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
begin
  return public.reward_agent_matches_rule(
    p_agent_id,
    p_metric,
    p_window,
    p_operator,
    p_value_single,
    p_value_min,
    p_value_max,
    p_filters
  );
end;
$$;

create or replace function public.evaluate_gift_rules_for_agent(p_agent_id uuid)
returns void
language plpgsql
as $$
declare
  gift_row record;
  rule_row record;
  allowed_by_tier boolean;
  agent_tier_id uuid;
  matches boolean;
  eligible_other boolean;
  claimed_other boolean;
begin
  select ut.tier_id into agent_tier_id from user_tiers ut where ut.user_id = p_agent_id limit 1;

  for gift_row in
    select * from gifts where is_active = true
  loop
    allowed_by_tier := (gift_row.tier_ids is null or array_length(gift_row.tier_ids,1) is null)
      or (agent_tier_id is not null and agent_tier_id = any(gift_row.tier_ids));

    if not allowed_by_tier then
      update gift_eligibilities
         set status = 'blocked', updated_at = now()
       where gift_id = gift_row.id and agent_id = p_agent_id;
      continue;
    end if;

    select exists(
      select 1
      from gift_eligibilities ge
      join gifts g on g.id = ge.gift_id
      where ge.agent_id = p_agent_id
        and ge.gift_id <> gift_row.id
        and g.exclusivity_mode = 'eligible'
        and ge.status = 'eligible'
    ) into eligible_other;

    select exists(
      select 1
      from gift_claims gc
      join gifts g on g.id = gc.gift_id
      where gc.agent_id = p_agent_id
        and gc.gift_id <> gift_row.id
        and g.exclusivity_mode = 'claimed'
        and gc.status in ('pending','approved','fulfilled')
    ) into claimed_other;

    if eligible_other or claimed_other then
      update gift_eligibilities
         set status = 'blocked', updated_at = now()
       where gift_id = gift_row.id and agent_id = p_agent_id;
      continue;
    end if;

    matches := false;
    for rule_row in
      select * from gift_rules where gift_id = gift_row.id and is_active = true
    loop
      if public.gift_agent_matches_rule(
          p_agent_id,
          rule_row.metric,
          rule_row.time_window,
          rule_row.operator,
          rule_row.value_single,
          rule_row.value_min,
          rule_row.value_max,
          rule_row.filters
      ) then
        matches := true;
        exit;
      end if;
    end loop;

    if matches then
      insert into gift_eligibilities(gift_id, agent_id, status, eligible_at, updated_at)
      values (gift_row.id, p_agent_id, 'eligible', now(), now())
      on conflict (gift_id, agent_id) do update
        set status = 'eligible', updated_at = now();
    else
      delete from gift_eligibilities where gift_id = gift_row.id and agent_id = p_agent_id;
    end if;
  end loop;
end;
$$;

create or replace function public.evaluate_gift_rules_for_all()
returns void
language plpgsql
as $$
declare
  row record;
begin
  for row in select id from users_profile loop
    perform public.evaluate_gift_rules_for_agent(row.id);
  end loop;
end;
$$;

create or replace function public.create_gift_claim(p_gift_id uuid, p_agent_id uuid)
returns uuid
language plpgsql
as $$
declare
  gift_row gifts%rowtype;
  active_claims integer := 0;
  eligibility gift_eligibilities%rowtype;
  claim_id uuid;
begin
  select * into gift_row from gifts where id = p_gift_id and is_active = true;
  if not found then
    raise exception 'Gift not found or inactive';
  end if;

  if gift_row.max_concurrent_claims is not null then
    select count(*) into active_claims
    from gift_claims
    where agent_id = p_agent_id
      and status in ('pending','approved','fulfilled');
    if active_claims >= gift_row.max_concurrent_claims then
      raise exception 'Claim limit reached';
    end if;
  end if;

  select * into eligibility
  from gift_eligibilities
  where gift_id = p_gift_id and agent_id = p_agent_id and status = 'eligible';
  if not found then
    raise exception 'Gift not eligible';
  end if;

  insert into gift_claims(gift_id, agent_id, status, claimed_at, updated_at)
  values (p_gift_id, p_agent_id, 'pending', now(), now())
  returning id into claim_id;

  update gift_eligibilities
     set status = 'claimed', updated_at = now()
   where gift_id = p_gift_id and agent_id = p_agent_id;

  return claim_id;
end;
$$;

create or replace function public.trigger_eval_gift_rules()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    if new.agent_id is not null then
      perform public.evaluate_gift_rules_for_agent(new.agent_id);
    end if;
  end if;
  if tg_op = 'UPDATE' and old.agent_id is not null and old.agent_id <> new.agent_id then
    perform public.evaluate_gift_rules_for_agent(old.agent_id);
  end if;
  return new;
end;
$$;

create or replace function public.trigger_eval_gift_rules_properties()
returns trigger
language plpgsql
as $$
begin
  if new.listed_by_agent_id is not null then
    perform public.evaluate_gift_rules_for_agent(new.listed_by_agent_id);
  end if;
  if tg_op = 'UPDATE' and old.listed_by_agent_id is not null and old.listed_by_agent_id <> new.listed_by_agent_id then
    perform public.evaluate_gift_rules_for_agent(old.listed_by_agent_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_eval_gift_rules_deals on deals;
create trigger trg_eval_gift_rules_deals
after insert or update on deals
for each row execute function public.trigger_eval_gift_rules();

drop trigger if exists trg_eval_gift_rules_sales_claims on deal_stage_entries;
create trigger trg_eval_gift_rules_sales_claims
after insert or update on deal_stage_entries
for each row
when (new.stage::text = 'SalesClaim')
execute function public.trigger_eval_gift_rules();

drop trigger if exists trg_eval_gift_rules_properties on properties;
create trigger trg_eval_gift_rules_properties
after insert or update on properties
for each row execute function public.trigger_eval_gift_rules_properties();

drop trigger if exists trg_eval_gift_rules_referrals on users_profile;
create trigger trg_eval_gift_rules_referrals
after insert or update of referred_by on users_profile
for each row execute function public.trigger_eval_gift_rules();

create or replace function public.preview_gift_rule(
  gift_id uuid,
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
