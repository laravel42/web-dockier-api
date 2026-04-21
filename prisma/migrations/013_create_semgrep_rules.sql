CREATE TABLE IF NOT EXISTS semgrep_rules (
    id              TEXT PRIMARY KEY,
    rule_id         TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    lang            TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'info',
    category        TEXT NOT NULL DEFAULT 'general',
    message         TEXT NOT NULL DEFAULT '',
    yaml_content    TEXT NOT NULL DEFAULT '',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_semgrep_rules_lang     ON semgrep_rules(lang);
CREATE INDEX IF NOT EXISTS idx_semgrep_rules_severity ON semgrep_rules(severity);
