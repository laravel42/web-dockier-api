CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
