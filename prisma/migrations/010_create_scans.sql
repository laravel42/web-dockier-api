CREATE TABLE IF NOT EXISTS scans (
    id              TEXT PRIMARY KEY,
    app_id          TEXT NOT NULL,
    project_id      TEXT NOT NULL,
    connection_id   TEXT NOT NULL,
    repo            TEXT NOT NULL,
    branch          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    summary         JSONB NOT NULL DEFAULT '{}',
    commit_sha      TEXT NOT NULL DEFAULT '',
    commit_message  TEXT NOT NULL DEFAULT '',
    commit_author   TEXT NOT NULL DEFAULT '',
    commit_date     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scans_app     ON scans(app_id);
CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_id);
