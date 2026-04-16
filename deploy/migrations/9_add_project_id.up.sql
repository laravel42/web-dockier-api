ALTER TABLE deployments ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_deployments_project ON deployments(project_id);
