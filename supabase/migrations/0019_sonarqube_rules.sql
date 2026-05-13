CREATE TABLE IF NOT EXISTS sonarqube_rules (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL DEFAULT '',
    rule_id TEXT UNIQUE NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sonarqube_rules_app ON sonarqube_rules(app_id);
