CREATE TABLE IF NOT EXISTS repo_cache (
    connection_id TEXT NOT NULL,
    repos         JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_cache_connection ON repo_cache(connection_id);
