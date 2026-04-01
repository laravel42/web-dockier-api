CREATE TABLE analysis_cache (
    id TEXT PRIMARY KEY,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_analysis_cache_repo_branch ON analysis_cache(repo, branch);
CREATE INDEX idx_analysis_cache_created ON analysis_cache(created_at);
