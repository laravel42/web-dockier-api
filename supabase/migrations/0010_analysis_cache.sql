CREATE TABLE IF NOT EXISTS analysis_cache (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    project_id TEXT DEFAULT '' REFERENCES projects(id) ON DELETE CASCADE,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_cache_repo_branch ON analysis_cache(repo, branch);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_created ON analysis_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_org ON analysis_cache(organization_id);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_project ON analysis_cache(project_id);
