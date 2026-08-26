begin;

create index if not exists demo_data_batches_created_by_idx on public.demo_data_batches(created_by);
create index if not exists notification_campaigns_created_by_idx on public.notification_campaigns(created_by);
create index if not exists notification_campaigns_demo_batch_idx on public.notification_campaigns(demo_batch) where is_demo;
create index if not exists admin_export_jobs_created_by_idx on public.admin_export_jobs(created_by);
create index if not exists admin_export_jobs_demo_batch_idx on public.admin_export_jobs(demo_batch) where is_demo;
create index if not exists dashboard_content_updated_by_idx on public.dashboard_content(updated_by);
create index if not exists dashboard_content_demo_batch_idx on public.dashboard_content(demo_batch) where is_demo;
create index if not exists support_macros_created_by_idx on public.support_macros(created_by);
create index if not exists support_macros_demo_batch_idx on public.support_macros(demo_batch) where is_demo;
create index if not exists admin_tasks_assigned_to_idx on public.admin_tasks(assigned_to);
create index if not exists admin_tasks_created_by_idx on public.admin_tasks(created_by);
create index if not exists admin_tasks_demo_batch_idx on public.admin_tasks(demo_batch) where is_demo;
create index if not exists admin_agent_notes_agent_created_idx on public.admin_agent_notes(agent_id, created_at desc);
create index if not exists admin_agent_notes_created_by_idx on public.admin_agent_notes(created_by);
create index if not exists admin_agent_notes_demo_batch_idx on public.admin_agent_notes(demo_batch) where is_demo;
create index if not exists support_tickets_assigned_to_idx on public.support_tickets(assigned_to) where assigned_to is not null;

commit;
