alter table if exists public.project_unit_variants
  add column if not exists garden_area_sqm numeric(12,2),
  add column if not exists roof_area_sqm numeric(12,2);

create table if not exists public.developer_contact_requests (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  project_id uuid not null references public.developer_projects(id) on delete cascade,
  property_id uuid null references public.properties(id) on delete set null,
  requester_user_id uuid not null references public.users_profile(id) on delete cascade,
  request_type text not null check (request_type in ('call', 'meeting')),
  status text not null default 'open' check (status in ('open', 'contacted', 'closed')),
  request_body text not null,
  requester_display_name text not null,
  requester_email text null,
  requester_phone text null,
  requester_total_deals integer not null default 0,
  developer_name_snapshot text not null,
  project_name_snapshot text not null,
  property_name_snapshot text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists developer_contact_requests_developer_id_idx
  on public.developer_contact_requests (developer_id);

create index if not exists developer_contact_requests_project_id_idx
  on public.developer_contact_requests (project_id, created_at desc);

create index if not exists developer_contact_requests_requester_user_id_idx
  on public.developer_contact_requests (requester_user_id, created_at desc);

create or replace function public.touch_developer_contact_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists developer_contact_requests_touch_updated_at on public.developer_contact_requests;
create trigger developer_contact_requests_touch_updated_at
before update on public.developer_contact_requests
for each row execute procedure public.touch_developer_contact_requests_updated_at();
