CREATE TABLE IF NOT EXISTS sensitive_cache (
    project_id TEXT PRIMARY KEY,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
