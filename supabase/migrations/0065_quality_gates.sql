-- Quality gates: pass/fail thresholds applied to a completed scan.
--
-- The SAST worker prototype carried a `quality_gates` table in its own
-- init_db.sql that nothing ever read. This brings the concept into the canonical
-- schema and wires it: the aggregator evaluates the tenant's default gate when a
-- scan finalizes and records the verdict on the scan row.
--
-- Conditions are an array of {metric, operator, threshold}, evaluated against
-- scans.summary. `metric` names a summary key (errors, warnings, infos,
-- totalFindings); `operator` is one of > >= < <= == !=. A condition that MATCHES
-- means the gate FAILED — "errors > 0" reads as "fail the gate when there is any
-- error", which is how the seeded default is written.
--
-- Re-runnable: IF NOT EXISTS throughout, and the seed is ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS quality_gates (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    conditions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_gates_org ON quality_gates(organization_id);

-- At most one default per organization: two defaults would make the gate a
-- coin flip depending on row order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_gates_one_default
    ON quality_gates(organization_id)
    WHERE is_default;

ALTER TABLE scans ADD COLUMN IF NOT EXISTS quality_gate_status TEXT;

COMMENT ON COLUMN scans.quality_gate_status IS
    'Verdict of the organization default quality gate: passed | failed. '
    'NULL when no gate was configured or the scan did not complete.';

-- Seed the built-in system gate (organization_id = '', matching the convention
-- used by custom_rules for system-owned rows).
INSERT INTO quality_gates (id, organization_id, name, is_default, conditions)
VALUES (
    'system-dockier-way',
    '',
    'Dockier way',
    true,
    '[{"metric": "errors", "operator": ">", "threshold": 0}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
