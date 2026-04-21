CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    app_id          TEXT NOT NULL,
    connection_id   TEXT NOT NULL DEFAULT '',
    name            TEXT NOT NULL,
    repository      TEXT NOT NULL DEFAULT '',
    branch          TEXT NOT NULL DEFAULT '',
    platform        TEXT NOT NULL DEFAULT '',
    source_type     TEXT NOT NULL DEFAULT 'repository',
    template        TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projects_app ON projects(app_id);
