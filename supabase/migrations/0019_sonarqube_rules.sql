CREATE TABLE IF NOT EXISTS sonarqube_rules (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    rule_id TEXT UNIQUE NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sonarqube_rules_org ON sonarqube_rules(organization_id);
