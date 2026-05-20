CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id TEXT,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_org_user ON organization_memberships(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_role ON organization_memberships(role_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_status ON organization_memberships(status);
CREATE INDEX IF NOT EXISTS idx_org_memberships_owner ON organization_memberships(organization_id, is_owner) WHERE is_owner = true;

-- Ensure only one owner per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_memberships_single_owner
  ON organization_memberships(organization_id)
  WHERE is_owner = true;
