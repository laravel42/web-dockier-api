CREATE TABLE IF NOT EXISTS analysis_cache (
    id          TEXT PRIMARY KEY,
    app_id      TEXT NOT NULL,
    project_id  TEXT NOT NULL DEFAULT '',
    repo        TEXT NOT NULL,
    branch      TEXT NOT NULL,
    commit_sha  TEXT NOT NULL,
    result      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_cache_repo_branch ON analysis_cache(repo, branch);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_app     ON analysis_cache(app_id);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_project ON analysis_cache(project_id);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_created ON analysis_cache(created_at);
