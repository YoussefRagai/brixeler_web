alter table if exists public.admin_rules enable row level security;
alter table if exists public.developer_accounts enable row level security;
alter table if exists public.property_renewal_requests enable row level security;
alter table if exists public.property_expiration_events enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_rules' AND policyname='admin_rules_admin_manage') THEN
    CREATE POLICY admin_rules_admin_manage ON public.admin_rules AS PERMISSIVE FOR ALL TO authenticated
    USING (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
    WITH CHECK (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_rules' AND policyname='admin_rules_service_role') THEN
    CREATE POLICY admin_rules_service_role ON public.admin_rules AS PERMISSIVE FOR ALL TO service_role
    USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='developer_accounts' AND policyname='developer_accounts_read_own') THEN
    CREATE POLICY developer_accounts_read_own ON public.developer_accounts AS PERMISSIVE FOR SELECT TO authenticated
    USING (auth_user_id = (select auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='developer_accounts' AND policyname='developer_accounts_update_own') THEN
    CREATE POLICY developer_accounts_update_own ON public.developer_accounts AS PERMISSIVE FOR UPDATE TO authenticated
    USING (auth_user_id = (select auth.uid())) WITH CHECK (auth_user_id = (select auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='developer_accounts' AND policyname='developer_accounts_admin_manage') THEN
    CREATE POLICY developer_accounts_admin_manage ON public.developer_accounts AS PERMISSIVE FOR ALL TO authenticated
    USING (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
    WITH CHECK (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='developer_accounts' AND policyname='developer_accounts_service_role') THEN
    CREATE POLICY developer_accounts_service_role ON public.developer_accounts AS PERMISSIVE FOR ALL TO service_role
    USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='property_renewal_requests' AND policyname='property_renewal_requests_agent_read_own') THEN
    CREATE POLICY property_renewal_requests_agent_read_own ON public.property_renewal_requests AS PERMISSIVE FOR SELECT TO authenticated
    USING (requested_by_role::text = 'agent' AND requested_by_id = (select auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='property_renewal_requests' AND policyname='property_renewal_requests_agent_insert_own') THEN
    CREATE POLICY property_renewal_requests_agent_insert_own ON public.property_renewal_requests AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (requested_by_role::text = 'agent' AND requested_by_id = (select auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='property_renewal_requests' AND policyname='property_renewal_requests_admin_manage') THEN
    CREATE POLICY property_renewal_requests_admin_manage ON public.property_renewal_requests AS PERMISSIVE FOR ALL TO authenticated
    USING (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
    WITH CHECK (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='property_renewal_requests' AND policyname='property_renewal_requests_service_role') THEN
    CREATE POLICY property_renewal_requests_service_role ON public.property_renewal_requests AS PERMISSIVE FOR ALL TO service_role
    USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='property_expiration_events' AND policyname='property_expiration_events_agent_read_own') THEN
    CREATE POLICY property_expiration_events_agent_read_own ON public.property_expiration_events AS PERMISSIVE FOR SELECT TO authenticated
    USING (exists (select 1 from public.properties p where p.id = property_expiration_events.property_id and p.listed_by_agent_id = (select auth.uid())));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='property_expiration_events' AND policyname='property_expiration_events_admin_manage') THEN
    CREATE POLICY property_expiration_events_admin_manage ON public.property_expiration_events AS PERMISSIVE FOR ALL TO authenticated
    USING (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true))
    WITH CHECK (exists (select 1 from public.admins a where a.id = (select auth.uid()) and a.is_active = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='property_expiration_events' AND policyname='property_expiration_events_service_role') THEN
    CREATE POLICY property_expiration_events_service_role ON public.property_expiration_events AS PERMISSIVE FOR ALL TO service_role
    USING (true) WITH CHECK (true);
  END IF;
END$$;

create index if not exists idx_admin_rules_created_by_admin on public.admin_rules(created_by_admin);
create index if not exists idx_admins_assigned_by on public.admins(assigned_by);
create index if not exists idx_agent_badges_badge_id on public.agent_badges(badge_id);
create index if not exists idx_deal_status_history_changed_by on public.deal_status_history(changed_by);
create index if not exists idx_deals_assigned_to_admin on public.deals(assigned_to_admin);
create index if not exists idx_developer_projects_developer_id on public.developer_projects(developer_id);
create index if not exists idx_gift_claims_agent_id on public.gift_claims(agent_id);
create index if not exists idx_gift_claims_gift_id on public.gift_claims(gift_id);
create index if not exists idx_gift_eligibilities_agent_id on public.gift_eligibilities(agent_id);
create index if not exists idx_gift_rules_gift_id on public.gift_rules(gift_id);
create index if not exists idx_notification_events_agent_id on public.notification_events(agent_id);
create index if not exists idx_properties_project_id on public.properties(project_id);
create index if not exists idx_properties_reviewed_by on public.properties(reviewed_by);
create index if not exists idx_property_renewal_requests_reviewed_by on public.property_renewal_requests(reviewed_by);
create index if not exists idx_saved_properties_property_id on public.saved_properties(property_id);
create index if not exists idx_system_settings_updated_by on public.system_settings(updated_by);
create index if not exists idx_user_tiers_tier_id on public.user_tiers(tier_id);

DO $$
DECLARE
  view_name text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['agent_performance','agent_referral_stats','agent_deal_kpis','property_statistics','deal_pipeline']
  LOOP
    BEGIN
      EXECUTE format('alter view public.%I set (security_invoker = true)', view_name);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping view % due to: %', view_name, SQLERRM;
    END;
  END LOOP;
END$$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('alter function %I.%I(%s) set search_path = public, extensions', rec.schema_name, rec.function_name, rec.args);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping function %.%(%) due to: %', rec.schema_name, rec.function_name, rec.args, SQLERRM;
    END;
  END LOOP;
END$$;
