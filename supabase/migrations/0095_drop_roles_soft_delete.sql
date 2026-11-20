-- A soft-deleted role (deleted_at set) kept its name in the unique index, so creating
-- a role with that name failed with "already exists" while the list showed no such role.
DROP INDEX IF EXISTS idx_roles_org_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_name_live ON roles(organization_id, name) WHERE deleted_at IS NULL;
