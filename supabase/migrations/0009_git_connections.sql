CREATE TABLE IF NOT EXISTS git_connections (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL,
    personal_token TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    repo_url TEXT NOT NULL DEFAULT '',
    endpoint TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_git_connections_app ON git_connections(app_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_git_connections_app_provider_label ON git_connections(app_id, provider, label);
