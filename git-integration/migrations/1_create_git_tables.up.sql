CREATE TABLE git_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    personal_token TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_git_connections_user ON git_connections(user_id);
CREATE UNIQUE INDEX idx_git_connections_user_provider_label ON git_connections(user_id, provider, label);
