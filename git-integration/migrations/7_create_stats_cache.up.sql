CREATE TABLE stats_cache (
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    result JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_stats_cache_repo_branch ON stats_cache(repo, branch);
