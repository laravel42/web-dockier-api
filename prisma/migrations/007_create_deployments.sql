CREATE TABLE IF NOT EXISTS deployments (
    id                TEXT PRIMARY KEY,
    app_id            TEXT NOT NULL,
    project_id        TEXT NOT NULL DEFAULT '',
    provider_id       TEXT NOT NULL,
    git_connection_id TEXT NOT NULL,
    repo              TEXT NOT NULL,
    branch            TEXT NOT NULL DEFAULT 'main',
    commit_hash       TEXT NOT NULL DEFAULT '',
    docker_image      TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'pending',
    deploy_strategy   TEXT NOT NULL DEFAULT 'managed',
    app_url           TEXT NOT NULL DEFAULT '',
    logs              TEXT NOT NULL DEFAULT '',
    tofu_script       TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_app        ON deployments(app_id);
CREATE INDEX IF NOT EXISTS idx_deployments_project    ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status     ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_repo_commit ON deployments(repo, branch, commit_hash);
