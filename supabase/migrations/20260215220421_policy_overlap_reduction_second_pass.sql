-- helper admin check expression inlined to preserve semantics

-- commissions: merge SELECT access, split admin ALL
ALTER POLICY "Agents can view their own commissions" ON public.commissions
USING (
  (select auth.uid()) = agent_id
  OR (select auth.uid()) IN (
    SELECT admins.id FROM public.admins WHERE admins.is_active = true
  )
);

DROP POLICY IF EXISTS "Admins can manage all commissions" ON public.commissions;
CREATE POLICY commissions_admin_insert ON public.commissions
AS PERMISSIVE FOR INSERT TO public
WITH CHECK (
  (select auth.uid()) IN (SELECT admins.id FROM public.admins WHERE admins.is_active = true)
);
CREATE POLICY commissions_admin_update ON public.commissions
AS PERMISSIVE FOR UPDATE TO public
USING (
  (select auth.uid()) IN (SELECT admins.id FROM public.admins WHERE admins.is_active = true)
)
WITH CHECK (
  (select auth.uid()) IN (SELECT admins.id FROM public.admins WHERE admins.is_active = true)
);
CREATE POLICY commissions_admin_delete ON public.commissions
AS PERMISSIVE FOR DELETE TO public
USING (
  (select auth.uid()) IN (SELECT admins.id FROM public.admins WHERE admins.is_active = true)
);

-- deals: merge SELECT access
ALTER POLICY "Agents can read their own deals" ON public.deals
USING (
  (select auth.uid()) = agent_id
  OR (select auth.uid()) IN (
    SELECT admins.id FROM public.admins WHERE admins.is_active = true
  )
);
DROP POLICY IF EXISTS "Admins can read all deals" ON public.deals;

-- deal_stage_entries: merge SELECT/UPDATE access then drop duplicate admin policies
ALTER POLICY "deal-stage-select" ON public.deal_stage_entries
USING (
  agent_id = (select auth.uid())
  OR (select auth.uid()) IN (
    SELECT admins.id FROM public.admins WHERE admins.is_active = true
  )
);
ALTER POLICY "deal-stage-update" ON public.deal_stage_entries
USING (
  agent_id = (select auth.uid())
  OR (select auth.uid()) IN (
    SELECT admins.id FROM public.admins WHERE admins.is_active = true
  )
)
WITH CHECK (
  agent_id = (select auth.uid())
  OR (select auth.uid()) IN (
    SELECT admins.id FROM public.admins WHERE admins.is_active = true
  )
);
DROP POLICY IF EXISTS "deal-stage-admin-select" ON public.deal_stage_entries;
DROP POLICY IF EXISTS "deal-stage-admin-update" ON public.deal_stage_entries;

-- deal_status_history: merge SELECT access, split admin ALL to non-SELECT
ALTER POLICY deal_status_history_agent_read_own ON public.deal_status_history
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_status_history.deal_id
      AND d.agent_id = (select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid())
      AND a.is_active = true
  )
);
DROP POLICY IF EXISTS deal_status_history_admin_manage ON public.deal_status_history;
CREATE POLICY deal_status_history_admin_insert ON public.deal_status_history
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY deal_status_history_admin_update ON public.deal_status_history
AS PERMISSIVE FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY deal_status_history_admin_delete ON public.deal_status_history
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));

-- developer_accounts: merge own SELECT/UPDATE with admin path, split admin ALL
ALTER POLICY developer_accounts_read_own ON public.developer_accounts
USING (
  auth_user_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
ALTER POLICY developer_accounts_update_own ON public.developer_accounts
USING (
  auth_user_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
)
WITH CHECK (
  auth_user_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (select auth.uid()) AND a.is_active = true
  )
);
DROP POLICY IF EXISTS developer_accounts_admin_manage ON public.developer_accounts;
CREATE POLICY developer_accounts_admin_insert ON public.developer_accounts
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
CREATE POLICY developer_accounts_admin_delete ON public.developer_accounts
AS PERMISSIVE FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.id = (select auth.uid()) AND a.is_active = true));
