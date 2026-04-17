-- Add project_id column to deployments table to link deployments to specific projects
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
