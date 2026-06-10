-- Roles table: stores per-tenant roles.
-- Default roles (Admin, Member) are seeded per-tenant during organization creation
-- via seedDefaultRoles() in backend/src/services/roles/seed.ts.

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    system_key TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_editable BOOLEAN NOT NULL DEFAULT true,
    is_deletable BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_name ON roles(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_roles_system_key ON roles(organization_id, system_key);
CREATE INDEX IF NOT EXISTS idx_roles_deleted ON roles(deleted_at) WHERE deleted_at IS NULL;
