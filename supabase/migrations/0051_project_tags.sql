-- Project tags: organization-scoped tags that can be assigned to projects.
-- Two tables: tag definitions (org-wide) and assignments (many-to-many).

CREATE TABLE IF NOT EXISTS project_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#3b82f6',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tags_org_name
  ON project_tags (organization_id, name);

CREATE INDEX IF NOT EXISTS idx_project_tags_org
  ON project_tags (organization_id);

CREATE TABLE IF NOT EXISTS project_tag_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id          UUID NOT NULL REFERENCES project_tags(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tag_assignments_unique
  ON project_tag_assignments (project_id, tag_id);

CREATE INDEX IF NOT EXISTS idx_project_tag_assignments_project
  ON project_tag_assignments (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_project_tag_assignments_tag
  ON project_tag_assignments (tag_id);
