CREATE TABLE repo_cache (
    connection_id TEXT NOT NULL,
    repos JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_repo_cache_connection ON repo_cache(connection_id);
