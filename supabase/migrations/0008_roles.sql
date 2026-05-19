-- Roles table: stores per-tenant roles.
-- Default roles (Admin, Member) are seeded per-tenant during organization creation
-- via seedDefaultRoles() in backend/src/services/roles/seed.ts.

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    permissions TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_app ON roles(app_id);
