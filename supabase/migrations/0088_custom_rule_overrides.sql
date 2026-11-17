-- Per-organization on/off for the shared system custom rules.
--
-- System rules live once in custom_rules with organization_id = ''. Toggling one
-- updated that shared row, so one organization's admin switched the rule off or on
-- for every organization. Same shape as opengrep_rules / sonarqube_rules (0018,
-- 0062): keyed by the rule's stable rule_id, unique per organization, which is the
-- upsert's conflict key in rule-overrides.ts.
CREATE TABLE IF NOT EXISTS custom_rule_overrides (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, rule_id)
);

-- Only the backend (secret key, bypasses RLS) touches it; no policies on purpose.
ALTER TABLE custom_rule_overrides ENABLE ROW LEVEL SECURITY;
