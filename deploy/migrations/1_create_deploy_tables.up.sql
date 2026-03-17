CREATE TABLE server_providers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    label TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE deployments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider_id TEXT NOT NULL REFERENCES server_providers(id),
    git_connection_id TEXT NOT NULL,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    status TEXT NOT NULL DEFAULT 'pending',
    logs TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_server_providers_user ON server_providers(user_id);
CREATE INDEX idx_deployments_user ON deployments(user_id);
CREATE INDEX idx_deployments_status ON deployments(status);
