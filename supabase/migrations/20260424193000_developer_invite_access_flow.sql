ALTER TABLE IF EXISTS developer_accounts
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS invited_by_admin_id UUID,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS developer_accounts_developer_id_idx
  ON developer_accounts (developer_id);

CREATE INDEX IF NOT EXISTS developer_accounts_auth_user_id_idx
  ON developer_accounts (auth_user_id);

CREATE INDEX IF NOT EXISTS developer_accounts_status_idx
  ON developer_accounts (status);
