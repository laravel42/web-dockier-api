CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL REFERENCES server_providers(id),
    git_connection_id TEXT NOT NULL REFERENCES git_connections(id),
    project_id TEXT NOT NULL DEFAULT '',
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    status TEXT NOT NULL DEFAULT 'pending',
    logs TEXT NOT NULL DEFAULT '',
    app_url TEXT NOT NULL DEFAULT '',
    tofu_script TEXT NOT NULL DEFAULT '',
    commit_hash TEXT NOT NULL DEFAULT '',
    docker_image TEXT NOT NULL DEFAULT '',
    deploy_strategy TEXT NOT NULL DEFAULT 'managed',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_org ON deployments(organization_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_repo_commit ON deployments(repo, branch, commit_hash);
