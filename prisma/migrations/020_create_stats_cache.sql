CREATE TABLE IF NOT EXISTS stats_cache (
    repo        TEXT NOT NULL,
    branch      TEXT NOT NULL DEFAULT 'main',
    project_id  TEXT NOT NULL DEFAULT '',
    result      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_cache_repo_branch ON stats_cache(repo, branch);
CREATE INDEX IF NOT EXISTS idx_stats_cache_project ON stats_cache(project_id);
