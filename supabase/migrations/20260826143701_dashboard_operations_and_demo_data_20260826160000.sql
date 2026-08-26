begin;

create table if not exists public.demo_data_batches (
  batch_key text primary key,
  label text not null,
  notes text,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_by uuid references public.admins(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

alter table public.developer_projects
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;
alter table public.properties
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;
alter table public.deals
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;
alter table public.deal_stage_entries
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;
alter table public.notifications
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;
alter table public.support_tickets
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;
alter table public.developer_contact_requests
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_batch text references public.demo_data_batches(batch_key) on delete set null;

create index if not exists developer_projects_demo_batch_idx on public.developer_projects(demo_batch) where is_demo;
create index if not exists properties_demo_batch_idx on public.properties(demo_batch) where is_demo;
create index if not exists deals_demo_batch_idx on public.deals(demo_batch) where is_demo;
create index if not exists deal_stage_entries_demo_batch_idx on public.deal_stage_entries(demo_batch) where is_demo;
create index if not exists notifications_demo_batch_idx on public.notifications(demo_batch) where is_demo;
create index if not exists support_tickets_demo_batch_idx on public.support_tickets(demo_batch) where is_demo;

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.admins(id),
  audience text not null check (audience in ('all', 'verified', 'no_deals', 'waiting_payment')),
  channel text not null default 'in_app' check (channel in ('in_app', 'in_app_push')),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 2000),
  action_url text,
  scheduled_for timestamptz not null default now(),
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'sent', 'failed', 'cancelled')),
  recipient_count integer not null default 0,
  sent_at timestamptz,
  error_message text,
  is_demo boolean not null default false,
  demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_campaigns_due_idx
  on public.notification_campaigns(status, scheduled_for)
  where status = 'scheduled';

create table if not exists public.admin_export_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.admins(id),
  export_type text not null check (export_type in ('dashboard', 'agents', 'deals', 'properties', 'commissions')),
  file_format text not null default 'csv' check (file_format in ('csv', 'xlsx')),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed', 'expired')),
  row_count integer not null default 0,
  file_name text not null,
  expires_at timestamptz not null default (now() + interval '5 days'),
  is_demo boolean not null default false,
  demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.dashboard_content (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('amenity', 'faq', 'mobile_announcement')),
  content_key text not null,
  label text not null,
  label_ar text,
  body text,
  body_ar text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  published_at timestamptz,
  updated_by uuid references public.admins(id),
  is_demo boolean not null default false,
  demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(content_type, content_key)
);

create table if not exists public.support_macros (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  category text,
  is_active boolean not null default true,
  created_by uuid references public.admins(id),
  is_demo boolean not null default false,
  demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid references public.admins(id),
  related_entity_type text,
  related_entity_id uuid,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  due_at timestamptz,
  created_by uuid not null references public.admins(id),
  is_demo boolean not null default false,
  demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_agent_notes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 4000),
  created_by uuid not null references public.admins(id),
  is_demo boolean not null default false,
  demo_batch text references public.demo_data_batches(batch_key) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.support_tickets
  add column if not exists assigned_to uuid references public.admins(id),
  add column if not exists resolved_at timestamptz,
  add column if not exists first_response_at timestamptz;

alter table public.demo_data_batches enable row level security;
alter table public.demo_data_batches force row level security;
alter table public.notification_campaigns enable row level security;
alter table public.notification_campaigns force row level security;
alter table public.admin_export_jobs enable row level security;
alter table public.admin_export_jobs force row level security;
alter table public.dashboard_content enable row level security;
alter table public.dashboard_content force row level security;
alter table public.support_macros enable row level security;
alter table public.support_macros force row level security;
alter table public.admin_tasks enable row level security;
alter table public.admin_tasks force row level security;
alter table public.admin_agent_notes enable row level security;
alter table public.admin_agent_notes force row level security;

revoke all on public.demo_data_batches, public.notification_campaigns, public.admin_export_jobs,
  public.dashboard_content, public.support_macros, public.admin_tasks, public.admin_agent_notes
  from anon, authenticated;
