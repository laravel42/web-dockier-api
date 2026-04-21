CREATE TABLE IF NOT EXISTS opengrep_rules (
    id          TEXT PRIMARY KEY,
    app_id      TEXT NOT NULL,
    rule_id     TEXT UNIQUE NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opengrep_rules_app ON opengrep_rules(app_id);
