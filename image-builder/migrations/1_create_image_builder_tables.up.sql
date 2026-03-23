CREATE TABLE builds (
    id TEXT PRIMARY KEY,
    codebuild_id TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    source_repo TEXT NOT NULL,
    source_ref TEXT NOT NULL DEFAULT 'main',
    commit_sha TEXT NOT NULL DEFAULT '',
    dockerfile_path TEXT NOT NULL DEFAULT 'Dockerfile',
    build_context TEXT NOT NULL DEFAULT '.',
    image_repo TEXT NOT NULL DEFAULT '',
    image_uri TEXT NOT NULL DEFAULT '',
    cache_repo_uri TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    status_reason TEXT NOT NULL DEFAULT '',
    logs_url TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    build_metadata TEXT NOT NULL DEFAULT '{}',
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_builds_user ON builds(user_id);
CREATE INDEX idx_builds_status ON builds(status);
CREATE INDEX idx_builds_repo_ref ON builds(source_repo, source_ref);
CREATE INDEX idx_builds_commit ON builds(commit_sha);
CREATE INDEX idx_builds_codebuild ON builds(codebuild_id);
