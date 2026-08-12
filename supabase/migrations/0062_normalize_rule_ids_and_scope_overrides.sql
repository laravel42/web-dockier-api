-- Strip the scanning machine's filesystem path out of stored semgrep rule ids.
--
-- `semgrep --config <absolute dir>` namespaces every rule with that directory,
-- dots for slashes, so findings were stored as
--   Users.oscar.projects.web-dockier-api.code-analysis.rules.opengrep.javascript.browser.security.insecure-document-method
-- while the catalogue the UI lists (and writes overrides against) calls the same
-- rule
--   javascript.browser.security.insecure-document-method
--
-- The two never compared equal, so disabling a rule silently had no effect.
-- scan-analysis.ts now normalizes at parse time; this brings existing rows in line.
--
-- Re-runnable: rows without the marker are left alone.

CREATE OR REPLACE FUNCTION pg_temp.normalize_opengrep_rule_id(rule_id TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN rule_id LIKE '%.code-analysis.rules.opengrep.%'
      THEN substring(
        rule_id from position('.code-analysis.rules.opengrep.' in rule_id)
                  + length('.code-analysis.rules.opengrep.'))
    ELSE rule_id
  END;
$$;

-- ── Findings ────────────────────────────────────────────────────────────────
-- No uniqueness here: many findings legitimately share a rule.
UPDATE findings
SET rule_id = pg_temp.normalize_opengrep_rule_id(rule_id)
WHERE rule_id LIKE '%.code-analysis.rules.opengrep.%';

-- ── Overrides ───────────────────────────────────────────────────────────────
-- The unique constraint is on rule_id ALONE, which is also why the upsert in
-- rule-overrides.ts (onConflict "organization_id,rule_id") matches no index and
-- could never have worked. A global constraint is wrong for a multi-tenant table
-- besides: it lets one organization's override block another's. Replaced with the
-- composite the code already assumes.
--
-- Dropped first so normalization cannot trip the old constraint mid-update.
ALTER TABLE opengrep_rules DROP CONSTRAINT IF EXISTS opengrep_rules_rule_id_key;

-- Normalizing can make two rows collide within one organization: one written
-- with the long id, one with the catalogue id. Keep the disabled row — a user who
-- turned a rule off must not have it switched back on by a migration.
DELETE FROM opengrep_rules
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY organization_id, pg_temp.normalize_opengrep_rule_id(rule_id)
             ORDER BY enabled ASC, created_at ASC, id ASC
           ) AS rn
    FROM opengrep_rules
  ) ranked
  WHERE rn > 1
);

UPDATE opengrep_rules
SET rule_id = pg_temp.normalize_opengrep_rule_id(rule_id)
WHERE rule_id LIKE '%.code-analysis.rules.opengrep.%';

ALTER TABLE opengrep_rules
  ADD CONSTRAINT opengrep_rules_org_rule_id_key UNIQUE (organization_id, rule_id);

-- ── SonarQube overrides ─────────────────────────────────────────────────────
-- Same table shape, same broken constraint, same upsert path in
-- rule-overrides.ts. Its rule ids come from the SonarQube API rather than a
-- filesystem path, so there is nothing to normalize — only the constraint to fix.
ALTER TABLE sonarqube_rules DROP CONSTRAINT IF EXISTS sonarqube_rules_rule_id_key;

DELETE FROM sonarqube_rules
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY organization_id, rule_id
             ORDER BY enabled ASC, created_at ASC, id ASC
           ) AS rn
    FROM sonarqube_rules
  ) ranked
  WHERE rn > 1
);

ALTER TABLE sonarqube_rules
  ADD CONSTRAINT sonarqube_rules_org_rule_id_key UNIQUE (organization_id, rule_id);
