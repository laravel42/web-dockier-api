CREATE TABLE IF NOT EXISTS stack_cache (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    project_id TEXT DEFAULT '' REFERENCES projects(id) ON DELETE CASCADE,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    result JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stack_cache_repo_branch ON stack_cache(repo, branch);
CREATE INDEX IF NOT EXISTS idx_stack_cache_org ON stack_cache(organization_id);
CREATE INDEX IF NOT EXISTS idx_stack_cache_project ON stack_cache(project_id);
