-- Admin roles update and RBAC tables
DO $$
BEGIN
  -- Expand admin_role enum if it exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    BEGIN
      ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'user_auth_admin';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'user_support_admin';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'developers_admin';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'listing_admin';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'deals_admin';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'marketing_admin';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- Admin accounts
CREATE TABLE IF NOT EXISTS admin_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  roles admin_role[] NOT NULL DEFAULT '{super_admin}',
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(auth_user_id)
);

-- Admin activity log
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all admin records via service role (server)
CREATE POLICY admin_accounts_service_role ON admin_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY admin_activity_service_role ON admin_activity_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Optional: allow authenticated admins to read their own account
CREATE POLICY admin_accounts_self_read ON admin_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Optional: allow authenticated admins to read activity log entries
CREATE POLICY admin_activity_read ON admin_activity_log
  FOR SELECT
  TO authenticated
  USING (true);
