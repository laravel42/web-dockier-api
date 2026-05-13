CREATE TABLE IF NOT EXISTS server_providers (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL,
    label TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    app_runner_connection_arn TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_providers_app ON server_providers(app_id);
