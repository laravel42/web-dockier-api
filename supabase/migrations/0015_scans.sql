CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES git_connections(id) ON DELETE CASCADE,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    summary JSONB NOT NULL DEFAULT '{}',
    commit_sha TEXT NOT NULL DEFAULT '',
    commit_message TEXT NOT NULL DEFAULT '',
    commit_author TEXT NOT NULL DEFAULT '',
    commit_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scans_org ON scans(organization_id);
CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_id);
