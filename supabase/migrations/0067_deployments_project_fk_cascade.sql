-- Remove orphaned deployment rows where project_id no longer exists in projects
DELETE FROM deployments
WHERE project_id != ''
  AND project_id NOT IN (SELECT id FROM projects);

-- Remove rows with empty project_id (legacy default) so the FK constraint can be applied
DELETE FROM deployments WHERE project_id = '';

-- Add foreign key with cascade so deleting a project automatically removes its deployments
ALTER TABLE deployments
  ADD CONSTRAINT fk_deployments_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
