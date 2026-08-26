begin;

-- Ensure exposed catalog tables remain readable while protected by RLS.
alter table public.developers enable row level security;
drop policy if exists developers_public_read on public.developers;
create policy developers_public_read
on public.developers
for select
to public
using (true);

alter table public.areas enable row level security;
drop policy if exists areas_public_read on public.areas;
create policy areas_public_read
on public.areas
for select
to public
using (true);

alter table public.developer_projects enable row level security;
drop policy if exists developer_projects_public_read on public.developer_projects;
create policy developer_projects_public_read
on public.developer_projects
for select
to public
using (true);

-- Security hardening for reward and gift tables used by mobile and admin.
alter table public.agent_badges enable row level security;
drop policy if exists agent_badges_agent_read_own on public.agent_badges;
create policy agent_badges_agent_read_own
on public.agent_badges
for select
to authenticated
using ((select auth.uid()) = agent_id);

drop policy if exists agent_badges_admin_manage on public.agent_badges;
create policy agent_badges_admin_manage
on public.agent_badges
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.tiers enable row level security;
drop policy if exists tiers_authenticated_read on public.tiers;
create policy tiers_authenticated_read
on public.tiers
for select
to authenticated
using (true);

drop policy if exists tiers_admin_manage on public.tiers;
create policy tiers_admin_manage
on public.tiers
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.user_tiers enable row level security;
drop policy if exists user_tiers_user_read_own on public.user_tiers;
create policy user_tiers_user_read_own
on public.user_tiers
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists user_tiers_admin_manage on public.user_tiers;
create policy user_tiers_admin_manage
on public.user_tiers
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.gifts enable row level security;
drop policy if exists gifts_authenticated_read on public.gifts;
create policy gifts_authenticated_read
on public.gifts
for select
to authenticated
using (true);

drop policy if exists gifts_admin_manage on public.gifts;
create policy gifts_admin_manage
on public.gifts
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.gift_rules enable row level security;
drop policy if exists gift_rules_admin_manage on public.gift_rules;
create policy gift_rules_admin_manage
on public.gift_rules
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.gift_eligibilities enable row level security;
drop policy if exists gift_eligibilities_agent_read_own on public.gift_eligibilities;
create policy gift_eligibilities_agent_read_own
on public.gift_eligibilities
for select
to authenticated
using ((select auth.uid()) = agent_id);

drop policy if exists gift_eligibilities_admin_manage on public.gift_eligibilities;
create policy gift_eligibilities_admin_manage
on public.gift_eligibilities
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.gift_claims enable row level security;
drop policy if exists gift_claims_agent_read_own on public.gift_claims;
create policy gift_claims_agent_read_own
on public.gift_claims
for select
to authenticated
using ((select auth.uid()) = agent_id);

drop policy if exists gift_claims_agent_insert_own on public.gift_claims;
create policy gift_claims_agent_insert_own
on public.gift_claims
for insert
to authenticated
with check ((select auth.uid()) = agent_id);

drop policy if exists gift_claims_admin_manage on public.gift_claims;
create policy gift_claims_admin_manage
on public.gift_claims
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

-- Operational tables flagged by advisor; keep least-privileged paths.
alter table public.tasks enable row level security;
drop policy if exists tasks_agent_read_own on public.tasks;
create policy tasks_agent_read_own
on public.tasks
for select
to authenticated
using ((select auth.uid()) = agent_id);

drop policy if exists tasks_admin_manage on public.tasks;
create policy tasks_admin_manage
on public.tasks
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.notification_events enable row level security;
drop policy if exists notification_events_agent_read_own on public.notification_events;
create policy notification_events_agent_read_own
on public.notification_events
for select
to authenticated
using ((select auth.uid()) = agent_id);

drop policy if exists notification_events_admin_manage on public.notification_events;
create policy notification_events_admin_manage
on public.notification_events
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.system_settings enable row level security;
drop policy if exists system_settings_admin_manage on public.system_settings;
create policy system_settings_admin_manage
on public.system_settings
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

alter table public.deal_status_history enable row level security;
drop policy if exists deal_status_history_agent_read_own on public.deal_status_history;
create policy deal_status_history_agent_read_own
on public.deal_status_history
for select
to authenticated
using (
  exists (
    select 1
    from public.deals d
    where d.id = deal_status_history.deal_id
      and d.agent_id = (select auth.uid())
  )
);

drop policy if exists deal_status_history_admin_manage on public.deal_status_history;
create policy deal_status_history_admin_manage
on public.deal_status_history
for all
to authenticated
using (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
with check (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));

commit;
