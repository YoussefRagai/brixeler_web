begin;

-- Explicit account-level demo marker; never infer it from a person's name/email.
alter table public.users_profile add column if not exists is_demo boolean not null default false;
alter table public.users_profile add column if not exists demo_batch text;

-- First-party, opt-in usage telemetry. No arbitrary properties, URLs or text.
create table public.app_analytics_preferences (
  user_id uuid primary key references public.users_profile(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.app_usage_events (
  user_id uuid not null references public.users_profile(id) on delete cascade,
  event_id uuid not null,
  session_id uuid not null,
  event_name text not null check (event_name in ('screen_view','project_view','property_view','search','favorite_added','contact_requested','deal_submit_started','deal_submit_succeeded','deal_submit_failed')),
  screen text not null check (screen in ('Dashboard','Deals','Properties','Gifts','Profile','Settings','BrixelerFriends','InviteBrixelers','PhoneVerification','DocumentUpload','VerificationStatus','InAppViewer')),
  platform text not null check (platform in ('ios','android','web')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (user_id,event_id)
);
create index app_usage_events_received on public.app_usage_events(received_at);
create index app_usage_events_user_received on public.app_usage_events(user_id,received_at);
alter table public.app_analytics_preferences enable row level security;
alter table public.app_usage_events enable row level security;
revoke all on public.app_analytics_preferences, public.app_usage_events from public, anon, authenticated;
grant all on public.app_analytics_preferences, public.app_usage_events to service_role;

create function public.get_app_analytics_consent() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.app_analytics_preferences where user_id = auth.uid()), false);
$$;
create function public.set_app_analytics_consent(p_enabled boolean, p_expected_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or not exists(select 1 from public.users_profile where id=auth.uid() and account_status='active') then
    raise exception 'Active account required' using errcode='42501';
  end if;
  if p_enabled is null then raise exception 'Consent must be boolean'; end if;
  insert into public.app_analytics_preferences(user_id,enabled) values(auth.uid(),p_enabled)
  on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now();
  -- Opt-out also erases retained events. Lock ordering matches ingestion.
  if not p_enabled then delete from public.app_usage_events where user_id=auth.uid(); end if;
  return p_enabled;
end;
$$;

create function public.ingest_app_usage_events(p_events jsonb, p_expected_user_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
  v_count integer;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id then raise exception 'Matching authenticated account required' using errcode='42501'; end if;
  select enabled into v_enabled from public.app_analytics_preferences where user_id=auth.uid() for update;
  if v_enabled is distinct from true then return 0; end if;
  if not exists(select 1 from public.users_profile where id=auth.uid() and account_status='active' and not coalesce(is_demo,false)) then return 0; end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>50 or octet_length(p_events::text)>24000 then
    raise exception 'Invalid event batch';
  end if;
  -- Per-account bounded ingestion, serialized by the preference lock.
  if (select count(*) from public.app_usage_events where user_id=auth.uid() and received_at>now()-interval '1 hour') + jsonb_array_length(p_events)>1000 then
    raise exception 'Analytics rate limit';
  end if;
  if exists(select 1 from jsonb_array_elements(p_events) e where jsonb_typeof(e)<>'object'
    or (e - array['event_id','session_id','event_name','screen','platform','occurred_at']) <> '{}'::jsonb) then
    raise exception 'Unsupported event fields';
  end if;
  insert into public.app_usage_events(user_id,event_id,session_id,event_name,screen,platform,occurred_at)
  select auth.uid(),x.event_id,x.session_id,x.event_name,x.screen,x.platform,x.occurred_at
  from jsonb_to_recordset(p_events) as x(event_id uuid,session_id uuid,event_name text,screen text,platform text,occurred_at timestamptz)
  where x.occurred_at between now()-interval '24 hours' and now()+interval '5 minutes'
  on conflict(user_id,event_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.app_usage_summary(p_days integer default 30, p_platform text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_days not in (7,30,90) or p_platform not in ('all','ios','android','web') then raise exception 'Invalid analytics filter'; end if;
  with events as (
    select e.* from public.app_usage_events e
    join public.users_profile u on u.id=e.user_id and u.account_status='active' and not coalesce(u.is_demo,false)
    join public.app_analytics_preferences c on c.user_id=e.user_id and c.enabled
    where e.occurred_at >= (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')-make_interval(days=>p_days-1) and e.occurred_at <= now()
      and (p_platform='all' or e.platform=p_platform)
  ), session_browse as (
    select user_id,session_id,min(occurred_at) as viewed_at from events
    where event_name='screen_view' and screen='Properties' group by user_id,session_id
  ), session_detail as (
    select b.user_id,b.session_id,min(e.occurred_at) as viewed_at from session_browse b
    join events e using(user_id,session_id)
    where e.event_name in ('project_view','property_view') and e.occurred_at>=b.viewed_at group by b.user_id,b.session_id
  ), session_contact as (
    select distinct d.user_id,d.session_id from session_detail d join events e using(user_id,session_id)
    where e.event_name='contact_requested' and e.occurred_at>=d.viewed_at
  )
  select jsonb_build_object(
    'days',p_days,'platform',p_platform,'generated_at',now(),'last_event_at',(select max(received_at) from events),
    'active_users',(select count(distinct user_id) from events),
    'sessions',(select count(distinct (user_id,session_id)) from events),
    'screen_views',(select count(*) from events where event_name='screen_view'),
    'events',(select count(*) from events),
    'daily',coalesce((select jsonb_agg(r order by r.day) from (
      select d.day::date as day,count(distinct e.user_id) as users,count(e.event_id) as events
      from generate_series((now() at time zone 'UTC')::date-(p_days-1),(now() at time zone 'UTC')::date,interval '1 day') d(day)
      left join events e on (e.occurred_at at time zone 'UTC')::date=d.day::date group by d.day) r),'[]'::jsonb),
    'screens',coalesce((select jsonb_agg(r order by r.views desc) from (
      select screen,count(*) as views,count(distinct user_id) as users from events where event_name='screen_view' group by screen) r),'[]'::jsonb),
    'features',coalesce((select jsonb_agg(r order by r.events desc) from (
      select event_name,count(*) as events,count(distinct user_id) as users from events where event_name<>'screen_view' group by event_name) r),'[]'::jsonb),
    'funnel',jsonb_build_object('browse_sessions',(select count(*) from session_browse),'detail_sessions',(select count(*) from session_detail),'contact_sessions',(select count(*) from session_contact))
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_app_analytics_consent(), public.set_app_analytics_consent(boolean,uuid), public.ingest_app_usage_events(jsonb,uuid), public.app_usage_summary(integer,text) from public,anon,authenticated;
grant execute on function public.get_app_analytics_consent(), public.set_app_analytics_consent(boolean,uuid), public.ingest_app_usage_events(jsonb,uuid) to authenticated;
grant execute on function public.app_usage_summary(integer,text) to service_role;

-- No provider, third-party SDK or secret is required. Keep raw events <=90 days.
select cron.schedule('brixeler-app-analytics-retention','30 3 * * *', $$delete from public.app_usage_events where received_at < now()-interval '90 days'$$);
commit;
