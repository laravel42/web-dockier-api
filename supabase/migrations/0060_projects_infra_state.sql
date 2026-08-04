-- Project-level infrastructure lifecycle state.
--
-- Tracks whether a project's cloud infrastructure is currently provisioned.
-- Replaces the previous per-deployment "destroyed" model where destroying one
-- deployment left sibling deployment records showing a stale "success" status.
--
--   none      → never deployed, or infra never provisioned
--   live      → infrastructure is currently provisioned
--   torn_down → infrastructure was fully torn down (project + history retained)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS infra_state TEXT NOT NULL DEFAULT 'none';

-- Best-effort backfill: projects that have at least one successful deployment
-- are assumed to currently have live infrastructure.
UPDATE projects p
SET infra_state = 'live'
WHERE p.infra_state = 'none'
  AND EXISTS (
    SELECT 1 FROM deployments d
    WHERE d.project_id = p.id
      AND d.status = 'success'
  );
