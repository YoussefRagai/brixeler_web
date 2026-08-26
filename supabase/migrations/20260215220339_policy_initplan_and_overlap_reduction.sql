-- 1) Normalize auth.uid() calls in all public policies to initplan-friendly form
DO $$
DECLARE
  rec record;
  new_qual text;
  new_check text;
  sql_stmt text;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    new_qual := CASE WHEN rec.qual IS NULL THEN NULL ELSE replace(rec.qual, 'auth.uid()', '(select auth.uid())') END;
    new_check := CASE WHEN rec.with_check IS NULL THEN NULL ELSE replace(rec.with_check, 'auth.uid()', '(select auth.uid())') END;

    IF new_qual IS DISTINCT FROM rec.qual OR new_check IS DISTINCT FROM rec.with_check THEN
      sql_stmt := format('ALTER POLICY %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
      IF new_qual IS NOT NULL THEN
        sql_stmt := sql_stmt || format(' USING (%s)', new_qual);
      END IF;
      IF new_check IS NOT NULL THEN
        sql_stmt := sql_stmt || format(' WITH CHECK (%s)', new_check);
      END IF;
      EXECUTE sql_stmt;
    END IF;
  END LOOP;
END $$;

-- 2) Remove clearly redundant overlapping policies
DROP POLICY IF EXISTS project_favorites_select ON public.project_favorites;
DROP POLICY IF EXISTS property_favorites_select ON public.property_favorites;
DROP POLICY IF EXISTS developer_projects_read ON public.developer_projects;
DROP POLICY IF EXISTS "Public can view approved properties" ON public.properties;

-- 3) Consolidate properties SELECT/UPDATE into single policies (same effective access)
DROP POLICY IF EXISTS "Admins can view all properties" ON public.properties;
DROP POLICY IF EXISTS "Agents can view approved properties plus their own" ON public.properties;

CREATE POLICY properties_select_combined ON public.properties
AS PERMISSIVE FOR SELECT TO public
USING (
  (
    approval_status = 'approved'::property_approval_status
    AND is_active = true
  )
  OR ((select auth.uid()) = listed_by_agent_id)
  OR ((select auth.uid()) IN (
    SELECT admins.id
    FROM public.admins
    WHERE admins.is_active = true
  ))
);

DROP POLICY IF EXISTS "Admins can update properties" ON public.properties;
DROP POLICY IF EXISTS "Agents can update their own pending properties" ON public.properties;

CREATE POLICY properties_update_combined ON public.properties
AS PERMISSIVE FOR UPDATE TO public
USING (
  (
    (select auth.uid()) = listed_by_agent_id
    AND approval_status = 'pending'::property_approval_status
  )
  OR ((select auth.uid()) IN (
    SELECT admins.id
    FROM public.admins
    WHERE admins.is_active = true
  ))
);

-- 4) Merge duplicates where admin ALL + user SELECT were creating extra SELECT policies
-- Keep same behavior by widening existing user SELECT policies to include admin path,
-- then removing admin ALL and recreating only non-SELECT admin policies.

-- agent_badges
ALTER POLICY agent_badges_agent_read_own ON public.agent_badges
USING (
  ((select auth.uid()) = agent_id)
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS agent_badges_admin_manage ON public.agent_badges;
CREATE POLICY agent_badges_admin_insert ON public.agent_badges
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY agent_badges_admin_update ON public.agent_badges
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY agent_badges_admin_delete ON public.agent_badges
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- gift_eligibilities
ALTER POLICY gift_eligibilities_agent_read_own ON public.gift_eligibilities
USING (
  ((select auth.uid()) = agent_id)
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS gift_eligibilities_admin_manage ON public.gift_eligibilities;
CREATE POLICY gift_eligibilities_admin_insert ON public.gift_eligibilities
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY gift_eligibilities_admin_update ON public.gift_eligibilities
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY gift_eligibilities_admin_delete ON public.gift_eligibilities
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- user_tiers
ALTER POLICY user_tiers_user_read_own ON public.user_tiers
USING (
  ((select auth.uid()) = user_id)
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS user_tiers_admin_manage ON public.user_tiers;
CREATE POLICY user_tiers_admin_insert ON public.user_tiers
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY user_tiers_admin_update ON public.user_tiers
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY user_tiers_admin_delete ON public.user_tiers
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- tasks
ALTER POLICY tasks_agent_read_own ON public.tasks
USING (
  ((select auth.uid()) = agent_id)
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS tasks_admin_manage ON public.tasks;
CREATE POLICY tasks_admin_insert ON public.tasks
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY tasks_admin_update ON public.tasks
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY tasks_admin_delete ON public.tasks
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- notification_events
ALTER POLICY notification_events_agent_read_own ON public.notification_events
USING (
  ((select auth.uid()) = agent_id)
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS notification_events_admin_manage ON public.notification_events;
CREATE POLICY notification_events_admin_insert ON public.notification_events
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY notification_events_admin_update ON public.notification_events
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY notification_events_admin_delete ON public.notification_events
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- gift_claims: merge admin into read and insert
ALTER POLICY gift_claims_agent_read_own ON public.gift_claims
USING (
  ((select auth.uid()) = agent_id)
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
ALTER POLICY gift_claims_agent_insert_own ON public.gift_claims
WITH CHECK (
  ((select auth.uid()) = agent_id)
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS gift_claims_admin_manage ON public.gift_claims;
CREATE POLICY gift_claims_admin_update ON public.gift_claims
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY gift_claims_admin_delete ON public.gift_claims
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- property_renewal_requests: merge admin into read and insert
ALTER POLICY property_renewal_requests_agent_read_own ON public.property_renewal_requests
USING (
  (
    (requested_by_role)::text = 'agent'
    AND requested_by_id = (select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
ALTER POLICY property_renewal_requests_agent_insert_own ON public.property_renewal_requests
WITH CHECK (
  (
    (requested_by_role)::text = 'agent'
    AND requested_by_id = (select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS property_renewal_requests_admin_manage ON public.property_renewal_requests;
CREATE POLICY property_renewal_requests_admin_update ON public.property_renewal_requests
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY property_renewal_requests_admin_delete ON public.property_renewal_requests
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- property_expiration_events: merge admin into read
ALTER POLICY property_expiration_events_agent_read_own ON public.property_expiration_events
USING (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_expiration_events.property_id
      AND p.listed_by_agent_id = (select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS property_expiration_events_admin_manage ON public.property_expiration_events;
CREATE POLICY property_expiration_events_admin_insert ON public.property_expiration_events
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY property_expiration_events_admin_update ON public.property_expiration_events
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY property_expiration_events_admin_delete ON public.property_expiration_events
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- tiers: keep one SELECT policy, split admin non-select
DROP POLICY IF EXISTS tiers_authenticated_read ON public.tiers;
CREATE POLICY tiers_read ON public.tiers AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tiers_admin_manage ON public.tiers;
CREATE POLICY tiers_admin_insert ON public.tiers
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY tiers_admin_update ON public.tiers
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY tiers_admin_delete ON public.tiers
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- gifts: keep one SELECT policy, split admin non-select
DROP POLICY IF EXISTS gifts_authenticated_read ON public.gifts;
CREATE POLICY gifts_read ON public.gifts AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS gifts_admin_manage ON public.gifts;
CREATE POLICY gifts_admin_insert ON public.gifts
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY gifts_admin_update ON public.gifts
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY gifts_admin_delete ON public.gifts
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
