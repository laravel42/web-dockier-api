CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT NOT NULL DEFAULT '',
    app_id TEXT NOT NULL DEFAULT '',
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    avatar_url TEXT,
    country TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'en',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    role membership_role,
    role_id TEXT,
    two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
    two_factor_secret TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
CREATE INDEX IF NOT EXISTS idx_users_app ON users(app_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_org_member ON users;
CREATE POLICY users_select_org_member
ON users FOR SELECT
TO authenticated
USING (
  id::uuid = auth.uid()
  OR (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM organization_memberships m
      WHERE m.organization_id = users.organization_id
        AND m.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS users_update_self_or_admin ON users;
CREATE POLICY users_update_self_or_admin
ON users FOR UPDATE
TO authenticated
USING (
  id::uuid = auth.uid()
  OR (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM organization_memberships m
      WHERE m.organization_id = users.organization_id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
    )
  )
)
WITH CHECK (
  id::uuid = auth.uid()
  OR (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM organization_memberships m
      WHERE m.organization_id = users.organization_id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
    )
  )
);
