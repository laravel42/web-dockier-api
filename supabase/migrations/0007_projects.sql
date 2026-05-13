CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL DEFAULT '',
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    repository TEXT NOT NULL DEFAULT '',
    branch TEXT NOT NULL DEFAULT '',
    connection_id TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'repository',
    template TEXT NOT NULL DEFAULT '',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_app ON projects(app_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_select_org_member ON projects;
CREATE POLICY projects_select_org_member
ON projects FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.organization_id = projects.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS projects_write_org_admin ON projects;
CREATE POLICY projects_write_org_admin
ON projects FOR ALL
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.organization_id = projects.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
  )
)
WITH CHECK (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.organization_id = projects.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
  )
);
