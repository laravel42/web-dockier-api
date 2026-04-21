-- Add type column to differentiate custom regex rules from custom semgrep rules
ALTER TABLE custom_rules ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'custom';
-- Add yaml_content column for semgrep YAML rules
ALTER TABLE custom_rules ADD COLUMN IF NOT EXISTS yaml_content TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_custom_rules_type ON custom_rules(type);
