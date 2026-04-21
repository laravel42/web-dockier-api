CREATE TABLE IF NOT EXISTS stack_cache (
    repo        TEXT NOT NULL,
    branch      TEXT NOT NULL DEFAULT 'main',
    project_id  TEXT NOT NULL DEFAULT '',
    result      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stack_cache_repo_branch ON stack_cache(repo, branch);
CREATE INDEX IF NOT EXISTS idx_stack_cache_project ON stack_cache(project_id);
