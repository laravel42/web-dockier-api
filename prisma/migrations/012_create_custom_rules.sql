CREATE TABLE IF NOT EXISTS custom_rules (
    id              TEXT PRIMARY KEY,
    app_id          TEXT NOT NULL DEFAULT '',
    rule_id         TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'warning',
    message         TEXT NOT NULL,
    pattern         TEXT NOT NULL DEFAULT '',
    extensions      TEXT[] NOT NULL DEFAULT '{}',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    type            TEXT NOT NULL DEFAULT 'custom',
    yaml_content    TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_rules_app  ON custom_rules(app_id);
CREATE INDEX IF NOT EXISTS idx_custom_rules_type ON custom_rules(type);
