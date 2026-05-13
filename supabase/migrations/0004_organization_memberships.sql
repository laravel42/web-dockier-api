CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_org_user ON organization_memberships(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id);

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_member ON organizations;
CREATE POLICY organizations_select_member
ON organizations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.organization_id = organizations.id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS organizations_insert_any_auth ON organizations;
CREATE POLICY organizations_insert_any_auth
ON organizations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS organization_memberships_select_member ON organization_memberships;
CREATE POLICY organization_memberships_select_member
ON organization_memberships FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM organization_memberships am
    WHERE am.organization_id = organization_memberships.organization_id
      AND am.user_id = auth.uid()
      AND am.role = 'admin'
  )
);

DROP POLICY IF EXISTS organization_memberships_insert_admin ON organization_memberships;
CREATE POLICY organization_memberships_insert_admin
ON organization_memberships FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM organization_memberships am
    WHERE am.organization_id = organization_memberships.organization_id
      AND am.user_id = auth.uid()
      AND am.role = 'admin'
  )
);