grant all on public.demo_data_batches, public.notification_campaigns, public.admin_export_jobs,
  public.dashboard_content, public.support_macros, public.admin_tasks, public.admin_agent_notes
  to service_role;

create policy demo_data_batches_service_role on public.demo_data_batches for all to service_role using (true) with check (true);
create policy notification_campaigns_service_role on public.notification_campaigns for all to service_role using (true) with check (true);
create policy admin_export_jobs_service_role on public.admin_export_jobs for all to service_role using (true) with check (true);
create policy dashboard_content_service_role on public.dashboard_content for all to service_role using (true) with check (true);
create policy support_macros_service_role on public.support_macros for all to service_role using (true) with check (true);
create policy admin_tasks_service_role on public.admin_tasks for all to service_role using (true) with check (true);
create policy admin_agent_notes_service_role on public.admin_agent_notes for all to service_role using (true) with check (true);

create or replace function public.developer_dashboard_metrics(dev_id uuid)
returns table (
  listings bigint,
  hidden bigint,
  pending bigint,
  inquiries bigint,
  eois bigint,
  cils bigint,
  reservations bigint,
  sales_claims bigint,
  stage_shifts bigint,
  deals_this_month bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with developer_row as (
    select name from public.developers where id = dev_id
  ),
  owned_properties as (
    select p.*
    from public.properties p
    where p.developer_id = dev_id
       or exists (
         select 1 from public.developer_projects dp
         where dp.id = p.project_id and dp.developer_id = dev_id
       )
  ),
  stage_rows as (
    select dse.*
    from public.deal_stage_entries dse
    where lower(coalesce(dse.developer_name, '')) = lower(coalesce((select name from developer_row), ''))
  ),
  deal_rows as (
    select d.*
    from public.deals d
    where lower(d.developer_name) = lower(coalesce((select name from developer_row), ''))
  )
  select
    count(*) filter (where coalesce(is_active, true) and approval_status = 'approved'),
    count(*) filter (where not coalesce(is_active, true)),
    count(*) filter (where approval_status = 'pending'),
    coalesce(sum(inquiries_count), 0)::bigint +
      (select count(*) from public.developer_contact_requests r where r.developer_id = dev_id and r.status = 'open'),
    (select count(*) from stage_rows where stage = 'EOI'),
    (select count(*) from stage_rows where stage = 'CIL'),
    (select count(*) from stage_rows where stage = 'Reservation'),
    (select count(*) from stage_rows where stage = 'SalesClaim'),
    (select count(*) from stage_rows where updated_at >= now() - interval '30 days'),
    (select count(*) from deal_rows where submitted_at >= date_trunc('month', now()))
  from owned_properties;
$$;

revoke all on function public.developer_dashboard_metrics(uuid) from public, anon, authenticated;
grant execute on function public.developer_dashboard_metrics(uuid) to service_role;

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

  select * into campaign
  from public.notification_campaigns
  where id = p_campaign_id
  for update;

  if not found then raise exception 'Campaign not found'; end if;
  if campaign.status not in ('scheduled', 'failed') then return campaign.recipient_count; end if;
  if campaign.scheduled_for > now() then return 0; end if;

  update public.notification_campaigns set status = 'processing', updated_at = now(), error_message = null where id = campaign.id;

  insert into public.notifications (
    agent_id, type, title, message, action_url, push_sent, is_demo, demo_batch
  )
  select
    u.id,
    'admin_message'::public.notification_type,
    campaign.title,
    campaign.message,
    campaign.action_url,
    false,
    campaign.is_demo,
    campaign.demo_batch
  from public.users_profile u
  where u.account_status = 'active'
    and (
      campaign.audience = 'all'
      or (campaign.audience = 'verified' and u.verification_status = 'verified')
      or (campaign.audience = 'no_deals' and coalesce(u.total_deals, 0) = 0)
      or (
        campaign.audience = 'waiting_payment'
        and exists (select 1 from public.deals d where d.agent_id = u.id and d.status in ('approved', 'confirmed', 'awaiting_payment'))
      )
    );
  get diagnostics inserted_count = row_count;

  update public.notification_campaigns
  set status = 'sent', recipient_count = inserted_count, sent_at = now(), updated_at = now()
  where id = campaign.id;
  return inserted_count;
exception when others then
  update public.notification_campaigns
  set status = 'failed', error_message = sqlerrm, updated_at = now()
  where id = p_campaign_id;
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
    where status = 'scheduled' and scheduled_for <= now()
    order by scheduled_for
    limit 25
  loop
    perform public.dispatch_notification_campaign(item.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

revoke all on function public.dispatch_notification_campaign(uuid) from public, anon, authenticated;
revoke all on function public.process_due_notification_campaigns() from public, anon, authenticated;
grant execute on function public.dispatch_notification_campaign(uuid) to service_role;
grant execute on function public.process_due_notification_campaigns() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'brixeler-notification-campaigns') then
    perform cron.schedule(
      'brixeler-notification-campaigns',
      '* * * * *',
      'select public.process_due_notification_campaigns();'
    );
  end if;
exception when others then
  raise notice 'Unable to schedule notification dispatcher: %', sqlerrm;
end;
$$;

create or replace function public.cleanup_demo_batch(p_batch text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_batch is null or p_batch = '' then raise exception 'Demo batch is required'; end if;

  with deleted as (delete from public.notifications where is_demo and demo_batch = p_batch returning 1)
  select jsonb_build_object('notifications', count(*)) into result from deleted;
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
  with deleted as (delete from public.notification_campaigns where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('notification_campaigns', count(*)) into result from deleted;
  with deleted as (delete from public.admin_export_jobs where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('admin_export_jobs', count(*)) into result from deleted;
  with deleted as (delete from public.dashboard_content where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('dashboard_content', count(*)) into result from deleted;
  with deleted as (delete from public.support_macros where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('support_macros', count(*)) into result from deleted;
  with deleted as (delete from public.admin_tasks where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('admin_tasks', count(*)) into result from deleted;
  with deleted as (delete from public.admin_agent_notes where is_demo and demo_batch = p_batch returning 1)
  select result || jsonb_build_object('admin_agent_notes', count(*)) into result from deleted;

  update public.demo_data_batches set status = 'removed', removed_at = now() where batch_key = p_batch;
  return result;
end;
$$;

revoke all on function public.cleanup_demo_batch(text) from public, anon, authenticated;
grant execute on function public.cleanup_demo_batch(text) to service_role;

insert into public.demo_data_batches(batch_key, label, notes)
values ('dashboard-demo-20260826', 'Dashboard and mobile demonstration data', 'Safe to remove with cleanup_demo_batch after launch.')
on conflict (batch_key) do update set label = excluded.label, notes = excluded.notes, status = 'active', removed_at = null;

insert into public.dashboard_content(content_type, content_key, label, label_ar, body, sort_order, published_at, is_demo, demo_batch)
values
  ('amenity', 'infinity-pool', 'Infinity pool', 'حمام سباحة لا متناهي', null, 10, now(), true, 'dashboard-demo-20260826'),
  ('amenity', 'clubhouse', 'Clubhouse', 'نادي اجتماعي', null, 20, now(), true, 'dashboard-demo-20260826'),
  ('amenity', 'smart-home', 'Smart home', 'منزل ذكي', null, 30, now(), true, 'dashboard-demo-20260826'),
  ('faq', 'demo-listings', 'How are demo listings identified?', 'كيف يتم تحديد القوائم التجريبية؟', 'Demo records display a DEMO badge and can be removed as one batch before launch.', 10, now(), true, 'dashboard-demo-20260826')
on conflict (content_type, content_key) do update
set label = excluded.label, label_ar = excluded.label_ar, body = excluded.body,
    sort_order = excluded.sort_order, published_at = excluded.published_at,
    is_demo = excluded.is_demo, demo_batch = excluded.demo_batch, updated_at = now();

insert into public.support_macros(title, message, category, is_demo, demo_batch)
values
  ('Verification documents received', 'We received your documents and the verification team is reviewing them now.', 'verification', true, 'dashboard-demo-20260826'),
  ('Commission review started', 'Your commission case has been assigned for review. We will update you in this ticket.', 'commission', true, 'dashboard-demo-20260826'),
  ('More information required', 'Please reply with the missing details so we can continue processing your request.', 'general', true, 'dashboard-demo-20260826')
on conflict do nothing;

do $$
declare
  demo_developer uuid;
  demo_project uuid := 'd0000000-0000-4000-8000-000000000001';
begin
  select id into demo_developer from public.developers where coalesce(is_active, true) order by created_at limit 1;
  if demo_developer is null then return; end if;

  insert into public.developer_projects(
    id, developer_id, name, description, hero_media, amenities, location, payment_plans,
    launch_status, launch_date, is_demo, demo_batch
  ) values (
    demo_project, demo_developer, 'Brixeler Demo Residences',
    'Demonstration launch used to exercise developer, admin, and mobile workflows.',
    jsonb_build_object('cover', 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80'),
    array['Clubhouse', 'Infinity pool', 'Smart home'], 'New Cairo',
    '10% down payment · up to 8 years', 'live', current_date,
    true, 'dashboard-demo-20260826'
  ) on conflict (id) do update set
    developer_id = excluded.developer_id, name = excluded.name, description = excluded.description,
    hero_media = excluded.hero_media, amenities = excluded.amenities, location = excluded.location,
    payment_plans = excluded.payment_plans, launch_status = excluded.launch_status,
    is_demo = true, demo_batch = excluded.demo_batch, updated_at = now();

  insert into public.properties(
    id, property_name, developer_id, project_id, specific_location, property_type,
    bedrooms, bathrooms, unit_area, price, sale_type, down_payment_percentage,
    monthly_installment, installment_years, finishing_status, delivery_date,
    amenities, description, photos, cover_photo_url, approval_status, is_active,
    published_at, expires_at, renewal_status, is_demo, demo_batch
  ) values
  (
    'd1000000-0000-4000-8000-000000000001', 'Demo Garden Apartment', demo_developer, demo_project,
    'Demo District · New Cairo', 'apartment', 2, 2, 138, 7200000, 'developer_sale', 10,
    67500, 8, 'finished', current_date + 730,
    array['Clubhouse', 'Infinity pool', 'Smart home'],
    'A clearly marked demonstration listing for end-to-end dashboard and mobile testing.',
    array[
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=80'
    ],
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80',
    'approved', true, now(), now() + interval '180 days', 'active', true, 'dashboard-demo-20260826'
  ),
  (
    'd1000000-0000-4000-8000-000000000002', 'Demo Sky Villa', demo_developer, demo_project,
    'Demo District · New Cairo', 'villa', 4, 5, 330, 19800000, 'developer_sale', 10,
    185625, 8, 'semi_finished', current_date + 900,
    array['Private garden', 'Clubhouse', 'Smart home'],
    'A second demonstration listing covering premium inventory and villa filters.',
    array[
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1600&q=80'
    ],
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=80',
    'approved', true, now(), now() + interval '180 days', 'active', true, 'dashboard-demo-20260826'
  )
  on conflict (id) do update set
    property_name = excluded.property_name, developer_id = excluded.developer_id, project_id = excluded.project_id,
    specific_location = excluded.specific_location, property_type = excluded.property_type,
    bedrooms = excluded.bedrooms, bathrooms = excluded.bathrooms, unit_area = excluded.unit_area,
    price = excluded.price, amenities = excluded.amenities, description = excluded.description,
    photos = excluded.photos, cover_photo_url = excluded.cover_photo_url,
    approval_status = 'approved', is_active = true, expires_at = excluded.expires_at,
    is_demo = true, demo_batch = excluded.demo_batch, updated_at = now();
end;
$$;

commit;
