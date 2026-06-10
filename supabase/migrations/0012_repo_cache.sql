CREATE TABLE IF NOT EXISTS repo_cache (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    connection_id TEXT NOT NULL REFERENCES git_connections(id) ON DELETE CASCADE,
    repos JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_cache_connection ON repo_cache(connection_id);
CREATE INDEX IF NOT EXISTS idx_repo_cache_org ON repo_cache(organization_id);
