CREATE TABLE IF NOT EXISTS custom_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    message TEXT NOT NULL,
    pattern TEXT NOT NULL,
    extensions TEXT[] NOT NULL DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_rules_user ON custom_rules(user_id);
