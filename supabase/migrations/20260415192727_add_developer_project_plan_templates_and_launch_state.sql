alter table public.developer_projects
  add column if not exists payment_plan_templates jsonb not null default '[]'::jsonb,
  add column if not exists limited_time_offers jsonb not null default '[]'::jsonb,
  add column if not exists launch_status text not null default 'live',
  add column if not exists launch_date date;

alter table public.developer_projects
  drop constraint if exists developer_projects_launch_status_check;

alter table public.developer_projects
  add constraint developer_projects_launch_status_check
  check (launch_status in ('live', 'new_launch', 'upcoming'));

comment on column public.developer_projects.payment_plan_templates is 'Structured reusable payment plans for developer projects';
comment on column public.developer_projects.limited_time_offers is 'Structured limited-time offers layered on top of original plans';
comment on column public.developer_projects.launch_status is 'Controls whether the project should appear as a live, new launch, or upcoming launch.';
