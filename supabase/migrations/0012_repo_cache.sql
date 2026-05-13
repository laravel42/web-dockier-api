CREATE TABLE IF NOT EXISTS repo_cache (
    app_id TEXT NOT NULL DEFAULT '',
    connection_id TEXT NOT NULL,
    repos JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_cache_connection ON repo_cache(connection_id);
CREATE INDEX IF NOT EXISTS idx_repo_cache_app ON repo_cache(app_id);
